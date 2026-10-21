import { describe, expect, it } from 'vitest';
import {
  adminBookingEmail,
  customerBookingEmail,
  customerStatusEmail,
  escapeHtml,
  formatPrice,
  type TemplateAppointment,
  type TemplateCompany,
} from '../../supabase/functions/_shared/emailTemplates';

const company: TemplateCompany = {
  company_name: 'Crescor Bilvård',
  company_phone: null,
  company_email: 'info@example.se',
  company_address: 'Verkstadsgatan 1, Malmö',
  timezone: 'Europe/Stockholm',
};

const appt: TemplateAppointment = {
  booking_reference: 'CB-ABC234',
  service_name: 'Helrekond',
  price_snapshot: 2995,
  price_type_snapshot: 'from',
  customer_name: '<script>alert(1)</script>',
  customer_email: 'kund@example.se',
  customer_phone: '0701234567',
  vehicle_information: null,
  registration_number: 'ABC123',
  location_type: 'workshop',
  service_address: null,
  service_postal_code: null,
  service_city: null,
  address_instructions: null,
  start_time: '2026-11-03T07:00:00.000Z',
  end_time: '2026-11-03T13:00:00.000Z',
  status: 'pending',
  customer_notes: 'Hund i bilen" onload="x',
};

describe('email templates', () => {
  it('escapes all user-supplied content (no HTML injection)', () => {
    const { html } = customerBookingEmail(appt, company);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(adminBookingEmail(appt, company).html).toContain('Hund i bilen&quot; onload=&quot;x');
    expect(escapeHtml(`<a href="x">'&</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&lt;/a&gt;');
  });

  it('distinguishes pending requests from confirmed bookings', () => {
    expect(customerBookingEmail(appt, company).subject).toContain('Bokningsförfrågan mottagen');
    expect(customerBookingEmail({ ...appt, status: 'confirmed' }, company).subject).toContain('Bokningsbekräftelse');
  });

  it('renders Swedish date/time in Stockholm time and the price', () => {
    const { text } = customerBookingEmail(appt, company);
    expect(text).toContain('Tisdag 3 november 2026');
    expect(text).toContain('08:00–14:00');
    expect(text).toMatch(/Pris: Från 2\s995 kr/); // sv-SE uses a no-break space as thousands separator
    expect(text).toContain('Hos Crescor Bilvård, Verkstadsgatan 1, Malmö');
  });

  it('omits the price when it is "on request"', () => {
    expect(customerBookingEmail({ ...appt, price_type_snapshot: 'on_request' }, company).text).not.toContain('Pris:');
    expect(formatPrice(null, 'fixed')).toBeNull();
  });

  it('lists add-ons and includes them in the price', () => {
    const withAddons = { ...appt, addons: [{ name: 'Luktbehandling', price: 100 }, { name: 'Extra smutsig bil', price: 150 }], addons_total: 250 };
    const text = customerBookingEmail(withAddons, company).text;
    expect(text).toContain('Luktbehandling (+100 kr)');
    expect(text).toMatch(/Pris: Från 3\s245 kr/);
    expect(customerBookingEmail({ ...withAddons, price_type_snapshot: 'on_request' }, company).text).toContain(
      'Pris: Tjänsten enligt offert + tillägg 250 kr',
    );
  });

  it('includes customer contact details only in the admin email', () => {
    expect(customerBookingEmail(appt, company).text).not.toContain('0701234567');
    expect(adminBookingEmail(appt, company).text).toContain('0701234567');
  });

  it('mentions the previous time in rescheduling emails', () => {
    const mail = customerStatusEmail('rescheduled', appt, company, '2026-11-02T09:00:00.000Z');
    expect(mail.text).toContain('från måndag 2 november 2026 kl. 10:00');
    expect(customerStatusEmail('cancelled', appt, company).subject).toContain('Avbokning');
  });
});
