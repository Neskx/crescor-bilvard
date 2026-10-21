import { describe, expect, it } from 'vitest';
import {
  clean,
  validateAddress,
  validateBookingInput,
  validateContactInput,
  validateCustomerDetails,
  validateEmail,
  validatePhone,
} from '../../supabase/functions/_shared/validation';

const valid = {
  idempotency_key: '0b9b7a8e-5d7a-4f0c-9a51-3c7d1c0e8f11',
  service_id: '2f1d9f2c-1c3b-4a55-8f6e-2a7b9c0d1e2f',
  start_time: '2026-11-03T08:00:00.000Z',
  location_type: 'workshop',
  customer_name: 'Anna Andersson',
  customer_email: 'Anna@Example.se',
  customer_phone: '070-123 45 67',
  privacy_accepted: true,
};

describe('field validators', () => {
  it.each(['namn@exempel.se', 'a.b+c@sub.domain.com'])('accepts email %s', (e) => expect(validateEmail(e)).toBeUndefined());
  it.each(['', 'namn', 'namn@', 'namn@exempel', 'na mn@exempel.se'])('rejects email "%s"', (e) => expect(validateEmail(e)).toBeTruthy());

  it.each(['070-123 45 67', '+46 70 123 45 67', '0701234567', '(040) 12 34 56'])('accepts phone %s', (p) => expect(validatePhone(p)).toBeUndefined());
  it.each(['', '123', 'ring mig', '070-123-45-67-89-00-11-22'])('rejects phone "%s"', (p) => expect(validatePhone(p)).toBeTruthy());

  it('strips control characters and trims', () => {
    expect(clean('  Hej\u0000 där\u0007 ')).toBe('Hej där');
    expect(clean(42)).toBe('');
  });

  it('validates Swedish postal codes and requires address parts', () => {
    expect(validateAddress({ service_address: 'Gatan 1', service_postal_code: '123 45', service_city: 'Malmö' })).toEqual({});
    expect(validateAddress({ service_address: 'Gatan 1', service_postal_code: '12345', service_city: 'Malmö' })).toEqual({});
    const errs = validateAddress({ service_address: '', service_postal_code: '1234', service_city: '' });
    expect(Object.keys(errs).sort()).toEqual(['service_address', 'service_city', 'service_postal_code']);
  });

  it('validates registration numbers case-insensitively', () => {
    expect(validateCustomerDetails({ ...valid, registration_number: 'abc 123' }).registration_number).toBeUndefined();
    expect(validateCustomerDetails({ ...valid, registration_number: 'ÅÄÖ12A' }).registration_number).toBeUndefined();
    expect(validateCustomerDetails({ ...valid, registration_number: '<b>x</b>' }).registration_number).toBeTruthy();
  });

  it('enforces length limits', () => {
    expect(validateCustomerDetails({ ...valid, customer_name: 'x'.repeat(101) }).customer_name).toBeTruthy();
    expect(validateCustomerDetails({ ...valid, customer_notes: 'x'.repeat(1001) }).customer_notes).toBeTruthy();
  });
});

describe('validateBookingInput (server side)', () => {
  it('accepts and normalises a valid workshop booking', () => {
    const r = validateBookingInput(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.customer_email).toBe('anna@example.se');
      expect(r.value.service_address).toBeUndefined();
    }
  });

  it('drops address fields for workshop bookings and requires them for mobile ones', () => {
    const w = validateBookingInput({ ...valid, service_address: 'Ignored 1' });
    expect(w.ok && w.value.service_address).toBeFalsy();
    const m = validateBookingInput({ ...valid, location_type: 'customer_address' });
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.errors.service_address).toBeTruthy();
  });

  it('rejects missing privacy acceptance, bad ids and unknown locations', () => {
    const r = validateBookingInput({ ...valid, privacy_accepted: 'true', service_id: '1; drop table', location_type: 'moon' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(['privacy_accepted', 'service_id', 'location_type']));
  });

  it('rejects non-object payloads', () => {
    expect(validateBookingInput(null).ok).toBe(false);
    expect(validateBookingInput('x').ok).toBe(false);
  });

  it('ignores client-supplied price or duration fields entirely', () => {
    const r = validateBookingInput({ ...valid, price: 1, duration_minutes: 5, status: 'confirmed' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).not.toHaveProperty('price');
      expect(r.value).not.toHaveProperty('duration_minutes');
      expect(r.value).not.toHaveProperty('status');
    }
  });
});

describe('validateContactInput', () => {
  it('accepts a valid message and optional phone', () => {
    expect(validateContactInput({ name: 'Bo', email: 'bo@ex.se', message: 'Hej, en fråga om polering.' }).ok).toBe(true);
  });
  it('rejects an empty or too long message', () => {
    expect(validateContactInput({ name: 'Bo', email: 'bo@ex.se', message: '' }).ok).toBe(false);
    expect(validateContactInput({ name: 'Bo', email: 'bo@ex.se', message: 'x'.repeat(3001) }).ok).toBe(false);
  });
});
