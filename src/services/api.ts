// Public data access. Every call has a timeout and maps failures to ApiError so
// the UI can show a specific, helpful message.

import { supabase, supabaseAnonKey, supabaseConfigured, supabaseUrl } from '../lib/supabase';
import type { BookingResult, LocationType, PublicConfig, Slot } from '../types';
import type { BookingInput, ContactInput, FieldErrors } from '../../supabase/functions/_shared/validation';

export type ApiErrorKind = 'not_configured' | 'offline' | 'timeout' | 'network' | 'server' | 'business';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code: string;
  readonly status?: number;
  readonly fieldErrors?: FieldErrors;
  readonly field?: string;

  constructor(kind: ApiErrorKind, code: string, opts: { status?: number; fieldErrors?: FieldErrors; field?: string } = {}) {
    super(code);
    this.name = 'ApiError';
    this.kind = kind;
    this.code = code;
    this.status = opts.status;
    this.fieldErrors = opts.fieldErrors;
    this.field = opts.field;
  }
}

const READ_TIMEOUT_MS = 12_000;
const WRITE_TIMEOUT_MS = 25_000;

function ensureClient() {
  if (!supabaseConfigured || !supabase) throw new ApiError('not_configured', 'not_configured');
  return supabase;
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function mapThrown(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isOffline()) return new ApiError('offline', 'offline');
  const name = (error as { name?: string })?.name;
  if (name === 'AbortError' || name === 'TimeoutError') return new ApiError('timeout', 'timeout');
  return new ApiError('network', 'network');
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  const db = ensureClient();
  try {
    const { data, error } = await db.rpc('get_public_config').abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
    if (error) throw new ApiError('server', error.code || 'server_error');
    if (!data || typeof data !== 'object' || !('settings' in data)) throw new ApiError('server', 'empty_response');
    const config = data as PublicConfig;
    const list = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return {
      settings: {
        ...config.settings,
        pickup_fee: num(config.settings.pickup_fee),
        mobile_fee: num(config.settings.mobile_fee),
        pickup_postal_prefixes: list(config.settings.pickup_postal_prefixes),
        mobile_postal_prefixes: list(config.settings.mobile_postal_prefixes),
      },
      services: list(config.services).map((v) => ({ ...v, features: list(v.features) })),
      addons: list(config.addons).map((a) => ({ ...a, price: Number(a.price) })),
      business_hours: list(config.business_hours),
      partners: list(config.partners),
      charities: list(config.charities),
      donations: list(config.donations).map((d) => ({ ...d, amount: Number(d.amount) })),
      reviews: list(config.reviews),
    };
  } catch (error) {
    throw mapThrown(error);
  }
}

export async function fetchSlots(serviceId: string, from: string, to: string, location: LocationType | null = null): Promise<Slot[]> {
  const db = ensureClient();
  try {
    const { data, error } = await db
      .rpc('get_available_slots', { p_service_id: serviceId, p_from: from, p_to: to, p_location: location })
      .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
    if (error) throw new ApiError('server', error.code || 'server_error');
    return ((data ?? []) as { slot_start: string; slot_end: string; is_available: boolean }[]).map((r) => ({
      start: new Date(r.slot_start).toISOString(),
      end: new Date(r.slot_end).toISOString(),
      available: Boolean(r.is_available),
    }));
  } catch (error) {
    throw mapThrown(error);
  }
}

/** POSTs to an Edge Function and returns the parsed JSON body (or throws ApiError). */
export async function callFunction<T>(name: string, body: unknown, accessToken?: string): Promise<T> {
  if (!supabaseConfigured) throw new ApiError('not_configured', 'not_configured');
  if (isOffline()) throw new ApiError('offline', 'offline');

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken ?? supabaseAnonKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    });
  } catch (error) {
    throw mapThrown(error);
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (res.ok && payload?.ok === true) return payload as T;

  const code = typeof payload?.code === 'string' ? payload.code : res.status >= 500 ? 'server_error' : 'unknown';
  const kind: ApiErrorKind = res.status >= 500 || !payload ? 'server' : 'business';
  throw new ApiError(kind, code, {
    status: res.status,
    fieldErrors: (payload?.errors as FieldErrors | undefined) ?? undefined,
    field: typeof payload?.field === 'string' ? payload.field : undefined,
  });
}

export function createBooking(input: BookingInput & { captcha_token?: string }): Promise<BookingResult & { ok: true }> {
  return callFunction('create-booking', input);
}

export function sendContactMessage(
  input: ContactInput & { captcha_token?: string; website?: string },
): Promise<{ ok: true; email: string }> {
  return callFunction('contact', input);
}

// ---- Reviews (personal invitation links) -----------------------------------------

export interface ReviewInvitation {
  service_name: string;
  visit_date: string;
  first_name: string;
}

async function reviewRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = ensureClient();
  try {
    const { data, error } = await db.rpc(fn, args).abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));
    if (error) throw new ApiError('server', error.code || 'server_error');
    const r = data as { ok: boolean; code?: string; field?: string } | null;
    if (!r) throw new ApiError('server', 'empty_response');
    if (!r.ok) throw new ApiError('business', r.code ?? 'unknown', { field: r.field });
    return r as T;
  } catch (error) {
    throw mapThrown(error);
  }
}

export function getReviewInvitation(token: string): Promise<ReviewInvitation & { ok: true }> {
  return reviewRpc('get_review_invitation', { p_token: token });
}

export function submitReview(token: string, input: { display_name: string; rating: number; body: string }): Promise<{ ok: true }> {
  return reviewRpc('submit_review', { p_token: token, p_display_name: input.display_name, p_rating: input.rating, p_body: input.body });
}

/** Flags a published review for moderation. Fire-and-forget; never throws. */
export async function reportReview(id: string): Promise<boolean> {
  try {
    const db = ensureClient();
    const { error } = await db.rpc('report_review', { p_id: id }).abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
    return !error;
  } catch {
    return false;
  }
}
