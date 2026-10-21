import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateKeyInZone,
  dayParts,
  diffDays,
  formatDateLong,
  formatDuration,
  formatTime,
  formatWeekRange,
  isValidDateKey,
  isoWeekNumber,
  isoWeekday,
  startOfIsoWeek,
  todayKey,
  weekDays,
  zonedTimeToUtc,
} from '../../src/lib/datetime';

describe('calendar date keys', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29'); // leap year
  });

  it('is unaffected by daylight-saving transitions', () => {
    // DST ends in Sweden on 2026-10-25 and starts on 2027-03-28
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2027-03-27', 2)).toBe('2027-03-29');
    expect(diffDays('2026-10-20', '2026-10-27')).toBe(7);
  });

  it('computes ISO weekdays, week starts and week numbers', () => {
    expect(isoWeekday('2026-10-19')).toBe(1); // Monday
    expect(isoWeekday('2026-10-25')).toBe(7); // Sunday
    expect(startOfIsoWeek('2026-10-25')).toBe('2026-10-19');
    expect(startOfIsoWeek('2026-10-19')).toBe('2026-10-19');
    expect(weekDays('2026-10-19')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(isoWeekNumber('2026-10-12')).toBe(42);
    expect(isoWeekNumber('2026-12-31')).toBe(53);
    expect(isoWeekNumber('2027-01-04')).toBe(1);
  });

  it('validates date keys (rejects malformed query input)', () => {
    expect(isValidDateKey('2026-10-19')).toBe(true);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-1-1')).toBe(false);
    expect(isValidDateKey('<script>')).toBe(false);
    expect(isValidDateKey(undefined)).toBe(false);
  });
});

describe('Europe/Stockholm conversion', () => {
  it('derives the local calendar date of an instant', () => {
    // 23:30 UTC on Oct 20 is already Oct 21 in Stockholm (UTC+2)
    expect(dateKeyInZone('2026-10-20T23:30:00Z')).toBe('2026-10-21');
    expect(dateKeyInZone('2026-12-31T23:30:00Z')).toBe('2027-01-01');
    expect(todayKey('Europe/Stockholm', new Date('2026-10-19T22:15:00Z'))).toBe('2026-10-20');
  });

  it('converts local wall time to UTC in summer and winter time', () => {
    expect(zonedTimeToUtc('2026-10-21', '08:00')).toBe('2026-10-21T06:00:00.000Z'); // CEST
    expect(zonedTimeToUtc('2026-10-26', '08:00')).toBe('2026-10-26T07:00:00.000Z'); // CET
    expect(zonedTimeToUtc('2026-10-25', '08:00')).toBe('2026-10-25T07:00:00.000Z'); // DST end day
    expect(zonedTimeToUtc('2027-03-28', '10:00')).toBe('2027-03-28T08:00:00.000Z'); // DST start day
  });

  it('shifts a nonexistent spring-forward time forward instead of failing', () => {
    // 02:30 does not exist on 2027-03-28 in Stockholm
    const iso = zonedTimeToUtc('2027-03-28', '02:30');
    expect(formatTime(iso)).toBe('03:30');
  });

  it('round-trips formatting', () => {
    const iso = zonedTimeToUtc('2026-11-03', '14:30');
    expect(formatTime(iso)).toBe('14:30');
    expect(formatDateLong(iso)).toBe('Tisdag 3 november 2026');
  });
});

describe('Swedish formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 tim');
    expect(formatDuration(150)).toBe('2 tim 30 min');
  });

  it('formats week ranges within and across months', () => {
    expect(formatWeekRange('2026-10-12')).toBe('12–18 oktober 2026');
    expect(formatWeekRange('2026-09-28')).toBe('28 september – 4 oktober 2026');
    expect(formatWeekRange('2026-12-28')).toBe('28 december 2026 – 3 januari 2027');
  });

  it('gives short day parts', () => {
    expect(dayParts('2026-10-21')).toEqual({ weekday: 'Ons', day: '21', month: 'okt' });
  });
});
