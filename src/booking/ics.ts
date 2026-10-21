// Creates an .ics calendar file for a booking (client-side, no data leaves the browser).

const toIcsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function buildIcs(opts: {
  reference: string;
  title: string;
  start: string;
  end: string;
  location?: string | null;
  description?: string;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Crescor Bilvard//Bokning//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.reference}@crescor-bilvard`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${toIcsDate(opts.start)}`,
    `DTEND:${toIcsDate(opts.end)}`,
    `SUMMARY:${escape(opts.title)}`,
    opts.location ? `LOCATION:${escape(opts.location)}` : '',
    opts.description ? `DESCRIPTION:${escape(opts.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n') + '\r\n';
}

export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
