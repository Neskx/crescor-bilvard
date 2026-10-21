// Integration tests for the booking database layer: availability, validation,
// overlap prevention (incl. true concurrency), RLS and admin RPCs.
//
// They run against the LOCAL Supabase database only and clean up after
// themselves. All test bookings use @db-test.invalid e-mail addresses.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { addDays, startOfIsoWeek, todayKey, zonedTimeToUtc } from '../../src/lib/datetime';

const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55422/postgres';
if (/supabase\.co|pooler\.supabase\.com/.test(DB_URL)) throw new Error('Refusing to run DB tests against a hosted Supabase project.');

const pool = new pg.Pool({ connectionString: DB_URL, max: 20 });
const q = (text: string, params: unknown[] = []) => pool.query(text, params);

// Weeks 6–8 from now: inside the 60-day horizon, away from E2E test bookings.
const MONDAY = addDays(startOfIsoWeek(todayKey()), 42);
const at = (dayOffset: number, time: string) => zonedTimeToUtc(addDays(MONDAY, dayOffset), time);

let serviceId: string; // Placeholder main service, set to 180 min + 30 min buffer for the tests
let originalSettings: Record<string, unknown>;

const booking = (over: Record<string, unknown> = {}) => ({
  idempotency_key: randomUUID(),
  service_id: serviceId,
  start_time: at(1, '08:00'),
  location_type: 'workshop',
  customer_name: 'DB Test',
  customer_email: `t-${randomUUID().slice(0, 8)}@db-test.invalid`,
  customer_phone: '070-000 00 00',
  privacy_accepted: true,
  ...over,
});

async function createBooking(p: Record<string, unknown>) {
  const { rows } = await q('select public.create_booking($1::jsonb) as r', [JSON.stringify(p)]);
  return rows[0].r as { ok: boolean; code?: string; booking_reference?: string; appointment_id?: string; duplicate?: boolean; status?: string };
}

/** Runs `fn` inside a transaction as the given API role, then rolls back. */
async function asRole<T>(role: 'anon' | 'authenticated', sub: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
    await c.query(`set local role ${role}`);
    return await fn(c);
  } finally {
    await c.query('rollback');
    c.release();
  }
}

beforeAll(async () => {
  const { rows } = await q(`select * from public.business_settings where id = 1`);
  originalSettings = rows[0];
  await q(`update public.business_settings set booking_enabled = true, workshop_service_enabled = true, mobile_service_enabled = false,
           company_address = coalesce(company_address, 'Testgatan 1'), auto_confirm = false, booking_notice_hours = 12,
           booking_horizon_days = 90, slot_interval_minutes = 30, timezone = 'Europe/Stockholm' where id = 1`);
  await q(`update public.business_hours set is_closed = false, opening_time = '08:00', closing_time = '17:00' where weekday between 1 and 5`);
  await q(`update public.business_hours set is_closed = true where weekday = 7`);
  const svc = await q(`select id from public.services where slug = 'biltvatt'`);
  serviceId = svc.rows[0].id;
  await q(`update public.services set duration_minutes = 180, buffer_minutes = 30, is_active = true where id = $1`, [serviceId]);
  await q(`delete from public.appointments where customer_email like '%@db-test.invalid'`);
  await q(`delete from public.blocked_dates where reason = 'db-test'`);
});

afterAll(async () => {
  await q(`delete from public.appointments where customer_email like '%@db-test.invalid' or customer_email = 'anonymiserad@invalid' and customer_name = 'Anonymiserad' and created_at > now() - interval '1 hour'`);
  await q(`delete from public.blocked_dates where reason = 'db-test'`);
  const s = originalSettings;
  await q(
    `update public.business_settings set booking_enabled=$1, workshop_service_enabled=$2, mobile_service_enabled=$3, company_address=$4,
     auto_confirm=$5, booking_notice_hours=$6, booking_horizon_days=$7, slot_interval_minutes=$8 where id = 1`,
    [s.booking_enabled, s.workshop_service_enabled, s.mobile_service_enabled, s.company_address, s.auto_confirm, s.booking_notice_hours, s.booking_horizon_days, s.slot_interval_minutes],
  );
  await pool.end();
});

describe('availability', () => {
  it('generates grid slots inside opening hours that fit the service duration', async () => {
    const { rows } = await q(`select * from public.get_available_slots($1, $2, $2)`, [serviceId, addDays(MONDAY, 2)]);
    const starts = rows.map((r) => new Date(r.slot_start).toISOString());
    expect(starts[0]).toBe(at(2, '08:00'));
    // 180-minute service must end by 17:00 → last start 14:00
    expect(starts[starts.length - 1]).toBe(at(2, '14:00'));
    expect(rows).toHaveLength(13);
    expect(rows.every((r) => r.is_available)).toBe(true);
  });

  it('returns nothing on closed days and limits the range to 14 days', async () => {
    const sunday = await q(`select * from public.get_available_slots($1, $2, $2)`, [serviceId, addDays(MONDAY, 6)]);
    expect(sunday.rows).toHaveLength(0);
    await expect(q(`select * from public.get_available_slots($1, $2, $3)`, [serviceId, MONDAY, addDays(MONDAY, 20)])).rejects.toThrow(/range_too_large/);
  });

  it('handles the daylight-saving change (08:00 local is 07:00 UTC after it ends)', async () => {
    // Uses a fixed DST date, computed relative to compute_slots via a date in the past → all "past", but times still correct.
    const { rows } = await q(`select slot_start from private.compute_slots($1, '2026-10-23'::date, '2026-10-26'::date) order by 1`, [serviceId]);
    const firsts = new Map<string, string>();
    for (const r of rows) {
      const iso = new Date(r.slot_start).toISOString();
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(new Date(iso));
      if (!firsts.has(day)) firsts.set(day, iso);
    }
    expect(firsts.get('2026-10-23')).toBe('2026-10-23T06:00:00.000Z'); // CEST
    expect(firsts.get('2026-10-26')).toBe('2026-10-26T07:00:00.000Z'); // CET
  });
});

describe('create_booking rules', () => {
  it('creates a pending booking with a reference and trusted server-side duration', async () => {
    const r = await createBooking(booking({ start_time: at(0, '08:00'), duration_minutes: 5, price: 0 }));
    expect(r.ok).toBe(true);
    expect(r.status).toBe('pending');
    expect(r.booking_reference).toMatch(/^CB-[A-Z0-9]{6}$/);
    const { rows } = await q(`select end_time, blocked_until, price_snapshot from public.appointments where id = $1`, [r.appointment_id]);
    expect(new Date(rows[0].end_time).toISOString()).toBe(at(0, '11:00'));
    expect(new Date(rows[0].blocked_until).toISOString()).toBe(at(0, '11:30'));
  });

  it('blocks overlapping slots including the buffer, and frees the slot after it', async () => {
    const { rows } = await q(`select slot_start, is_available from public.get_available_slots($1, $2, $2)`, [serviceId, MONDAY]);
    const avail = new Map(rows.map((r) => [new Date(r.slot_start).toISOString(), r.is_available]));
    expect(avail.get(at(0, '08:00'))).toBe(false);
    expect(avail.get(at(0, '10:30'))).toBe(false); // overlaps 08:00–11:30
    expect(avail.get(at(0, '11:00'))).toBe(false); // inside the buffer
    expect(avail.get(at(0, '11:30'))).toBe(true);
    // A new booking that would end inside an existing one is also blocked
    expect((await createBooking(booking({ start_time: at(0, '08:00') }))).code).toBe('slot_unavailable');
  });

  it.each([
    ['outside opening hours', { start_time: at(1, '06:00') }, 'outside_business_hours'],
    ['not on the slot grid', { start_time: at(1, '08:10') }, 'outside_business_hours'],
    ['would end after closing', { start_time: at(1, '15:00') }, 'outside_business_hours'],
    ['in the past', { start_time: new Date(Date.now() - 86_400_000).toISOString() }, 'outside_business_hours'],
    ['without privacy acceptance', { privacy_accepted: false }, 'privacy_not_accepted'],
    ['with an invalid email', { customer_email: 'nope' }, 'invalid_input'],
    ['with an invalid phone', { customer_phone: 'abc' }, 'invalid_input'],
    ['at a disabled location', { location_type: 'customer_address', service_address: 'A 1', service_postal_code: '12345', service_city: 'X' }, 'location_unavailable'],
    ['for an unknown service', { service_id: randomUUID() }, 'service_unavailable'],
    ['with a malformed service id', { service_id: "x' or 1=1 --" }, 'invalid_input'],
  ])('rejects a booking %s', async (_label, over, code) => {
    expect((await createBooking(booking(over))).code).toBe(code);
  });

  it('rejects bookings inside the notice period', async () => {
    const tomorrow = addDays(todayKey(), 1);
    await q(`update public.business_settings set booking_notice_hours = 720 where id = 1`);
    try {
      const { rows } = await q(`select slot_start from private.compute_slots($1, $2, $3) where reason = 'too_soon' limit 1`, [serviceId, tomorrow, addDays(tomorrow, 6)]);
      expect(rows.length).toBeGreaterThan(0);
      expect((await createBooking(booking({ start_time: new Date(rows[0].slot_start).toISOString() }))).code).toBe('too_soon');
    } finally {
      await q(`update public.business_settings set booking_notice_hours = 12 where id = 1`);
    }
  });

  it('rejects bookings on blocked dates and while booking is disabled', async () => {
    await q(`insert into public.blocked_dates (start_time, end_time, reason) values ($1, $2, 'db-test')`, [at(3, '00:00'), at(4, '00:00')]);
    expect((await createBooking(booking({ start_time: at(3, '09:00') }))).code).toBe('slot_unavailable');
    await q(`update public.business_settings set booking_enabled = false where id = 1`);
    expect((await createBooking(booking({ start_time: at(2, '09:00') }))).code).toBe('booking_disabled');
    await q(`update public.business_settings set booking_enabled = true where id = 1`);
  });

  it('rejects bookings for a service disabled mid-booking', async () => {
    await q(`update public.services set is_active = false where id = $1`, [serviceId]);
    try {
      expect((await createBooking(booking({ start_time: at(2, '12:00') }))).code).toBe('service_unavailable');
    } finally {
      await q(`update public.services set is_active = true where id = $1`, [serviceId]);
    }
  });

  it('is idempotent: retrying with the same key returns the same booking', async () => {
    const p = booking({ start_time: at(2, '08:00') });
    const first = await createBooking(p);
    const second = await createBooking({ ...p, start_time: at(2, '13:00') });
    expect(first.ok && second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.booking_reference).toBe(first.booking_reference);
    const { rows } = await q(`select count(*)::int as n from public.appointments where idempotency_key = $1`, [p.idempotency_key]);
    expect(rows[0].n).toBe(1);
  });

  it('limits active bookings per email address', async () => {
    const email = `limit-${randomUUID().slice(0, 6)}@db-test.invalid`;
    // Four non-overlapping slots on separate days
    const results = [];
    for (const day of [14, 15, 16, 17]) results.push(await createBooking(booking({ customer_email: email, start_time: at(day, '08:00') })));
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    expect(results[3].code).toBe('rate_limited');
  });
});

describe('add-ons', () => {
  it('snapshots chosen add-ons with server-side prices and ignores duplicates', async () => {
    const { rows } = await q(`select id, price from public.addons where slug in ('djurhar', 'luktbehandling') order by slug`);
    const ids = rows.map((r) => r.id);
    const r = await createBooking(booking({ start_time: at(4, '08:00'), addon_ids: [...ids, ids[0]] }));
    expect(r.ok).toBe(true);
    const appt = await q(`select addons, addons_total from public.appointments where id = $1`, [r.appointment_id]);
    expect(appt.rows[0].addons).toHaveLength(2);
    expect(Number(appt.rows[0].addons_total)).toBe(200);
  });

  it('rejects unknown, inactive and malformed add-ons', async () => {
    expect((await createBooking(booking({ start_time: at(4, '13:00'), addon_ids: [randomUUID()] }))).code).toBe('addon_unavailable');
    expect((await createBooking(booking({ start_time: at(4, '13:00'), addon_ids: ['nope'] }))).code).toBe('invalid_input');
    expect((await createBooking(booking({ start_time: at(4, '13:00'), addon_ids: 'x' }))).code).toBe('invalid_input');
    const { rows } = await q(`select id from public.addons where slug = 'flackborttagning'`);
    await q(`update public.addons set is_active = false where id = $1`, [rows[0].id]);
    try {
      expect((await createBooking(booking({ start_time: at(4, '13:00'), addon_ids: [rows[0].id] }))).code).toBe('addon_unavailable');
    } finally {
      await q(`update public.addons set is_active = true where id = $1`, [rows[0].id]);
    }
  });

  it('exposes only active add-ons in the public config', async () => {
    const { rows } = await q(`select public.get_public_config() -> 'addons' as a`);
    expect(rows[0].a.length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(rows[0].a[0]).sort()).toEqual(['description', 'id', 'name', 'price', 'slug']);
  });
});

describe('concurrency', () => {
  it('exactly one of 12 simultaneous requests for the same slot succeeds', async () => {
    const start = at(8, '09:00');
    const results = await Promise.all(Array.from({ length: 12 }, () => createBooking(booking({ start_time: start }))));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => r.code === 'slot_unavailable')).toHaveLength(11);
  });

  it('the exclusion constraint rejects overlaps even when bypassing the function', async () => {
    const { rows } = await q(`select service_name from public.appointments where start_time = $1 and status = 'pending'`, [at(8, '09:00')]);
    expect(rows).toHaveLength(1);
    await expect(
      q(
        `insert into public.appointments (booking_reference, service_id, service_name, customer_name, customer_email, customer_phone, location_type, start_time, end_time, blocked_until, status)
         values ('CB-ZZZZZZ', $1, 'x', 'x', 'x@db-test.invalid', '000000', 'workshop', $2, $3, $3, 'confirmed')`,
        [serviceId, at(8, '10:00'), at(8, '11:00')],
      ),
    ).rejects.toThrow(/no_overlapping_active_appointments/);
  });
});

describe('row level security', () => {
  it('anonymous users cannot read or write tables, or call create_booking directly', async () => {
    await asRole('anon', null, async (c) => {
      await expect(c.query('select * from public.appointments')).rejects.toThrow(/permission denied/);
    });
    await asRole('anon', null, async (c) => {
      await expect(c.query(`select public.create_booking('{}'::jsonb)`)).rejects.toThrow(/permission denied/);
    });
    await asRole('anon', null, async (c) => {
      await expect(c.query(`update public.services set price = 1`)).rejects.toThrow(/permission denied/);
    });
    await asRole('anon', null, async (c) => {
      await expect(c.query(`select private.apply_retention()`)).rejects.toThrow(/permission denied/);
    });
  });

  it('anonymous users can read the public config and availability, without personal data', async () => {
    await asRole('anon', null, async (c) => {
      const cfg = await c.query('select public.get_public_config() as c');
      expect(JSON.stringify(cfg.rows[0].c)).not.toMatch(/db-test\.invalid|notification_email|retention_days/);
      const slots = await c.query('select * from public.get_available_slots($1, $2, $2)', [serviceId, MONDAY]);
      expect(Object.keys(slots.rows[0])).toEqual(['slot_start', 'slot_end', 'is_available']);
    });
  });

  it('a signed-in user who is not an admin sees nothing and cannot use admin RPCs', async () => {
    await asRole('authenticated', randomUUID(), async (c) => {
      const r = await c.query('select count(*)::int as n from public.appointments');
      expect(r.rows[0].n).toBe(0);
    });
    await asRole('authenticated', randomUUID(), async (c) => {
      await expect(c.query(`select public.admin_set_appointment_status($1, 'cancelled')`, [randomUUID()])).rejects.toThrow(/forbidden/);
    });
    await asRole('authenticated', randomUUID(), async (c) => {
      const r = await c.query(`update public.business_settings set booking_enabled = false where id = 1`);
      expect(r.rowCount).toBe(0);
    });
  });

  it('an admin can read bookings and manage them through the RPCs', async () => {
    const admin = await q(`select user_id from public.admin_users limit 1`);
    if (!admin.rows.length) return; // no admin created locally
    const sub = admin.rows[0].user_id;
    const r = await createBooking(booking({ start_time: at(9, '08:00') }));
    const other = await createBooking(booking({ start_time: at(9, '13:00') }));
    await asRole('authenticated', sub, async (c) => {
      const rows = await c.query('select id from public.appointments where id = $1', [r.appointment_id]);
      expect(rows.rows).toHaveLength(1);
      // Rescheduling into another booking is refused
      const clash = await c.query('select public.admin_reschedule_appointment($1, $2, false) as r', [r.appointment_id, at(9, '13:00')]);
      expect(clash.rows[0].r.code).toBe('slot_unavailable');
      // Rescheduling to a free slot works, keeping duration
      const ok = await c.query('select public.admin_reschedule_appointment($1, $2, false) as r', [r.appointment_id, at(10, '08:00')]);
      expect(ok.rows[0].r.ok).toBe(true);
      // Admin override may ignore opening hours but never overlaps
      const late = await c.query('select public.admin_reschedule_appointment($1, $2, true) as r', [r.appointment_id, at(10, '18:00')]);
      expect(late.rows[0].r.ok).toBe(true);
      // Cancel, then re-activation conflicts if the time is taken
      const cancel = await c.query(`select public.admin_set_appointment_status($1, 'cancelled') as r`, [other.appointment_id]);
      expect(cancel.rows[0].r.ok).toBe(true);
      // Anonymising an active future booking is refused
      const anon = await c.query('select public.admin_anonymize_appointment($1) as r', [r.appointment_id]);
      expect(anon.rows[0].r.code).toBe('still_active');
    });
  });
});

describe('privacy retention', () => {
  it('anonymises bookings older than the retention period', async () => {
    const r = await createBooking(booking({ start_time: at(11, '08:00') }));
    // Move it into the distant past directly (test only)
    await q(`update public.appointments set start_time = now() - interval '800 days', end_time = now() - interval '800 days' + interval '3 hours',
             blocked_until = now() - interval '800 days' + interval '3 hours', status = 'completed' where id = $1`, [r.appointment_id]);
    const res = await q('select private.apply_retention() as r');
    expect(res.rows[0].r.anonymized_appointments).toBeGreaterThanOrEqual(1);
    const { rows } = await q('select customer_name, customer_email, anonymized_at from public.appointments where id = $1', [r.appointment_id]);
    expect(rows[0].customer_name).toBe('Anonymiserad');
    expect(rows[0].anonymized_at).not.toBeNull();
    await q('delete from public.appointments where id = $1', [r.appointment_id]);
  });
});
