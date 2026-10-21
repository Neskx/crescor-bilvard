import { describe, expect, it } from 'vitest';
import { groupBusinessHours } from '../../src/lib/hours';
import type { BusinessHour } from '../../src/types';

const day = (weekday: number, open: string, close: string, is_closed = false): BusinessHour => ({ weekday, opening_time: open, closing_time: close, is_closed });

describe('groupBusinessHours', () => {
  it('collapses consecutive days with the same hours into ranges', () => {
    const hours = [1, 2, 3, 4, 5].map((d) => day(d, '08:00', '17:00')).concat(day(6, '10:00', '15:00'), day(7, '08:00', '17:00', true));
    expect(groupBusinessHours(hours)).toEqual([
      { days: 'Måndag–fredag', hours: '08:00–17:00', closed: false },
      { days: 'Lördag', hours: '10:00–15:00', closed: false },
      { days: 'Söndag', hours: 'Stängt', closed: true },
    ]);
  });

  it('groups closed days too and does not merge non-adjacent days', () => {
    const hours = [day(1, '08:00', '17:00'), day(2, '09:00', '17:00'), day(3, '08:00', '17:00'), day(6, '', '', true), day(7, '', '', true)];
    expect(groupBusinessHours(hours).map((g) => `${g.days} ${g.hours}`)).toEqual([
      'Måndag 08:00–17:00',
      'Tisdag 09:00–17:00',
      'Onsdag 08:00–17:00',
      'Lördag–söndag Stängt',
    ]);
  });
});
