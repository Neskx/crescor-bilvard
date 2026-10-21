// Shared validation rules for the booking and contact forms.
//
// Imported by BOTH the browser (src/) and the Edge Functions (Deno). Keep this
// file dependency-free. The database re-validates everything again; these rules
// exist to give users early, specific feedback and to reject junk before it
// reaches the database.

export const LIMITS = {
  name: 100,
  email: 254,
  phone: 40,
  vehicle: 100,
  registration: 10,
  address: 120,
  postalCode: 6,
  city: 60,
  instructions: 500,
  notes: 1000,
  addons: 20,
  contactMessage: 3000,
} as const;

export type LocationType = 'workshop' | 'customer_address';

export interface BookingInput {
  idempotency_key: string;
  service_id: string;
  /** Optional add-on (tillägg) ids. Prices are always taken from the database. */
  addon_ids?: string[];
  start_time: string;
  location_type: LocationType;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  vehicle_information?: string;
  registration_number?: string;
  service_address?: string;
  service_postal_code?: string;
  service_city?: string;
  address_instructions?: string;
  customer_notes?: string;
  privacy_accepted: boolean;
}

export interface ContactInput {
  name: string;
  email: string;
  phone?: string;
  message: string;
}

export type FieldErrors = Partial<Record<string, string>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()-]{6,20}$/;
const POSTAL_RE = /^[0-9]{3} ?[0-9]{2}$/;
const REG_RE = /^[A-ZÅÄÖ0-9 -]{2,10}$/;
// Control characters except tab/newline/carriage return.
// deno-lint-ignore no-control-regex
// oxlint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_RE, '').trim();
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function validateEmail(value: string): string | undefined {
  const v = clean(value);
  if (!v) return 'Ange din e-postadress.';
  if (v.length > LIMITS.email || !EMAIL_RE.test(v)) return 'Ange en giltig e-postadress, till exempel namn@exempel.se.';
  return undefined;
}

export function validatePhone(value: string): string | undefined {
  const v = clean(value);
  if (!v) return 'Ange ditt telefonnummer.';
  const digits = v.replace(/[^0-9]/g, '');
  if (!PHONE_RE.test(v) || digits.length < 6) return 'Ange ett giltigt telefonnummer, till exempel 070-123 45 67.';
  return undefined;
}

export function validateName(value: string): string | undefined {
  const v = clean(value);
  if (!v) return 'Ange ditt namn.';
  if (v.length < 2) return 'Namnet är för kort.';
  if (v.length > LIMITS.name) return `Namnet får vara högst ${LIMITS.name} tecken.`;
  return undefined;
}

export function normalizeRegistration(value: string): string {
  return clean(value).toUpperCase();
}

function maxLen(value: string | undefined, limit: number, label: string): string | undefined {
  return clean(value).length > limit ? `${label} får vara högst ${limit} tecken.` : undefined;
}

/** Validates the customer-details step. Returns a map of field -> Swedish message. */
export function validateCustomerDetails(input: Partial<BookingInput>): FieldErrors {
  const errors: FieldErrors = {};
  const set = (key: string, msg: string | undefined) => {
    if (msg) errors[key] = msg;
  };

  set('customer_name', validateName(input.customer_name ?? ''));
  set('customer_email', validateEmail(input.customer_email ?? ''));
  set('customer_phone', validatePhone(input.customer_phone ?? ''));
  set('vehicle_information', maxLen(input.vehicle_information, LIMITS.vehicle, 'Bilmodell'));
  set('customer_notes', maxLen(input.customer_notes, LIMITS.notes, 'Meddelandet'));

  const reg = normalizeRegistration(input.registration_number ?? '');
  if (reg && !REG_RE.test(reg)) {
    set('registration_number', 'Ange ett giltigt registreringsnummer, till exempel ABC 123.');
  }
  return errors;
}

/** Validates the customer address (only used for mobile appointments). */
export function validateAddress(input: Partial<BookingInput>): FieldErrors {
  const errors: FieldErrors = {};
  const address = clean(input.service_address);
  const postal = clean(input.service_postal_code);
  const city = clean(input.service_city);

  if (!address) errors.service_address = 'Ange gatuadress.';
  else if (address.length > LIMITS.address) errors.service_address = `Adressen får vara högst ${LIMITS.address} tecken.`;

  if (!postal) errors.service_postal_code = 'Ange postnummer.';
  else if (!POSTAL_RE.test(postal)) errors.service_postal_code = 'Postnumret ska bestå av fem siffror, till exempel 123 45.';

  if (!city) errors.service_city = 'Ange ort.';
  else if (city.length > LIMITS.city) errors.service_city = `Orten får vara högst ${LIMITS.city} tecken.`;

  const instr = maxLen(input.address_instructions, LIMITS.instructions, 'Instruktionerna');
  if (instr) errors.address_instructions = instr;
  return errors;
}

/** Full server-side validation of a booking request. */
export function validateBookingInput(raw: unknown): { ok: true; value: BookingInput } | { ok: false; errors: FieldErrors } {
  if (!raw || typeof raw !== 'object') return { ok: false, errors: { _: 'Ogiltig förfrågan.' } };
  const r = raw as Record<string, unknown>;
  const errors: FieldErrors = {};

  if (!isUuid(r.idempotency_key)) errors.idempotency_key = 'Ogiltig förfrågan.';
  if (!isUuid(r.service_id)) errors.service_id = 'Välj en tjänst.';
  let addonIds: string[] = [];
  if (r.addon_ids !== undefined && r.addon_ids !== null) {
    if (!Array.isArray(r.addon_ids) || r.addon_ids.length > LIMITS.addons || !r.addon_ids.every(isUuid)) {
      errors.addon_ids = 'Ogiltiga tillägg.';
    } else {
      addonIds = [...new Set(r.addon_ids.map((id) => id.toLowerCase()))];
    }
  }
  const start = typeof r.start_time === 'string' ? Date.parse(r.start_time) : NaN;
  if (Number.isNaN(start)) errors.start_time = 'Välj en tid.';
  const location = r.location_type;
  if (location !== 'workshop' && location !== 'customer_address') errors.location_type = 'Välj plats.';
  if (r.privacy_accepted !== true) errors.privacy_accepted = 'Du behöver godkänna integritetsinformationen.';

  const value: BookingInput = {
    idempotency_key: String(r.idempotency_key ?? ''),
    service_id: String(r.service_id ?? ''),
    addon_ids: addonIds,
    start_time: typeof r.start_time === 'string' ? new Date(start || 0).toISOString() : '',
    location_type: location as LocationType,
    customer_name: clean(r.customer_name),
    customer_email: clean(r.customer_email).toLowerCase(),
    customer_phone: clean(r.customer_phone),
    vehicle_information: clean(r.vehicle_information) || undefined,
    registration_number: normalizeRegistration(String(r.registration_number ?? '')) || undefined,
    customer_notes: clean(r.customer_notes) || undefined,
    privacy_accepted: r.privacy_accepted === true,
  };

  if (location === 'customer_address') {
    value.service_address = clean(r.service_address);
    value.service_postal_code = clean(r.service_postal_code);
    value.service_city = clean(r.service_city);
    value.address_instructions = clean(r.address_instructions) || undefined;
    Object.assign(errors, validateAddress(value));
  }

  Object.assign(errors, validateCustomerDetails(value));

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function validateContactInput(raw: unknown): { ok: true; value: ContactInput } | { ok: false; errors: FieldErrors } {
  if (!raw || typeof raw !== 'object') return { ok: false, errors: { _: 'Ogiltig förfrågan.' } };
  const r = raw as Record<string, unknown>;
  const value: ContactInput = {
    name: clean(r.name),
    email: clean(r.email).toLowerCase(),
    phone: clean(r.phone) || undefined,
    message: clean(r.message),
  };
  const errors: FieldErrors = {};
  const n = validateName(value.name);
  if (n) errors.name = n;
  const e = validateEmail(value.email);
  if (e) errors.email = e;
  if (value.phone) {
    const p = validatePhone(value.phone);
    if (p) errors.phone = p;
  }
  if (!value.message) errors.message = 'Skriv ett meddelande.';
  else if (value.message.length < 5) errors.message = 'Meddelandet är för kort.';
  else if (value.message.length > LIMITS.contactMessage) errors.message = `Meddelandet får vara högst ${LIMITS.contactMessage} tecken.`;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
