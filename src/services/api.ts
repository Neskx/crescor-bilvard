// Public data access. Every call has a timeout and maps failures to ApiError so
// the UI can show a specific, helpful message.

import { supabase, supabaseAnonKey, supabaseConfigured, supabaseUrl } from '../lib/supabase';
import type { BookingResult, PublicConfig, Slot } from '../types';
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
    return {
      settings: config.settings,
      services: Array.isArray(config.services) ? config.services : [],
      addons: Array.isArray(config.addons) ? config.addons.map((a) => ({ ...a, price: Number(a.price) })) : [],
      business_hours: Array.isArray(config.business_hours) ? config.business_hours : [],
    };
  } catch (error) {
    throw mapThrown(error);
  }
}

export async function fetchSlots(serviceId: string, from: string, to: string): Promise<Slot[]> {
  const db = ensureClient();
  try {
    const { data, error } = await db
      .rpc('get_available_slots', { p_service_id: serviceId, p_from: from, p_to: to })
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
