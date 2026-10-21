// Booking draft: the customer's in-progress booking.
//
// * Persisted in sessionStorage, so a refresh or accidental back-navigation does
//   not lose entered information (cleared when the tab closes or on success).
// * Carries an idempotency key created once per draft. Every submit attempt —
//   including retries after a timeout or a closed connection — sends the same
//   key, so the server can never create the booking twice.

import type { LocationType } from '../types';
import { validateAddress, validateCustomerDetails } from '../../supabase/functions/_shared/validation';

export type StepId = 'service' | 'location' | 'time' | 'details' | 'summary';

export const STEPS: { id: StepId; label: string }[] = [
  { id: 'service', label: 'Tjänst' },
  { id: 'location', label: 'Plats' },
  { id: 'time', label: 'Tid' },
  { id: 'details', label: 'Uppgifter' },
  { id: 'summary', label: 'Bekräfta' },
];

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
      return next({ locationType: action.value });
    case 'setAddress':
      return next({ address: { ...state.address, [action.field]: action.value } });
    case 'selectSlot':
      return next({ slot: action.slot });
    case 'setWeek':
      return next({ weekStart: action.weekStart });
    case 'setDetail':
      return next({ details: { ...state.details, [action.field]: action.value } });
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

export function addressErrors(d: Draft) {
  return d.locationType === 'customer_address' ? validateAddress(d.address) : {};
}

export function detailErrors(d: Draft) {
  return validateCustomerDetails(d.details);
}

export function isStepComplete(d: Draft, step: StepId): boolean {
  switch (step) {
    case 'service':
      return Boolean(d.serviceId);
    case 'location':
      return Boolean(d.locationType) && Object.keys(addressErrors(d)).length === 0;
    case 'time':
      return Boolean(d.slot);
    case 'details':
      return Object.keys(detailErrors(d)).length === 0;
    case 'summary':
      return false;
  }
}

/** Furthest step the customer may navigate to, given what is already filled in. */
export function maxReachableIndex(d: Draft): number {
  let i = 0;
  while (i < STEPS.length - 1 && isStepComplete(d, STEPS[i].id)) i++;
  return i;
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
