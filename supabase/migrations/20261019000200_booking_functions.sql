-- =============================================================================
-- Crescor Bilvård — booking logic
--
-- Internal helpers live in the `private` schema, which is NOT exposed through
-- the Supabase Data API. Public entry points in `public` are SECURITY DEFINER
-- functions with an empty search_path and explicitly granted EXECUTE rights.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- is_admin(): true when the calling Supabase Auth user is an administrator.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = (select auth.uid())
  );
$$;

-- -----------------------------------------------------------------------------
-- private.compute_slots: the single source of truth for scheduling.
--
-- Produces every grid slot inside opening hours for the given local dates and
-- service, with the reason a slot cannot be booked (NULL = bookable).
-- Reasons, in priority order:
--   past | booked | blocked | booking_disabled | too_soon | too_far
-- -----------------------------------------------------------------------------
create or replace function private.compute_slots(
  p_service_id uuid,
  p_from date,
  p_to date,
  p_ignore_appointment uuid default null
)
returns table (slot_start timestamptz, slot_end timestamptz, block_end timestamptz, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select * from public.business_settings where id = 1
  ),
  svc as (
    select duration_minutes, buffer_minutes
    from public.services
    where id = p_service_id and is_active
  ),
  days as (
    select d::date as day
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  ),
  windows as (
    -- (local date + local time) AT TIME ZONE tz  ->  correct UTC instant,
    -- including daylight-saving transitions.
    select
      (days.day + h.opening_time) at time zone s.timezone as open_at,
      (days.day + h.closing_time) at time zone s.timezone as close_at
    from days
    join public.business_hours h
      on h.weekday = extract(isodow from days.day) and not h.is_closed
    cross join s
  ),
  candidates as (
    select
      gs as slot_start,
      gs + make_interval(mins => svc.duration_minutes) as slot_end,
      gs + make_interval(mins => svc.duration_minutes + svc.buffer_minutes) as block_end
    from windows
    cross join svc
    cross join s
    cross join lateral generate_series(
      windows.open_at,
      windows.close_at - make_interval(mins => svc.duration_minutes),
      make_interval(mins => s.slot_interval_minutes)
    ) gs
  )
  select
    c.slot_start,
    c.slot_end,
    c.block_end,
    case
      when c.slot_start <= now() then 'past'
      when exists (
        select 1 from public.appointments a
        where a.status in ('pending', 'confirmed')
          and (p_ignore_appointment is null or a.id <> p_ignore_appointment)
          and tstzrange(a.start_time, a.blocked_until, '[)') && tstzrange(c.slot_start, c.block_end, '[)')
      ) then 'booked'
      when exists (
        select 1 from public.blocked_dates b
        where tstzrange(b.start_time, b.end_time, '[)') && tstzrange(c.slot_start, c.slot_end, '[)')
      ) then 'blocked'
      when not s.booking_enabled then 'booking_disabled'
      when c.slot_start < now() + make_interval(hours => s.booking_notice_hours) then 'too_soon'
      when c.slot_start >= now() + make_interval(days => s.booking_horizon_days) then 'too_far'
      else null
    end as reason
  from candidates c
  cross join s
  order by c.slot_start;
$$;

-- -----------------------------------------------------------------------------
-- get_public_config(): everything the public site needs, nothing more.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'settings', (
      select jsonb_build_object(
        'company_name', s.company_name,
        'company_phone', s.company_phone,
        'company_email', s.company_email,
        'company_address', s.company_address,
        'opening_hours_text', s.opening_hours_text,
        'service_area_text', s.service_area_text,
        'org_number', s.org_number,
        'timezone', s.timezone,
        'booking_enabled', s.booking_enabled,
        'workshop_available', s.workshop_service_enabled and s.company_address is not null,
        'mobile_available', s.mobile_service_enabled,
        'auto_confirm', s.auto_confirm,
        'booking_notice_hours', s.booking_notice_hours,
        'booking_horizon_days', s.booking_horizon_days
      )
      from public.business_settings s where s.id = 1
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'slug', v.slug,
        'name', v.name,
        'description', v.description,
        'duration_minutes', v.duration_minutes,
        'price', v.price,
        'price_type', v.price_type,
        'image_key', v.image_key
      ) order by v.sort_order, v.name)
      from public.services v where v.is_active
    ), '[]'::jsonb),
    'business_hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', h.weekday,
        'opening_time', to_char(h.opening_time, 'HH24:MI'),
        'closing_time', to_char(h.closing_time, 'HH24:MI'),
        'is_closed', h.is_closed
      ) order by h.weekday)
      from public.business_hours h
    ), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- get_available_slots(): public availability. Returns times and a boolean only;
-- no information about who booked or why a slot is unavailable.
-- At most 14 days per request.
-- -----------------------------------------------------------------------------
create or replace function public.get_available_slots(
  p_service_id uuid,
  p_from date,
  p_to date
)
returns table (slot_start timestamptz, slot_end timestamptz, is_available boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_service_id is null or p_from is null or p_to is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_to < p_from or p_to - p_from > 13 then
    raise exception 'range_too_large' using errcode = '22023';
  end if;

  return query
    select c.slot_start, c.slot_end, c.reason is null
    from private.compute_slots(p_service_id, p_from, p_to) c;
end;
$$;

-- -----------------------------------------------------------------------------
-- private.new_booking_reference(): CB-XXXXXX using an unambiguous alphabet.
-- -----------------------------------------------------------------------------
create or replace function private.new_booking_reference()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  ref text;
begin
  loop
    bytes := extensions.gen_random_bytes(6);
    ref := 'CB-';
    for i in 0..5 loop
      ref := ref || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.appointments where booking_reference = ref);
  end loop;
  return ref;
end;
$$;

-- -----------------------------------------------------------------------------
-- private.clean_text: trim, collapse empty to NULL, strip control characters.
-- -----------------------------------------------------------------------------
create or replace function private.clean_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce(p, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
$$;

-- -----------------------------------------------------------------------------
-- private.insert_appointment: shared, validated, atomic insert.
--
-- p_mode = 'online'  -> all public booking rules apply.
-- p_mode = 'admin'   -> admin may book inside the notice window, beyond the
--                       horizon and while online booking is disabled.
-- p_mode = 'admin_override' -> admin may also ignore opening hours and the
--                       slot grid. Overlap prevention ALWAYS applies.
--
-- Returns jsonb: { ok: true, ... } or { ok: false, code: '...' }.
-- -----------------------------------------------------------------------------
create or replace function private.insert_appointment(p jsonb, p_mode text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.business_settings;
  v public.services;
  v_idem uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_block timestamptz;
  v_reason text;
  v_found boolean;
  v_local_date date;
  v_name text := private.clean_text(p->>'customer_name');
  v_email text := lower(private.clean_text(p->>'customer_email'));
  v_phone text := private.clean_text(p->>'customer_phone');
  v_vehicle text := private.clean_text(p->>'vehicle_information');
  v_reg text := upper(private.clean_text(p->>'registration_number'));
  v_location public.location_type;
  v_address text := private.clean_text(p->>'service_address');
  v_postal text := private.clean_text(p->>'service_postal_code');
  v_city text := private.clean_text(p->>'service_city');
  v_instructions text := private.clean_text(p->>'address_instructions');
  v_notes text := private.clean_text(p->>'customer_notes');
  v_status public.appointment_status;
  v_existing public.appointments;
  v_row public.appointments;
begin
  if p_mode not in ('online', 'admin', 'admin_override') then
    raise exception 'invalid mode';
  end if;

  -- Serialise all booking writes. Volume is tiny, and this makes the
  -- check-then-insert sequence race-free (the exclusion constraint remains
  -- the final guarantee).
  perform pg_advisory_xact_lock(hashtext('crescor.appointments.write'));

  -- ---- Idempotency: a retried request returns the original booking --------
  begin
    v_idem := nullif(p->>'idempotency_key', '')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'idempotency_key');
  end;

  if v_idem is not null then
    select * into v_existing from public.appointments where idempotency_key = v_idem;
    if found then
      return jsonb_build_object(
        'ok', true, 'duplicate', true,
        'appointment_id', v_existing.id,
        'booking_reference', v_existing.booking_reference,
        'status', v_existing.status,
        'start_time', v_existing.start_time,
        'end_time', v_existing.end_time,
        'service_name', v_existing.service_name
      );
    end if;
  end if;

  select * into s from public.business_settings where id = 1;

  -- ---- Field validation ----------------------------------------------------
  if v_name is null or char_length(v_name) > 100 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'customer_name');
  end if;
  if v_email is null or char_length(v_email) > 254
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'customer_email');
  end if;
  if v_phone is null or v_phone !~ '^\+?[0-9 ()-]{6,20}$'
     or char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 6 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'customer_phone');
  end if;
  if v_vehicle is not null and char_length(v_vehicle) > 100 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'vehicle_information');
  end if;
  if v_reg is not null and v_reg !~ '^[A-ZÅÄÖ0-9 -]{2,10}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'registration_number');
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'customer_notes');
  end if;
  if p_mode = 'online' and coalesce(p->'privacy_accepted' = 'true'::jsonb, false) is not true then
    return jsonb_build_object('ok', false, 'code', 'privacy_not_accepted');
  end if;

  -- ---- Location ------------------------------------------------------------
  begin
    v_location := (p->>'location_type')::public.location_type;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'location_type');
  end;
  if v_location is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'location_type');
  end if;

  if v_location = 'workshop' then
    if p_mode = 'online' and not (s.workshop_service_enabled and s.company_address is not null) then
      return jsonb_build_object('ok', false, 'code', 'location_unavailable');
    end if;
    v_address := null; v_postal := null; v_city := null; v_instructions := null;
  else
    if p_mode = 'online' and not s.mobile_service_enabled then
      return jsonb_build_object('ok', false, 'code', 'location_unavailable');
    end if;
    if v_address is null or char_length(v_address) > 120 then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'service_address');
    end if;
    if v_postal is null or v_postal !~ '^[0-9]{3} ?[0-9]{2}$' then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'service_postal_code');
    end if;
    if v_city is null or char_length(v_city) > 60 then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'service_city');
    end if;
    if v_instructions is not null and char_length(v_instructions) > 500 then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'address_instructions');
    end if;
  end if;

  -- ---- Service (trusted server-side duration, buffer and price) -----------
  begin
    select * into v from public.services where id = (p->>'service_id')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'service_id');
  end;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'service_unavailable');
  end if;
  if not v.is_active and p_mode = 'online' then
    return jsonb_build_object('ok', false, 'code', 'service_unavailable');
  end if;

  -- ---- Time ----------------------------------------------------------------
  begin
    v_start := (p->>'start_time')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'start_time');
  end;
  if v_start is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'start_time');
  end if;

  v_end := v_start + make_interval(mins => v.duration_minutes);
  v_block := v_end + make_interval(mins => v.buffer_minutes);

  if p_mode = 'online' and not s.booking_enabled then
    return jsonb_build_object('ok', false, 'code', 'booking_disabled');
  end if;

  if p_mode in ('online', 'admin') then
    v_local_date := (v_start at time zone s.timezone)::date;
    select true, c.reason into v_found, v_reason
    from private.compute_slots(v.id, v_local_date, v_local_date) c
    where c.slot_start = v_start;

    -- compute_slots only returns slots for active services; admins may book
    -- inactive ones as long as they use override mode.
    if v_found is null then
      return jsonb_build_object('ok', false, 'code', 'outside_business_hours');
    end if;

    if p_mode = 'online' and v_reason is not null then
      return jsonb_build_object('ok', false, 'code', case v_reason
        when 'past' then 'time_in_past'
        when 'booked' then 'slot_unavailable'
        when 'blocked' then 'slot_unavailable'
        when 'booking_disabled' then 'booking_disabled'
        when 'too_soon' then 'too_soon'
        when 'too_far' then 'too_far'
        else 'slot_unavailable' end);
    end if;

    if p_mode = 'admin' and v_reason in ('past', 'booked', 'blocked') then
      return jsonb_build_object('ok', false, 'code', case v_reason
        when 'past' then 'time_in_past'
        else 'slot_unavailable' end);
    end if;
  end if;

  -- ---- Abuse protection for public bookings --------------------------------
  if p_mode = 'online' and (
    select count(*) from public.appointments a
    where lower(a.customer_email) = v_email
      and a.created_at > now() - interval '24 hours'
      and a.status in ('pending', 'confirmed')
  ) >= 3 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  -- ---- Status --------------------------------------------------------------
  if p_mode = 'online' then
    v_status := case when s.auto_confirm then 'confirmed' else 'pending' end;
  else
    begin
      v_status := coalesce(nullif(p->>'status', '')::public.appointment_status, 'confirmed');
    exception when invalid_text_representation then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'status');
    end;
    if v_status not in ('pending', 'confirmed') then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'status');
    end if;
  end if;

  -- ---- Insert (the exclusion constraint is the final double-booking guard) -
  begin
    insert into public.appointments (
      booking_reference, service_id, service_name, price_snapshot, price_type_snapshot,
      customer_name, customer_email, customer_phone, vehicle_information, registration_number,
      location_type, service_address, service_postal_code, service_city, address_instructions,
      start_time, end_time, blocked_until, status, customer_notes, admin_notes, source,
      idempotency_key, privacy_accepted_at
    ) values (
      private.new_booking_reference(), v.id, v.name, v.price, v.price_type,
      v_name, v_email, v_phone, v_vehicle, v_reg,
      v_location, v_address, v_postal, v_city, v_instructions,
      v_start, v_end, v_block, v_status, v_notes,
      case when p_mode = 'online' then null else private.clean_text(p->>'admin_notes') end,
      case when p_mode = 'online' then 'online' else 'admin' end,
      v_idem,
      case when p_mode = 'online' then now() else null end
    )
    returning * into v_row;
  exception
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
    when unique_violation then
      -- Concurrent retry with the same idempotency key won the race.
      select * into v_existing from public.appointments where idempotency_key = v_idem;
      if found then
        return jsonb_build_object(
          'ok', true, 'duplicate', true,
          'appointment_id', v_existing.id,
          'booking_reference', v_existing.booking_reference,
          'status', v_existing.status,
          'start_time', v_existing.start_time,
          'end_time', v_existing.end_time,
          'service_name', v_existing.service_name
        );
      end if;
      raise;
  end;

  return jsonb_build_object(
    'ok', true, 'duplicate', false,
    'appointment_id', v_row.id,
    'booking_reference', v_row.booking_reference,
    'status', v_row.status,
    'start_time', v_row.start_time,
    'end_time', v_row.end_time,
    'service_name', v_row.service_name
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- create_booking(): public booking entry point.
-- EXECUTE is granted ONLY to service_role: the browser never calls this
-- directly. It is called by the `create-booking` Edge Function after CAPTCHA
-- verification and IP rate limiting.
-- -----------------------------------------------------------------------------
create or replace function public.create_booking(p jsonb)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.insert_appointment(p, 'online');
$$;

-- -----------------------------------------------------------------------------
-- Admin RPCs. Every one of them re-checks is_admin().
-- -----------------------------------------------------------------------------
create or replace function public.admin_create_appointment(p jsonb, p_override boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.insert_appointment(p, case when p_override then 'admin_override' else 'admin' end);
end;
$$;

create or replace function public.admin_reschedule_appointment(
  p_id uuid,
  p_start timestamptz,
  p_override boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.business_settings;
  a public.appointments;
  v public.services;
  v_reason text;
  v_found boolean;
  v_local_date date;
  v_old_start timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('crescor.appointments.write'));

  select * into s from public.business_settings where id = 1;
  select * into a from public.appointments where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if a.status not in ('pending', 'confirmed') then
    return jsonb_build_object('ok', false, 'code', 'not_active');
  end if;
  select * into v from public.services where id = a.service_id;

  if not p_override then
    v_local_date := (p_start at time zone s.timezone)::date;
    select true, c.reason into v_found, v_reason
    from private.compute_slots(a.service_id, v_local_date, v_local_date, a.id) c
    where c.slot_start = p_start;

    if v_found is null then
      return jsonb_build_object('ok', false, 'code', 'outside_business_hours');
    end if;
    if v_reason in ('past', 'booked', 'blocked') then
      return jsonb_build_object('ok', false, 'code', case v_reason when 'past' then 'time_in_past' else 'slot_unavailable' end);
    end if;
  end if;

  v_old_start := a.start_time;

  begin
    update public.appointments
       set start_time = p_start,
           end_time = p_start + make_interval(mins => v.duration_minutes),
           blocked_until = p_start + make_interval(mins => v.duration_minutes + v.buffer_minutes)
     where id = p_id
     returning * into a;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  end;

  return jsonb_build_object(
    'ok', true,
    'appointment_id', a.id,
    'previous_start_time', v_old_start,
    'start_time', a.start_time,
    'end_time', a.end_time
  );
end;
$$;

create or replace function public.admin_set_appointment_status(
  p_id uuid,
  p_status public.appointment_status
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.appointments;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('crescor.appointments.write'));

  select * into a from public.appointments where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if a.anonymized_at is not null then
    return jsonb_build_object('ok', false, 'code', 'anonymized');
  end if;

  begin
    update public.appointments
       set status = p_status,
           cancelled_at = case when p_status = 'cancelled' then now() else null end
     where id = p_id
     returning * into a;
  exception when exclusion_violation then
    -- Re-activating a cancelled booking whose time has since been taken.
    return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  end;

  return jsonb_build_object('ok', true, 'appointment_id', a.id, 'status', a.status);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privacy: anonymisation (GDPR data minimisation / erasure requests).
-- Keeps the booking's existence and timing for bookkeeping, removes personal data.
-- -----------------------------------------------------------------------------
create or replace function private.anonymize_appointment_row(p_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.appointments
     set customer_name = 'Anonymiserad',
         customer_email = 'anonymiserad@invalid',
         customer_phone = '000000',
         vehicle_information = null,
         registration_number = null,
         service_address = null,
         service_postal_code = null,
         service_city = null,
         address_instructions = null,
         customer_notes = null,
         admin_notes = null,
         anonymized_at = now()
   where id = p_id and anonymized_at is null;
$$;

create or replace function public.admin_anonymize_appointment(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.appointments;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into a from public.appointments where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if a.status in ('pending', 'confirmed') and a.end_time > now() then
    return jsonb_build_object('ok', false, 'code', 'still_active');
  end if;
  perform private.anonymize_appointment_row(p_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- Applies the configured retention policy. Safe to run repeatedly.
create or replace function private.apply_retention()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_appointments integer := 0;
  v_messages integer := 0;
  r record;
begin
  select retention_days into v_days from public.business_settings where id = 1;

  for r in
    select id from public.appointments
    where anonymized_at is null
      and end_time < now() - make_interval(days => v_days)
      and status in ('completed', 'cancelled', 'pending', 'confirmed')
  loop
    perform private.anonymize_appointment_row(r.id);
    v_appointments := v_appointments + 1;
  end loop;

  delete from public.contact_messages where created_at < now() - make_interval(days => v_days);
  get diagnostics v_messages = row_count;

  delete from public.notification_log where created_at < now() - make_interval(days => v_days);
  delete from public.rate_limits where window_start < now() - interval '2 days';

  return jsonb_build_object('ok', true, 'anonymized_appointments', v_appointments, 'deleted_messages', v_messages);
end;
$$;

create or replace function public.admin_apply_retention()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.apply_retention();
end;
$$;

-- -----------------------------------------------------------------------------
-- Rate limiting (fixed window). Called by Edge Functions with service_role.
-- Returns true if the request is allowed.
-- -----------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_bucket is null or char_length(p_bucket) > 200 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup of old windows.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_limit;
end;
$$;

-- -----------------------------------------------------------------------------
-- health_check(): minimal database round-trip for uptime monitoring.
-- Reads a single one-row table; returns no business or personal data.
-- -----------------------------------------------------------------------------
create or replace function public.health_check()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', exists (select 1 from public.business_settings where id = 1), 'time', now());
$$;
