// Integration tests for Phase 2: service packages, pickup / on-site locations
// with travel time, postal-code zones, location fees, charity preferences,
// reviews and the new admin tables.
//
// LOCAL Supabase only. Cleans up after itself; test bookings use @db-test.invalid.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { addDays, startOfIsoWeek, todayKey, zonedTimeToUtc } from '../../src/lib/datetime';

const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55422/postgres';
if (/supabase\.co|pooler\.supabase\.com/.test(DB_URL)) throw new Error('Refusing to run DB tests against a hosted Supabase project.');

const pool = new pg.Pool({ connectionString: DB_URL, max: 10 });
const q = (text: string, params: unknown[] = []) => pool.query(text, params);

// Weeks 10–11 from now: away from the other DB tests and E2E bookings.
const MONDAY = addDays(startOfIsoWeek(todayKey()), 70);
const at = (dayOffset: number, time: string) => zonedTimeToUtc(addDays(MONDAY, dayOffset), time);

let enkel: string;
let mini: string;
let premium: string;
let originalSettings: Record<string, unknown>;
let originalServices: Record<string, unknown>[];
const adminId = randomUUID();

const address = { service_address: 'Testvägen 3', service_postal_code: '211 45', service_city: 'Malmö', address_instructions: 'Porten mot gården' };

const booking = (over: Record<string, unknown> = {}) => ({
  idempotency_key: randomUUID(),
  service_id: enkel,
  start_time: at(0, '09:00'),
  location_type: 'workshop',
  customer_name: 'Fas Två',
  customer_email: `p2-${randomUUID().slice(0, 8)}@db-test.invalid`,
  customer_phone: '070-000 00 00',
  privacy_accepted: true,
  ...over,
});

type Result = { ok: boolean; code?: string; field?: string; appointment_id?: string; duplicate?: boolean; location_fee?: string | number | null; charity_name?: string | null };

async function createBooking(p: Record<string, unknown>): Promise<Result> {
  const { rows } = await q('select public.create_booking($1::jsonb) as r', [JSON.stringify(p)]);
  return rows[0].r;
}

async function slots(serviceId: string, day: number, location: string | null) {
  const { rows } = await q('select slot_start, is_available from public.get_available_slots($1, $2, $2, $3)', [serviceId, addDays(MONDAY, day), location]);
  return new Map(rows.map((r) => [new Date(r.slot_start).toISOString(), r.is_available as boolean]));
}

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
  originalSettings = (await q(`select * from public.business_settings where id = 1`)).rows[0];
  originalServices = (await q(`select id, duration_minutes, buffer_minutes, is_active, allow_workshop, allow_pickup, allow_mobile from public.services`)).rows;
  await q(`update public.business_settings set booking_enabled = true, workshop_service_enabled = true, mobile_service_enabled = true,
           pickup_service_enabled = true, company_address = coalesce(company_address, 'Testgatan 1'), auto_confirm = false,
           booking_notice_hours = 12, booking_horizon_days = 120, slot_interval_minutes = 30, timezone = 'Europe/Stockholm',
           pickup_travel_minutes = 30, mobile_travel_minutes = 30, pickup_fee = null, mobile_fee = null,
           pickup_postal_prefixes = '{}', mobile_postal_prefixes = '{}', charity_enabled = true where id = 1`);
  await q(`update public.business_hours set is_closed = false, opening_time = '08:00', closing_time = '17:00' where weekday between 1 and 5`);
  const ids = (await q(`select slug, id from public.services where slug in ('enkel-tvatt', 'mini-rekond', 'premium-rekond')`)).rows;
  const id = (slug: string) => ids.find((r) => r.slug === slug)!.id as string;
  enkel = id('enkel-tvatt');
  mini = id('mini-rekond');
  premium = id('premium-rekond');
  await q(`update public.services set duration_minutes = 120, buffer_minutes = 30, is_active = true, allow_workshop = true, allow_pickup = true, allow_mobile = true where id = $1`, [enkel]);
  await q(`update public.services set duration_minutes = 210, buffer_minutes = 30, is_active = true where id = $1`, [mini]);
  await q(`update public.services set duration_minutes = 300, buffer_minutes = 30, is_active = true, allow_mobile = false where id = $1`, [premium]);
  await q(`delete from public.appointments where customer_email like 'p2-%@db-test.invalid'`);
  // A local administrator for RLS tests.
  await q(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [adminId, `admin-${adminId.slice(0, 8)}@db-test.invalid`]);
  await q(`insert into public.admin_users (user_id) values ($1)`, [adminId]);
});

afterAll(async () => {
  await q(`delete from public.reviews where appointment_id in (select id from public.appointments where customer_email like 'p2-%@db-test.invalid')`);
  await q(`delete from public.appointments where customer_email like 'p2-%@db-test.invalid'`);
  await q(`delete from public.partners where name like 'DB-test%'`);
  await q(`delete from public.donation_allocations where accounting_period like 'DB-test%'`);
  await q(`delete from public.admin_users where user_id = $1`, [adminId]);
  await q(`delete from auth.users where id = $1`, [adminId]);
  const s = originalSettings;
  await q(
    `update public.business_settings set booking_enabled=$1, workshop_service_enabled=$2, mobile_service_enabled=$3, pickup_service_enabled=$4,
     company_address=$5, booking_horizon_days=$6, pickup_travel_minutes=$7, mobile_travel_minutes=$8, pickup_fee=$9, mobile_fee=$10,
     pickup_postal_prefixes=$11, mobile_postal_prefixes=$12, charity_enabled=$13 where id = 1`,
    [s.booking_enabled, s.workshop_service_enabled, s.mobile_service_enabled, s.pickup_service_enabled, s.company_address, s.booking_horizon_days,
     s.pickup_travel_minutes, s.mobile_travel_minutes, s.pickup_fee, s.mobile_fee, s.pickup_postal_prefixes, s.mobile_postal_prefixes, s.charity_enabled],
  );
  for (const v of originalServices) {
    await q(`update public.services set duration_minutes=$2, buffer_minutes=$3, is_active=$4, allow_workshop=$5, allow_pickup=$6, allow_mobile=$7 where id=$1`,
      [v.id, v.duration_minutes, v.buffer_minutes, v.is_active, v.allow_workshop, v.allow_pickup, v.allow_mobile]);
  }
  await pool.end();
});

describe('service packages', () => {
  it('publishes the three packages with prices, duration ranges and features', async () => {
    const { rows } = await q(`select public.get_public_config() -> 'services' as s`);
    const byslug = Object.fromEntries(rows[0].s.map((x: { slug: string }) => [x.slug, x]));
    expect(Number(byslug['enkel-tvatt'].price)).toBe(650);
    expect(Number(byslug['mini-rekond'].price)).toBe(1200);
    expect(Number(byslug['premium-rekond'].price)).toBe(1800);
    expect(byslug['mini-rekond'].duration_text).toBe('3–3,5 timmar');
    expect(byslug['premium-rekond'].is_highlighted).toBe(true);
    expect(byslug['premium-rekond'].features.length).toBeGreaterThan(2);
  });

  it('uses each package duration for availability (longer packages have fewer start times)', async () => {
    const [e, m, p] = await Promise.all([slots(enkel, 1, 'workshop'), slots(mini, 1, 'workshop'), slots(premium, 1, 'workshop')]);
    // 08:00–17:00, 30-min grid: last start = 17:00 − duration
    expect([...e.keys()].at(-1)).toBe(at(1, '15:00'));
    expect([...m.keys()].at(-1)).toBe(at(1, '13:30'));
    expect([...p.keys()].at(-1)).toBe(at(1, '12:00'));
  });

  it('rejects malformed feature lists', async () => {
    await expect(q(`update public.services set features = array[''] where id = $1`, [enkel])).rejects.toThrow(/check/);
  });
});

describe('pickup and on-site locations', () => {
  it('reserves travel time before and after, inside opening hours', async () => {
    const pickup = await slots(enkel, 2, 'pickup');
    // First start 08:30 (travel from 08:00), last start 14:30 (work ends 16:30 + 30 travel = 17:00)
    expect([...pickup.keys()][0]).toBe(at(2, '08:30'));
    expect([...pickup.keys()].at(-1)).toBe(at(2, '14:30'));

    const r = await createBooking(booking({ start_time: at(2, '10:00'), location_type: 'pickup', ...address }));
    expect(r.ok).toBe(true);
    const { rows } = await q(`select blocked_from, blocked_until, travel_minutes from public.appointments where id = $1`, [r.appointment_id]);
    expect(new Date(rows[0].blocked_from).toISOString()).toBe(at(2, '09:30'));
    expect(new Date(rows[0].blocked_until).toISOString()).toBe(at(2, '13:00')); // 12:00 + 30 buffer + 30 travel
    expect(rows[0].travel_minutes).toBe(30);

    // A workshop booking ending at 09:30 still fits; one ending inside the outbound trip does not.
    const ws = await slots(enkel, 2, 'workshop');
    expect(ws.get(at(2, '08:00'))).toBe(false); // 08:00–10:00 + buffer overlaps 09:30
    expect(ws.get(at(2, '13:00'))).toBe(true);
    expect(ws.get(at(2, '12:30'))).toBe(false);
  });

  it('never assigns the team to overlapping trips (exclusion constraint)', async () => {
    const r = await createBooking(booking({ start_time: at(2, '12:30'), location_type: 'customer_address', ...address }));
    expect(r.code).toBe('slot_unavailable');
  });

  it('requires an address for pickup', async () => {
    const r = await createBooking(booking({ start_time: at(3, '09:00'), location_type: 'pickup' }));
    expect(r.code).toBe('invalid_input');
    expect(r.field).toBe('service_address');
  });

  it('respects per-service location availability', async () => {
    expect((await slots(premium, 3, 'customer_address')).size).toBe(0);
    const r = await createBooking(booking({ service_id: premium, start_time: at(3, '09:00'), location_type: 'customer_address', ...address }));
    expect(r.code).toBe('location_unavailable');
  });

  it('refuses a location type that has been switched off', async () => {
    await q(`update public.business_settings set pickup_service_enabled = false where id = 1`);
    try {
      const r = await createBooking(booking({ start_time: at(3, '09:00'), location_type: 'pickup', ...address }));
      expect(r.code).toBe('location_unavailable');
    } finally {
      await q(`update public.business_settings set pickup_service_enabled = true where id = 1`);
    }
  });

  it('enforces configured postal-code zones', async () => {
    await q(`update public.business_settings set mobile_postal_prefixes = '{212,213}' where id = 1`);
    try {
      const bad = await createBooking(booking({ start_time: at(3, '09:00'), location_type: 'customer_address', ...address }));
      expect(bad.code).toBe('postal_code_unsupported');
      expect(bad.field).toBe('service_postal_code');
      const good = await createBooking(booking({ start_time: at(3, '09:00'), location_type: 'customer_address', ...address, service_postal_code: '21233' }));
      expect(good.ok).toBe(true);
    } finally {
      await q(`update public.business_settings set mobile_postal_prefixes = '{}' where id = 1`);
    }
    await expect(q(`update public.business_settings set pickup_postal_prefixes = '{abc}' where id = 1`)).rejects.toThrow(/check/);
  });

  it('snapshots a location fee only when one is configured', async () => {
    const none = await createBooking(booking({ start_time: at(4, '08:30'), location_type: 'pickup', ...address }));
    expect(none.ok).toBe(true);
    expect(none.location_fee).toBeNull();
    await q(`update public.business_settings set pickup_fee = 199 where id = 1`);
    try {
      const fee = await createBooking(booking({ start_time: at(4, '13:00'), location_type: 'pickup', ...address }));
      expect(Number(fee.location_fee)).toBe(199);
    } finally {
      await q(`update public.business_settings set pickup_fee = null where id = 1`);
    }
    const ws = await createBooking(booking({ start_time: at(7, '08:00') }));
    expect(ws.location_fee).toBeNull();
  });

  it('lets an admin change the location and recomputes the travel window', async () => {
    const r = await createBooking(booking({ start_time: at(8, '09:00') }));
    await asRole('authenticated', adminId, async (c) => {
      const res = await c.query(`select public.admin_update_appointment_location($1, $2::jsonb) as r`, [r.appointment_id, JSON.stringify({ location_type: 'pickup', ...address })]);
      expect(res.rows[0].r.ok).toBe(true);
      const row = await c.query(`select blocked_from, location_type from public.appointments where id = $1`, [r.appointment_id]);
      expect(new Date(row.rows[0].blocked_from).toISOString()).toBe(at(8, '08:30'));
      expect(row.rows[0].location_type).toBe('pickup');
    });
  });
});

describe('charity preference', () => {
  let active: string;
  let inactive: string;
  beforeAll(async () => {
    active = (await q(`select id from public.charities where slug = 'roda-korset'`)).rows[0].id;
    inactive = (await q(`select id from public.charities where slug = 'ny-gemenskap'`)).rows[0].id;
    await q(`update public.charities set is_active = true where id = $1`, [active]);
    await q(`update public.charities set is_active = false where id = $1`, [inactive]);
  });

  it('stores the preference together with the booking, and never an amount', async () => {
    const before = (await q(`select count(*)::int as n from public.donation_allocations`)).rows[0].n;
    const p = booking({ start_time: at(9, '08:00'), charity_id: active });
    const r = await createBooking(p);
    expect(r.ok).toBe(true);
    expect(r.charity_name).toBe('Svenska Röda Korset');
    const sel = await q(`select charity_id from public.appointment_charity_selections where appointment_id = $1`, [r.appointment_id]);
    expect(sel.rows).toEqual([{ charity_id: active }]);
    // Retrying the same request creates neither a second booking nor a second selection.
    const again = await createBooking(p);
    expect(again.duplicate).toBe(true);
    expect((await q(`select count(*)::int as n from public.appointment_charity_selections where appointment_id = $1`, [r.appointment_id])).rows[0].n).toBe(1);
    expect((await q(`select count(*)::int as n from public.donation_allocations`)).rows[0].n).toBe(before);
  });

  it('is optional', async () => {
    const r = await createBooking(booking({ start_time: at(9, '13:00') }));
    expect(r.ok).toBe(true);
    expect(r.charity_name).toBeNull();
  });

  it('rejects inactive, unknown and malformed charities without creating a booking', async () => {
    const email = `p2-charity-${randomUUID().slice(0, 6)}@db-test.invalid`;
    expect((await createBooking(booking({ start_time: at(10, '08:00'), customer_email: email, charity_id: inactive }))).code).toBe('charity_unavailable');
    expect((await createBooking(booking({ start_time: at(10, '08:00'), customer_email: email, charity_id: randomUUID() }))).code).toBe('charity_unavailable');
    expect((await createBooking(booking({ start_time: at(10, '08:00'), customer_email: email, charity_id: 'x' }))).code).toBe('invalid_input');
    expect((await q(`select count(*)::int as n from public.appointments where customer_email = $1`, [email])).rows[0].n).toBe(0);
  });

  it('rejects a charity when the programme is switched off', async () => {
    await q(`update public.business_settings set charity_enabled = false where id = 1`);
    try {
      expect((await createBooking(booking({ start_time: at(10, '13:00'), charity_id: active }))).code).toBe('charity_unavailable');
      const cfg = await q(`select public.get_public_config() -> 'charities' as c`);
      expect(cfg.rows[0].c).toEqual([]);
    } finally {
      await q(`update public.business_settings set charity_enabled = true where id = 1`);
    }
  });

  it('only completed donations are public, and duplicate periods are refused', async () => {
    await q(`insert into public.donation_allocations (charity_id, accounting_period, amount, status) values ($1, 'DB-test 1', 500, 'approved')`, [active]);
    let pub = (await q(`select public.get_public_config() -> 'donations' as d`)).rows[0].d;
    expect(pub.find((d: { charity_name: string }) => d.charity_name === 'Svenska Röda Korset')).toBeUndefined();
    await q(`update public.donation_allocations set status = 'completed', reference = 'Kvitto 1' where accounting_period = 'DB-test 1'`);
    pub = (await q(`select public.get_public_config() -> 'donations' as d`)).rows[0].d;
    expect(Number(pub.find((d: { charity_name: string }) => d.charity_name === 'Svenska Röda Korset').amount)).toBeGreaterThanOrEqual(500);
    const row = (await q(`select approved_at, completed_at from public.donation_allocations where accounting_period = 'DB-test 1'`)).rows[0];
    expect(row.approved_at).not.toBeNull();
    expect(row.completed_at).not.toBeNull();
    await expect(q(`insert into public.donation_allocations (charity_id, accounting_period, amount) values ($1, 'DB-test 1', 10)`, [active])).rejects.toThrow(/donation_allocations_period_unique/);
    await expect(q(`insert into public.donation_allocations (charity_id, accounting_period, amount) values ($1, 'DB-test 2', 0)`, [active])).rejects.toThrow(/check/);
  });

  it('summarises preferences for admins only, excluding cancelled bookings', async () => {
    await asRole('authenticated', adminId, async (c) => {
      const { rows } = await c.query(`select * from public.admin_charity_summary()`);
      const rk = rows.find((r) => r.charity_id === active);
      expect(Number(rk.selections)).toBeGreaterThanOrEqual(1);
    });
    await asRole('authenticated', randomUUID(), async (c) => {
      await expect(c.query(`select * from public.admin_charity_summary()`)).rejects.toThrow(/forbidden/);
    });
  });
});

describe('reviews', () => {
  let appointmentId: string;
  let token: string;

  beforeAll(async () => {
    const r = await createBooking(booking({ start_time: at(11, '08:00') }));
    appointmentId = r.appointment_id!;
  });

  it('issues invitations only for completed bookings', async () => {
    const early = (await q(`select private.issue_review_invitation($1) as r`, [appointmentId])).rows[0].r;
    expect(early.code).toBe('not_completed');
    await q(`update public.appointments set status = 'completed' where id = $1`, [appointmentId]);
    const res = (await q(`select private.issue_review_invitation($1) as r`, [appointmentId])).rows[0].r;
    expect(res.ok).toBe(true);
    expect(res.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    token = res.token;
    const stored = (await q(`select token_hash from public.review_invitations where appointment_id = $1`, [appointmentId])).rows[0].token_hash;
    expect(stored).not.toContain(token);
  });

  it('lets the customer submit exactly one review, stored as plain text and pending', async () => {
    await asRole('anon', null, async (c) => {
      const info = (await c.query(`select public.get_review_invitation($1) as r`, [token])).rows[0].r;
      expect(info.ok).toBe(true);
      expect(info.first_name).toBe('Fas');
      expect(JSON.stringify(info)).not.toMatch(/db-test\.invalid|070/);
      expect((await c.query(`select public.submit_review($1, 'A', 5, 'För kort?') as r`, [token])).rows[0].r.field).toBe('display_name');
      expect((await c.query(`select public.submit_review($1, 'Anna', 9, 'Mycket nöjd med resultatet!') as r`, [token])).rows[0].r.field).toBe('rating');
    });
    const ok = (await q(`select public.submit_review($1, 'Anna <b>K</b>', 5, '<script>alert(1)</script>Mycket nöjd med resultatet!') as r`, [token])).rows[0].r;
    expect(ok.ok).toBe(true);
    const row = (await q(`select display_name, body, status, verified from public.reviews where appointment_id = $1`, [appointmentId])).rows[0];
    expect(row).toEqual({ display_name: 'Anna K', body: 'alert(1)Mycket nöjd med resultatet!', status: 'pending', verified: true });
    const dup = (await q(`select public.submit_review($1, 'Anna', 4, 'Ett andra försök att recensera.') as r`, [token])).rows[0].r;
    expect(dup.code).toBe('already_submitted');
    expect((await q(`select private.issue_review_invitation($1) as r`, [appointmentId])).rows[0].r.code).toBe('already_reviewed');
  });

  it('rejects unknown and malformed tokens', async () => {
    expect((await q(`select public.get_review_invitation($1) as r`, ['x'.repeat(43)])).rows[0].r.code).toBe('invalid_token');
    expect((await q(`select public.submit_review($1, 'Anna', 5, 'Bra jobbat med bilen!') as r`, ["'; drop table reviews; --"])).rows[0].r.code).toBe('invalid_token');
  });

  it('shows a review publicly only after approval', async () => {
    const hidden = (await q(`select public.get_public_config() -> 'reviews' as r`)).rows[0].r;
    expect(hidden.some((r: { display_name: string }) => r.display_name === 'Anna K')).toBe(false);
    await asRole('authenticated', adminId, async (c) => {
      await c.query(`update public.reviews set status = 'approved' where appointment_id = $1`, [appointmentId]);
      const shown = (await c.query(`select public.get_public_config() -> 'reviews' as r`)).rows[0].r;
      const mine = shown.find((r: { display_name: string }) => r.display_name === 'Anna K');
      expect(mine.rating).toBe(5);
      expect(mine.published_at).not.toBeNull();
      expect(Object.keys(mine).sort()).toEqual(['body', 'display_name', 'id', 'published_at', 'rating', 'service_name', 'verified']);
    });
  });
});

describe('row level security for the new tables', () => {
  const tables = ['reviews', 'review_invitations', 'partners', 'charities', 'appointment_charity_selections', 'donation_allocations'];

  it.each(tables)('anonymous users cannot read %s', async (t) => {
    await asRole('anon', null, async (c) => {
      await expect(c.query(`select * from public.${t}`)).rejects.toThrow(/permission denied/);
    });
  });

  it.each(tables)('signed-in non-admins see no rows in %s', async (t) => {
    await asRole('authenticated', randomUUID(), async (c) => {
      expect((await c.query(`select count(*)::int as n from public.${t}`)).rows[0].n).toBe(0);
    });
  });

  it('non-admins cannot create partners or donations', async () => {
    await asRole('authenticated', randomUUID(), async (c) => {
      await expect(c.query(`insert into public.partners (name) values ('DB-test hack')`)).rejects.toThrow(/row-level security/);
    });
  });

  it('admins manage partners; duplicates and unsafe URLs are refused', async () => {
    await asRole('authenticated', adminId, async (c) => {
      await c.query(`insert into public.partners (name, website_url) values ('DB-test Partner', 'https://example.com')`);
      await expect(c.query(`insert into public.partners (name) values (' db-test partner')`)).rejects.toThrow(/partners_name_unique/);
    });
    await asRole('authenticated', adminId, async (c) => {
      await expect(c.query(`insert into public.partners (name, website_url) values ('DB-test X', 'javascript:alert(1)')`)).rejects.toThrow(/check/);
    });
    await asRole('authenticated', adminId, async (c) => {
      await expect(c.query(`insert into public.partners (name, logo_url) values ('DB-test Y', '/partners/../../etc"')`)).rejects.toThrow(/check/);
    });
  });

  it('admins can edit booking notes directly (triggers run for the admin role)', async () => {
    const r = await createBooking(booking({ start_time: at(11, '13:00') }));
    await asRole('authenticated', adminId, async (c) => {
      const res = await c.query(`update public.appointments set admin_notes = 'ok' where id = $1`, [r.appointment_id]);
      expect(res.rowCount).toBe(1);
    });
  });

  it('the public config exposes partners without internal notes', async () => {
    const p = (await q(`select public.get_public_config() -> 'partners' as p`)).rows[0].p;
    expect(p.length).toBeGreaterThan(0);
    expect(JSON.stringify(p)).not.toMatch(/admin_note|bekräfta/);
    expect(p.some((x: { name: string }) => x.name === 'Jöhlteam Konsult')).toBe(false); // hidden until verified
  });
});
