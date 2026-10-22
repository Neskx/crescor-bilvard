import { describe, expect, it } from 'vitest';
import {
  addressErrors,
  emptyDraft,
  isStepComplete,
  maxReachableIndex,
  nextStep,
  postalSupported,
  reducer,
  stepsFor,
  type Draft,
  type FlowContext,
} from '../../src/booking/draft';
import { locationAvailable, locationFee } from '../../src/booking/locations';
import { FALLBACK_SETTINGS } from '../../src/config/site';
import { validateBookingInput } from '../../supabase/functions/_shared/validation';
import { customerBookingEmail, reviewInviteEmail, totalPriceText, type TemplateAppointment } from '../../supabase/functions/_shared/emailTemplates';
import type { PublicSettings, Service } from '../../src/types';

const withCharity: FlowContext = { charityStep: true, pickupPrefixes: ['211'], mobilePrefixes: [] };
const withoutCharity: FlowContext = { charityStep: false, pickupPrefixes: [], mobilePrefixes: [] };

const ready = (): Draft => {
  let d = emptyDraft();
  d = reducer(d, { type: 'selectService', id: 'svc' });
  d = reducer(d, { type: 'setLocation', value: 'pickup' });
  for (const [field, value] of [
    ['service_address', 'Gatan 1'],
    ['service_postal_code', '211 45'],
    ['service_city', 'Malmö'],
  ] as const) {
    d = reducer(d, { type: 'setAddress', field, value });
  }
  d = reducer(d, { type: 'selectSlot', slot: { start: '2026-11-03T08:00:00.000Z', end: '2026-11-03T10:00:00.000Z' } });
  for (const [field, value] of [
    ['customer_name', 'Anna Andersson'],
    ['customer_email', 'anna@example.se'],
    ['customer_phone', '0701234567'],
  ] as const) {
    d = reducer(d, { type: 'setDetail', field, value });
  }
  return d;
};

describe('booking steps', () => {
  it('includes the charity step only when the programme is active', () => {
    expect(stepsFor(withCharity).map((s) => s.id)).toEqual(['service', 'location', 'time', 'details', 'charity', 'summary']);
    expect(stepsFor(withoutCharity).map((s) => s.id)).toEqual(['service', 'location', 'time', 'details', 'summary']);
    expect(nextStep('details', withoutCharity)).toBe('summary');
    expect(nextStep('details', withCharity)).toBe('charity');
    expect(nextStep('summary', withCharity, -1)).toBe('charity');
  });

  it('requires a charity decision ("none" counts) before the summary, when shown', () => {
    const d = ready();
    expect(maxReachableIndex(d, withCharity)).toBe(4); // stops at "charity"
    expect(isStepComplete(reducer(d, { type: 'setCharity', value: 'none' }), 'charity', withCharity)).toBe(true);
    expect(maxReachableIndex(reducer(d, { type: 'setCharity', value: 'c-1' }), withCharity)).toBe(5);
    expect(maxReachableIndex(d, withoutCharity)).toBe(4); // summary, no charity needed
  });

  it('needs an address for pickup and on-site, but not for the workshop', () => {
    let d = reducer(emptyDraft(), { type: 'setLocation', value: 'pickup' });
    expect(Object.keys(addressErrors(d))).toContain('service_address');
    d = reducer(d, { type: 'setLocation', value: 'workshop' });
    expect(addressErrors(d)).toEqual({});
  });

  it('enforces postal-code zones per location', () => {
    expect(postalSupported('211 45', ['211'])).toBe(true);
    expect(postalSupported('12345', ['211', '212'])).toBe(false);
    expect(postalSupported('12345', [])).toBe(true);
    const d = reducer(ready(), { type: 'setAddress', field: 'service_postal_code', value: '123 45' });
    expect(addressErrors(d, withCharity).service_postal_code).toMatch(/postnummerområde/);
  });

  it('clears the chosen time when the location changes (travel time differs)', () => {
    const d = ready();
    expect(reducer(d, { type: 'setLocation', value: 'pickup' }).slot).not.toBeNull();
    expect(reducer(d, { type: 'setLocation', value: 'workshop' }).slot).toBeNull();
  });
});

describe('location options', () => {
  const settings: PublicSettings = { ...FALLBACK_SETTINGS, workshop_available: true, pickup_available: true, mobile_available: false, pickup_fee: 199, mobile_fee: null };
  const premium = { allow_workshop: true, allow_pickup: false, allow_mobile: false } as Service;

  it('combines the global switch with per-service availability', () => {
    expect(locationAvailable(settings, premium, 'workshop')).toEqual({ enabled: true, allowed: true });
    expect(locationAvailable(settings, premium, 'pickup')).toEqual({ enabled: true, allowed: false });
    expect(locationAvailable(settings, premium, 'customer_address').enabled).toBe(false);
  });

  it('never invents a fee', () => {
    expect(locationFee(settings, 'pickup')).toBe(199);
    expect(locationFee(settings, 'customer_address')).toBeNull();
    expect(locationFee(settings, 'workshop')).toBeNull();
  });
});

describe('server-side input validation', () => {
  const base = {
    idempotency_key: '9b2f8d64-4c1e-4f63-9d0e-2f7f7a0b1c11',
    service_id: '1b2f8d64-4c1e-4f63-9d0e-2f7f7a0b1c12',
    start_time: '2026-11-03T08:00:00.000Z',
    customer_name: 'Anna',
    customer_email: 'anna@example.se',
    customer_phone: '0701234567',
    privacy_accepted: true,
  };

  it('accepts pickup with an address and an optional charity id', () => {
    const r = validateBookingInput({ ...base, location_type: 'pickup', service_address: 'Gatan 1', service_postal_code: '21145', service_city: 'Malmö', charity_id: '2b2f8d64-4c1e-4f63-9d0e-2f7f7a0b1c13' });
    expect(r.ok).toBe(true);
  });

  it('rejects pickup without address and malformed charity ids', () => {
    const r = validateBookingInput({ ...base, location_type: 'pickup', charity_id: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(['service_address', 'charity_id']));
  });
});

describe('email templates', () => {
  const appt: TemplateAppointment = {
    booking_reference: 'CB-ABC234',
    service_name: 'Mini Rekond',
    price_snapshot: 1200,
    price_type_snapshot: 'fixed',
    addons: [],
    addons_total: 0,
    location_fee: 199,
    charity_name: 'Svenska Röda Korset',
    customer_name: 'Anna',
    customer_email: 'anna@example.se',
    customer_phone: '0701234567',
    vehicle_information: null,
    registration_number: null,
    location_type: 'pickup',
    service_address: 'Gatan 1',
    service_postal_code: '211 45',
    service_city: 'Malmö',
    address_instructions: null,
    start_time: '2026-11-03T08:00:00.000Z',
    end_time: '2026-11-03T11:30:00.000Z',
    status: 'pending',
    customer_notes: null,
  };
  const company = { company_name: 'Crescor Bilvård', company_phone: null, company_email: null, company_address: null, timezone: 'Europe/Stockholm' };

  it('includes the location fee in the total and names the chosen cause — without any amount', () => {
    expect(totalPriceText(appt)?.replace(/\s/g, ' ')).toBe('1 399 kr');
    const mail = customerBookingEmail(appt, company);
    expect(mail.text).toContain('Vi hämtar bilen: Gatan 1, 211 45 Malmö');
    expect(mail.text).toContain('Valt ändamål: Svenska Röda Korset');
    expect(mail.text).not.toMatch(/%|procent/i);
  });

  it('builds an escaped review invitation with the personal link', () => {
    const mail = reviewInviteEmail({ ...appt, customer_name: '<b>Anna</b>' }, company, 'https://example.se/recension?t=abc"><x');
    expect(mail.html).not.toContain('<b>Anna</b>');
    expect(mail.html).toContain('href="https://example.se/recension?t=abc&quot;&gt;&lt;x"');
    expect(mail.text).toContain('Lämna en recension: https://example.se/recension?t=abc');
  });
});
