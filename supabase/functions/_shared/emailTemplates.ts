// Swedish, brand-consistent email templates. Pure functions (no Deno APIs) so
// they can be unit tested from Node. ALL dynamic values are HTML-escaped.

export interface TemplateCompany {
  company_name: string;
  company_phone: string | null;
  company_email: string | null;
  company_address: string | null;
  timezone: string;
  /** Absolute URL of the logo image; when absent a text header is used. */
  logo_url?: string | null;
}

export interface TemplateAppointment {
  booking_reference: string;
  service_name: string;
  price_snapshot: number | null;
  price_type_snapshot: 'fixed' | 'from' | 'on_request';
  /** Snapshot of the chosen add-ons (tillägg). Absent on older bookings. */
  addons?: { name: string; price: number }[] | null;
  addons_total?: number | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  vehicle_information: string | null;
  registration_number: string | null;
  location_type: 'workshop' | 'customer_address';
  service_address: string | null;
  service_postal_code: string | null;
  service_city: string | null;
  address_instructions: string | null;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  customer_notes: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(iso: string, timeZone: string): string {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatPrice(price: number | null, type: 'fixed' | 'from' | 'on_request'): string | null {
  if (type === 'on_request' || price === null) return null;
  const amount = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Number(price));
  return type === 'from' ? `Från ${amount} kr` : `${amount} kr`;
}

function formatAmount(value: number): string {
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Number(value))} kr`;
}

/** Total price including add-ons, or null when there is nothing to show. */
export function totalPriceText(a: Pick<TemplateAppointment, 'price_snapshot' | 'price_type_snapshot' | 'addons_total'>): string | null {
  const extras = Number(a.addons_total ?? 0);
  if (a.price_type_snapshot === 'on_request' || a.price_snapshot === null) {
    return extras > 0 ? `Tjänsten enligt offert + tillägg ${formatAmount(extras)}` : null;
  }
  return formatPrice(Number(a.price_snapshot) + extras, a.price_type_snapshot);
}

function locationText(a: TemplateAppointment, c: TemplateCompany): string {
  if (a.location_type === 'workshop') {
    return c.company_address ? `Hos ${c.company_name}, ${c.company_address}` : `Hos ${c.company_name}`;
  }
  return [a.service_address, [a.service_postal_code, a.service_city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

type Row = [label: string, value: string | null | undefined];

function detailRows(a: TemplateAppointment, c: TemplateCompany, opts: { includeCustomer: boolean }): Row[] {
  const rows: Row[] = [
    ['Bokningsnummer', a.booking_reference],
    ['Tjänst', a.service_name],
    ['Datum', formatDate(a.start_time, c.timezone)],
    ['Tid', `${formatTime(a.start_time, c.timezone)}–${formatTime(a.end_time, c.timezone)}`],
    ['Plats', locationText(a, c)],
  ];
  if (a.addons?.length) {
    rows.push(['Tillägg', a.addons.map((x) => `${x.name} (+${formatAmount(x.price)})`).join('\n')]);
  }
  rows.push(['Pris', totalPriceText(a)]);
  if (a.location_type === 'customer_address') rows.push(['Instruktioner', a.address_instructions]);
  rows.push(['Bil', a.vehicle_information], ['Registreringsnummer', a.registration_number]);
  if (opts.includeCustomer) {
    rows.push(['Kund', a.customer_name], ['E-post', a.customer_email], ['Telefon', a.customer_phone]);
  }
  rows.push(['Meddelande', a.customer_notes]);
  return rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
}

function layout(c: TemplateCompany, heading: string, introHtml: string, rows: Row[], footerNote: string): string {
  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;color:#a5a5a5;font-size:13px;width:42%;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;color:#ffffff;font-size:14px;vertical-align:top;">${escapeHtml(value).replace(/\n/g, '<br>')}</td>
        </tr>`,
    )
    .join('');

  const contact = [c.company_phone, c.company_email].filter(Boolean).map(escapeHtml).join(' &nbsp;·&nbsp; ');

  return `<!doctype html>
<html lang="sv">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#080808;font-family:Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141414;border:1px solid #2a2a2a;">
        <tr><td style="padding:32px 32px 20px;border-bottom:1px solid #2a2a2a;">
          ${
            c.logo_url
              ? `<img src="${escapeHtml(c.logo_url)}" alt="${escapeHtml(c.company_name)}" width="200" style="display:block;width:200px;max-width:100%;height:auto;border:0;">`
              : `<div style="font-size:20px;letter-spacing:6px;color:#e6e6e6;font-weight:bold;">CRESCOR</div>
          <div style="font-size:10px;letter-spacing:6px;color:#8a8a8a;margin-top:4px;">BILVÅRD</div>`
          }
        </td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:bold;">${escapeHtml(heading)}</h1>
          <div style="color:#cfcfcf;font-size:15px;line-height:1.6;">${introHtml}</div>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
        </td></tr>
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #2a2a2a;color:#8a8a8a;font-size:12px;line-height:1.6;">
          ${escapeHtml(footerNote)}${contact ? `<br>${contact}` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function textVersion(heading: string, intro: string, rows: Row[], footer: string, c: TemplateCompany): string {
  const contact = [c.company_phone, c.company_email].filter(Boolean).join(' · ');
  return [
    c.company_name.toUpperCase(),
    '',
    heading,
    '',
    intro,
    '',
    ...rows.map(([l, v]) => `${l}: ${v}`),
    '',
    footer,
    contact,
  ].join('\n');
}

function contactLine(c: TemplateCompany): string {
  return c.company_phone || c.company_email
    ? 'Behöver du ändra eller avboka? Kontakta oss och ange ditt bokningsnummer.'
    : 'Behöver du ändra eller avboka? Svara på detta mejl och ange ditt bokningsnummer.';
}

export function customerBookingEmail(a: TemplateAppointment, c: TemplateCompany): RenderedEmail {
  const confirmed = a.status === 'confirmed';
  const heading = confirmed ? 'Din bokning är bekräftad' : 'Vi har tagit emot din bokningsförfrågan';
  const intro = confirmed
    ? `Hej ${a.customer_name}! Tack för din bokning. Här är detaljerna för ditt besök.`
    : `Hej ${a.customer_name}! Tack för din förfrågan. Tiden är reserverad åt dig och vi bekräftar bokningen så snart vi har gått igenom den.`;
  const rows = detailRows(a, c, { includeCustomer: false });
  const footer = contactLine(c);
  return {
    subject: `${confirmed ? 'Bokningsbekräftelse' : 'Bokningsförfrågan mottagen'} ${a.booking_reference} – ${c.company_name}`,
    html: layout(c, heading, escapeHtml(intro), rows, footer),
    text: textVersion(heading, intro, rows, footer, c),
  };
}

export function adminBookingEmail(a: TemplateAppointment, c: TemplateCompany): RenderedEmail {
  const heading = a.status === 'confirmed' ? 'Ny bokning (bekräftad)' : 'Ny bokningsförfrågan att bekräfta';
  const intro =
    a.status === 'confirmed'
      ? 'En ny bokning har gjorts via webbplatsen.'
      : 'En ny bokningsförfrågan har kommit in via webbplatsen. Logga in i administrationen för att bekräfta den.';
  const rows = detailRows(a, c, { includeCustomer: true });
  const footer = 'Detta är ett automatiskt meddelande från bokningssystemet.';
  return {
    subject: `${a.status === 'confirmed' ? 'Ny bokning' : 'Ny förfrågan'} ${a.booking_reference}: ${a.service_name}, ${formatDate(a.start_time, c.timezone)} ${formatTime(a.start_time, c.timezone)}`,
    html: layout(c, heading, escapeHtml(intro), rows, footer),
    text: textVersion(heading, intro, rows, footer, c),
  };
}

export function customerStatusEmail(
  kind: 'confirmed' | 'cancelled' | 'rescheduled',
  a: TemplateAppointment,
  c: TemplateCompany,
  previousStart?: string | null,
): RenderedEmail {
  let heading: string;
  let intro: string;
  let subject: string;
  if (kind === 'confirmed') {
    heading = 'Din bokning är bekräftad';
    intro = `Hej ${a.customer_name}! Vi har bekräftat din bokning. Välkommen!`;
    subject = `Bokningsbekräftelse ${a.booking_reference} – ${c.company_name}`;
  } else if (kind === 'cancelled') {
    heading = 'Din bokning har avbokats';
    intro = `Hej ${a.customer_name}! Din bokning nedan har avbokats. Kontakta oss gärna om du vill boka en ny tid.`;
    subject = `Avbokning ${a.booking_reference} – ${c.company_name}`;
  } else {
    heading = 'Din bokning har flyttats';
    const prev = previousStart ? ` från ${formatDate(previousStart, c.timezone).toLowerCase()} kl. ${formatTime(previousStart, c.timezone)}` : '';
    intro = `Hej ${a.customer_name}! Din bokning har flyttats${prev}. Den nya tiden framgår nedan.`;
    subject = `Ny tid för bokning ${a.booking_reference} – ${c.company_name}`;
  }
  const rows = detailRows(a, c, { includeCustomer: false });
  const footer = contactLine(c);
  return { subject, html: layout(c, heading, escapeHtml(intro), rows, footer), text: textVersion(heading, intro, rows, footer, c) };
}

export function adminContactEmail(
  m: { name: string; email: string; phone?: string | null; message: string },
  c: TemplateCompany,
): RenderedEmail {
  const heading = 'Nytt meddelande via kontaktformuläret';
  const rows: Row[] = [
    ['Namn', m.name],
    ['E-post', m.email],
    ['Telefon', m.phone ?? null],
    ['Meddelande', m.message],
  ].filter(([, v]) => v) as Row[];
  const footer = 'Svara direkt på detta mejl för att svara avsändaren.';
  return {
    subject: `Kontaktformulär: ${m.name}`,
    html: layout(c, heading, '', rows, footer),
    text: textVersion(heading, '', rows, footer, c),
  };
}
