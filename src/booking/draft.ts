// Booking draft: the customer's in-progress booking.
//
// * Persisted in sessionStorage, so a refresh or accidental back-navigation does
//   not lose entered information (cleared when the tab closes or on success).
// * Carries an idempotency key created once per draft. Every submit attempt —
//   including retries after a timeout or a closed connection — sends the same
//   key, so the server can never create the booking twice.

import type { LocationType } from '../types';
import { validateAddress, validateCustomerDetails } from '../../supabase/functions/_shared/validation';

export type StepId = 'service' | 'location' | 'time' | 'details' | 'charity' | 'summary';

/** Every step, in order. The charity step is only shown when the programme is active. */
export const STEPS: { id: StepId; label: string }[] = [
  { id: 'service', label: 'Tjänst' },
  { id: 'location', label: 'Plats' },
  { id: 'time', label: 'Tid' },
  { id: 'details', label: 'Uppgifter' },
  { id: 'charity', label: 'Ändamål' },
  { id: 'summary', label: 'Bekräfta' },
];

/** Live configuration that affects which steps exist and what counts as complete. */
export interface FlowContext {
  /** Show the "Välj ändamål" step (programme enabled and at least one active cause). */
  charityStep: boolean;
  /** Supported postal-code prefixes. Empty = no restriction. */
  pickupPrefixes: string[];
  mobilePrefixes: string[];
}

export const DEFAULT_CONTEXT: FlowContext = { charityStep: false, pickupPrefixes: [], mobilePrefixes: [] };

export function stepsFor(ctx: FlowContext) {
  return ctx.charityStep ? STEPS : STEPS.filter((s) => s.id !== 'charity');
}

export interface AddressFields {
  service_address: string;
  service_postal_code: string;
  service_city: string;
  address_instructions: string;
}

export interface DetailFields {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  vehicle_information: string;
  registration_number: string;
  customer_notes: string;
}

/** Charity choice: a charity id, 'none' (customer chose not to pick), or null (not decided yet). */
export type CharityChoice = string | 'none' | null;

export interface Draft {
  version: 1;
  step: StepId;
  serviceId: string | null;
  /** Chosen add-ons (tillägg). Optional; never affects the booked duration. */
  addonIds: string[];
  locationType: LocationType | null;
  address: AddressFields;
  slot: { start: string; end: string } | null;
  weekStart: string | null;
  details: DetailFields;
  charity: CharityChoice;
  privacyAccepted: boolean;
  idempotencyKey: string;
  savedAt: number;
}

export type Action =
  | { type: 'selectService'; id: string }
  | { type: 'toggleAddon'; id: string }
  | { type: 'setLocation'; value: LocationType | null }
  | { type: 'setAddress'; field: keyof AddressFields; value: string }
  | { type: 'selectSlot'; slot: { start: string; end: string } | null }
  | { type: 'setWeek'; weekStart: string }
  | { type: 'setDetail'; field: keyof DetailFields; value: string }
  | { type: 'setCharity'; value: CharityChoice }
  | { type: 'setPrivacy'; value: boolean }
  | { type: 'goTo'; step: StepId }
  | { type: 'reset' }
  | { type: 'repair'; patch: Partial<Draft> };

const STORAGE_KEY = 'crescor-booking-draft';
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function emptyDraft(): Draft {
  return {
    version: 1,
    step: 'service',
    serviceId: null,
    addonIds: [],
    locationType: null,
    address: { service_address: '', service_postal_code: '', service_city: '', address_instructions: '' },
    slot: null,
    weekStart: null,
    details: {
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      vehicle_information: '',
      registration_number: '',
      customer_notes: '',
    },
    charity: null,
    privacyAccepted: false,
    idempotencyKey: uuid(),
    savedAt: Date.now(),
  };
}

export function reducer(state: Draft, action: Action): Draft {
  const next = (patch: Partial<Draft>): Draft => ({ ...state, ...patch, savedAt: Date.now() });
  switch (action.type) {
    case 'selectService':
      // A different service has a different duration, so a chosen time no longer applies.
      return state.serviceId === action.id ? state : next({ serviceId: action.id, slot: null });
    case 'toggleAddon':
      return next({
        addonIds: state.addonIds.includes(action.id)
          ? state.addonIds.filter((x) => x !== action.id)
          : [...state.addonIds, action.id],
      });
    case 'setLocation':
      // Travel time differs per location, so a chosen time no longer applies.
      return state.locationType === action.value ? state : next({ locationType: action.value, slot: null });
    case 'setAddress':
      return next({ address: { ...state.address, [action.field]: action.value } });
    case 'selectSlot':
      return next({ slot: action.slot });
    case 'setWeek':
      return next({ weekStart: action.weekStart });
    case 'setDetail':
      return next({ details: { ...state.details, [action.field]: action.value } });
    case 'setCharity':
      return next({ charity: action.value });
    case 'setPrivacy':
      return next({ privacyAccepted: action.value });
    case 'goTo':
      return next({ step: action.step });
    case 'reset':
      return emptyDraft();
    case 'repair':
      return next(action.patch);
  }
}

// ---- Step completeness -------------------------------------------------------

export const needsAddress = (t: LocationType | null) => t === 'pickup' || t === 'customer_address';

/** True when no zones are configured or the postal code starts with one of them. */
export function postalSupported(postal: string, prefixes: string[]): boolean {
  if (!prefixes.length) return true;
  const digits = postal.replace(/\s/g, '');
  return prefixes.some((p) => digits.startsWith(p));
}

export function addressErrors(d: Draft, ctx: FlowContext = DEFAULT_CONTEXT) {
  if (!needsAddress(d.locationType)) return {};
  const errors = validateAddress(d.address);
  const prefixes = d.locationType === 'pickup' ? ctx.pickupPrefixes : ctx.mobilePrefixes;
  if (!errors.service_postal_code && !postalSupported(d.address.service_postal_code, prefixes)) {
    errors.service_postal_code =
      d.locationType === 'pickup'
        ? 'Vi hämtar tyvärr inte bilar i det här postnummerområdet. Välj ett annat alternativ eller kontakta oss.'
        : 'Vi erbjuder tyvärr inte tvätt på plats i det här postnummerområdet. Välj ett annat alternativ eller kontakta oss.';
  }
  return errors;
}

export function detailErrors(d: Draft) {
  return validateCustomerDetails(d.details);
}

export function isStepComplete(d: Draft, step: StepId, ctx: FlowContext = DEFAULT_CONTEXT): boolean {
  switch (step) {
    case 'service':
      return Boolean(d.serviceId);
    case 'location':
      return Boolean(d.locationType) && Object.keys(addressErrors(d, ctx)).length === 0;
    case 'time':
      return Boolean(d.slot);
    case 'details':
      return Object.keys(detailErrors(d)).length === 0;
    case 'charity':
      return !ctx.charityStep || d.charity !== null;
    case 'summary':
      return false;
  }
}

/** Furthest step (index into stepsFor(ctx)) the customer may navigate to. */
export function maxReachableIndex(d: Draft, ctx: FlowContext = DEFAULT_CONTEXT): number {
  const steps = stepsFor(ctx);
  let i = 0;
  while (i < steps.length - 1 && isStepComplete(d, steps[i].id, ctx)) i++;
  return i;
}

/** The step after / before `step` in the current flow. */
export function nextStep(step: StepId, ctx: FlowContext, delta: 1 | -1 = 1): StepId {
  const steps = stepsFor(ctx);
  const i = steps.findIndex((s) => s.id === step);
  return steps[Math.min(steps.length - 1, Math.max(0, i + delta))].id;
}

// ---- Persistence ---------------------------------------------------------------

export function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (
      parsed?.version !== 1 ||
      typeof parsed.idempotencyKey !== 'string' ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > MAX_AGE_MS ||
      !STEPS.some((s) => s.id === parsed.step)
    ) {
      return emptyDraft();
    }
    const base = emptyDraft();
    return {
      ...base,
      ...parsed,
      address: { ...base.address, ...(parsed.address ?? {}) },
      details: { ...base.details, ...(parsed.details ?? {}) },
      addonIds: Array.isArray(parsed.addonIds) ? parsed.addonIds.filter((x) => typeof x === 'string') : [],
      charity: typeof parsed.charity === 'string' ? parsed.charity : null,
    } as Draft;
  } catch {
    return emptyDraft();
  }
}

export function saveDraft(d: Draft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable (private mode / quota) — the flow still works in memory */
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
