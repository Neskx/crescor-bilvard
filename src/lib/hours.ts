import type { BusinessHour } from '../types';

const DAY_NAMES = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];

export interface HoursGroup {
  /** e.g. "Måndag–fredag" or "Lördag" */
  days: string;
  /** e.g. "08:00–17:00" or "Stängt" */
  hours: string;
  closed: boolean;
}

/**
 * Collapses consecutive weekdays with identical hours into ranges:
 * Mon–Fri 08–17, Sat 10–15, Sun closed  →  three rows instead of seven.
 */
export function groupBusinessHours(hours: BusinessHour[]): HoursGroup[] {
  const sorted = [...hours].sort((a, b) => a.weekday - b.weekday);
  const key = (h: BusinessHour) => (h.is_closed ? 'closed' : `${h.opening_time}–${h.closing_time}`);
  const groups: { start: number; end: number; key: string; closed: boolean }[] = [];

  for (const h of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.key === key(h) && h.weekday === last.end + 1) last.end = h.weekday;
    else groups.push({ start: h.weekday, end: h.weekday, key: key(h), closed: h.is_closed });
  }

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return groups.map((g) => ({
    days: g.start === g.end ? cap(DAY_NAMES[g.start - 1]) : `${cap(DAY_NAMES[g.start - 1])}–${DAY_NAMES[g.end - 1]}`,
    hours: g.closed ? 'Stängt' : g.key,
    closed: g.closed,
  }));
}
