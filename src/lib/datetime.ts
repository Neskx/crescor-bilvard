// Date helpers for the booking calendar.
//
// Calendar days are handled as plain "YYYY-MM-DD" keys in the business timezone
// (Europe/Stockholm). Arithmetic on keys is done at UTC noon, which is immune to
// daylight-saving shifts. Instants (slot times) are ISO strings in UTC and are
// only converted to local time for display.

export const DEFAULT_TZ = 'Europe/Stockholm';

const pad = (n: number) => String(n).padStart(2, '0');

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Calendar date ("YYYY-MM-DD") of an instant in the given timezone. */
export function dateKeyInZone(instant: Date | string, timeZone = DEFAULT_TZ): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const p = partsInZone(d, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function todayKey(timeZone = DEFAULT_TZ, now: Date = new Date()): string {
  return dateKeyInZone(now, timeZone);
}

export function isValidDateKey(key: unknown): key is string {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = keyToUtcNoon(key);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

function keyToUtcNoon(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function addDays(key: string, days: number): string {
  const d = keyToUtcNoon(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(key: string): number {
  const day = keyToUtcNoon(key).getUTCDay();
  return day === 0 ? 7 : day;
}

export function startOfIsoWeek(key: string): string {
  return addDays(key, 1 - isoWeekday(key));
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function isoWeekNumber(key: string): number {
  const d = keyToUtcNoon(key);
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 4 - isoWeekday(key));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1, 12));
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function diffDays(a: string, b: string): number {
  return Math.round((keyToUtcNoon(b).getTime() - keyToUtcNoon(a).getTime()) / 86_400_000);
}

/** Timezone offset (ms) of `timeZone` at `instant`: local = utc + offset. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Converts a local wall-clock time in `timeZone` to a UTC ISO string.
 * Handles daylight-saving transitions (nonexistent times shift forward).
 */
export function zonedTimeToUtc(dateKey: string, time: string, timeZone = DEFAULT_TZ): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let result = guess - zoneOffsetMs(new Date(guess), timeZone);
  const second = guess - zoneOffsetMs(new Date(result), timeZone);
  if (second !== result) result = second;
  return new Date(result).toISOString();
}

// ---- Formatting (Swedish) ---------------------------------------------------

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatTime(iso: string, timeZone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** "Onsdag 21 oktober 2026" */
export function formatDateLong(iso: string, timeZone = DEFAULT_TZ): string {
  return cap(
    new Intl.DateTimeFormat('sv-SE', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
      new Date(iso),
    ),
  );
}

/** For a date key: "Onsdag 21 oktober" */
export function formatDayLong(key: string): string {
  return cap(
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(keyToUtcNoon(key)),
  );
}

/** For a date key: { weekday: "Ons", day: "21", month: "okt" } */
export function dayParts(key: string) {
  const d = keyToUtcNoon(key);
  const weekday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', weekday: 'short' }).format(d).replace('.', '');
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', month: 'short' }).format(d).replace('.', '');
  return { weekday: cap(weekday), day: String(d.getUTCDate()), month };
}

/** "12–18 oktober 2026" or "28 september – 4 oktober 2026" */
export function formatWeekRange(monday: string): string {
  const sunday = addDays(monday, 6);
  const a = keyToUtcNoon(monday);
  const b = keyToUtcNoon(sunday);
  const month = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', month: 'long' }).format(d);
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${month(b)} ${b.getUTCFullYear()}`;
  }
  const yearA = a.getUTCFullYear() !== b.getUTCFullYear() ? ` ${a.getUTCFullYear()}` : '';
  return `${a.getUTCDate()} ${month(a)}${yearA} – ${b.getUTCDate()} ${month(b)} ${b.getUTCFullYear()}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} tim ${m} min`;
  if (h) return `${h} tim`;
  return `${m} min`;
}

export function formatDateTimeShort(iso: string, timeZone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
