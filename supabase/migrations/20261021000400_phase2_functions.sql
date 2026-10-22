-- =============================================================================
-- Crescor Bilvård — Phase 2, part 3: scheduling, booking and public functions
--
-- Scheduling now accounts for the location:
--   reserved period = [start − travel, end + buffer + travel)
--   work + travel must fit inside opening hours
-- where travel is 0 for the workshop and the configured pickup / on-site travel
-- time otherwise. Overlap prevention stays enforced by the exclusion constraint.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function private.travel_minutes(p_location public.location_type)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case p_location::text
           when 'pickup' then s.pickup_travel_minutes
           when 'customer_address' then s.mobile_travel_minutes
           else 0
         end
  from public.business_settings s
  where s.id = 1;
$$;

create or replace function private.location_fee(p_location public.location_type)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case p_location::text
           when 'pickup' then s.pickup_fee
           when 'customer_address' then s.mobile_fee
           else null
         end
  from public.business_settings s
  where s.id = 1;
$$;

create or replace function private.service_allows_location(v public.services, p_location public.location_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_location::text
           when 'workshop' then v.allow_workshop
           when 'pickup' then v.allow_pickup
           when 'customer_address' then v.allow_mobile
           else false
         end;
$$;

-- True when no zones are configured, or the postal code starts with one of them.
create or replace function private.postal_allowed(p_postal text, p_prefixes text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_prefixes), 0) = 0
      or exists (select 1 from unnest(p_prefixes) x where replace(coalesce(p_postal, ''), ' ', '') like x || '%');
$$;

-- -----------------------------------------------------------------------------
-- private.compute_slots — the single source of truth for scheduling.
-- p_location NULL keeps the previous behaviour (no travel time).
-- -----------------------------------------------------------------------------
drop function if exists private.compute_slots(uuid, date, date, uuid);

create or replace function private.compute_slots(
  p_service_id uuid,
  p_from date,
  p_to date,
  p_location public.location_type default null,
  p_ignore_appointment uuid default null
)
returns table (slot_start timestamptz, slot_end timestamptz, block_start timestamptz, block_end timestamptz, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select * from public.business_settings where id = 1
  ),
  t as (
    select case when p_location is null then 0 else coalesce(private.travel_minutes(p_location), 0) end as mins
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
      gs - make_interval(mins => t.mins) as block_start,
      -- end of work + return trip (the cleanup buffer does not block blocked dates)
      gs + make_interval(mins => svc.duration_minutes + t.mins) as busy_end,
      gs + make_interval(mins => svc.duration_minutes + svc.buffer_minutes + t.mins) as block_end
    from windows
    cross join svc
    cross join s
    cross join t
    cross join lateral generate_series(
      windows.open_at,
      windows.close_at - make_interval(mins => svc.duration_minutes),
      make_interval(mins => s.slot_interval_minutes)
    ) gs
    -- travel there and back must also fit inside opening hours
    where gs - make_interval(mins => t.mins) >= windows.open_at
      and gs + make_interval(mins => svc.duration_minutes + t.mins) <= windows.close_at
  )
  select
    c.slot_start,
    c.slot_end,
    c.block_start,
    c.block_end,
    case
      when c.slot_start <= now() then 'past'
      when exists (
        select 1 from public.appointments a
        where a.status in ('pending', 'confirmed')
          and (p_ignore_appointment is null or a.id <> p_ignore_appointment)
          and tstzrange(a.blocked_from, a.blocked_until, '[)') && tstzrange(c.block_start, c.block_end, '[)')
      ) then 'booked'
      when exists (
        select 1 from public.blocked_dates b
        where tstzrange(b.start_time, b.end_time, '[)') && tstzrange(c.block_start, c.busy_end, '[)')
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
-- get_available_slots — public availability, now per location.
-- Returns nothing when the service is not offered at the chosen location.
-- -----------------------------------------------------------------------------
drop function if exists public.get_available_slots(uuid, date, date);

create or replace function public.get_available_slots(
  p_service_id uuid,
  p_from date,
  p_to date,
  p_location text default null
)
returns table (slot_start timestamptz, slot_end timestamptz, is_available boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_location public.location_type;
  v public.services;
begin
  if p_service_id is null or p_from is null or p_to is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_to < p_from or p_to - p_from > 13 then
    raise exception 'range_too_large' using errcode = '22023';
  end if;
  if p_location is not null then
    begin
      v_location := p_location::public.location_type;
    exception when invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023';
    end;
    select * into v from public.services where id = p_service_id;
    if not found or not private.service_allows_location(v, v_location) then
      return;
    end if;
  end if;

  return query
    select c.slot_start, c.slot_end, c.reason is null
    from private.compute_slots(p_service_id, p_from, p_to, v_location) c;
end;
$$;

-- -----------------------------------------------------------------------------
-- Booking result payload (shared by new and duplicate/idempotent responses)
-- -----------------------------------------------------------------------------
create or replace function private.booking_result(a public.appointments, p_duplicate boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'duplicate', p_duplicate,
    'appointment_id', a.id,
    'booking_reference', a.booking_reference,
    'status', a.status,
    'start_time', a.start_time,
    'end_time', a.end_time,
    'service_name', a.service_name,
    'addons', a.addons,
    'addons_total', a.addons_total,
    'location_type', a.location_type,
    'location_fee', a.location_fee,
    'charity_name', (
      select c.name from public.appointment_charity_selections x
      join public.charities c on c.id = x.charity_id
      where x.appointment_id = a.id
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- private.insert_appointment — unchanged rules from 20261020000100, plus:
--   * pickup location, per-service location availability, postal-code zones
--   * travel time reserved around pickup / on-site bookings
--   * location fee snapshot (only when configured)
--   * optional charity preference, stored in the same transaction
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
  v_block_from timestamptz;
  v_travel integer;
  v_fee numeric(10, 2);
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
  v_addon_ids uuid[];
  v_addons jsonb;
  v_addons_total numeric(10, 2);
  v_addons_found integer;
  v_charity_id uuid;
  v_row public.appointments;
begin
  if p_mode not in ('online', 'admin', 'admin_override') then
    raise exception 'invalid mode';
  end if;

  -- Serialise all booking writes (the exclusion constraint remains the final guarantee).
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
      return private.booking_result(v_existing, true);
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

  if v_location::text = 'workshop' then
    if p_mode = 'online' and not (s.workshop_service_enabled and s.company_address is not null) then
      return jsonb_build_object('ok', false, 'code', 'location_unavailable');
    end if;
    v_address := null; v_postal := null; v_city := null; v_instructions := null;
  else
    if p_mode = 'online' and v_location::text = 'pickup' and not s.pickup_service_enabled then
      return jsonb_build_object('ok', false, 'code', 'location_unavailable');
    end if;
    if p_mode = 'online' and v_location::text = 'customer_address' and not s.mobile_service_enabled then
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
    if p_mode = 'online' and not private.postal_allowed(
      v_postal,
      case when v_location::text = 'pickup' then s.pickup_postal_prefixes else s.mobile_postal_prefixes end
    ) then
      return jsonb_build_object('ok', false, 'code', 'postal_code_unsupported', 'field', 'service_postal_code');
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
  if p_mode = 'online' and not private.service_allows_location(v, v_location) then
    return jsonb_build_object('ok', false, 'code', 'location_unavailable');
  end if;

  -- ---- Add-ons (trusted server-side names and prices) ----------------------
  if p ? 'addon_ids' and jsonb_typeof(p->'addon_ids') not in ('array', 'null') then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'addon_ids');
  end if;
  begin
    select coalesce(array_agg(distinct e::uuid), '{}')
      into v_addon_ids
      from jsonb_array_elements_text(
        case when jsonb_typeof(p->'addon_ids') = 'array' then p->'addon_ids' else '[]'::jsonb end
      ) e;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'addon_ids');
  end;
  if cardinality(v_addon_ids) > 20 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'addon_ids');
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'price', x.price) order by x.sort_order, x.name), '[]'::jsonb),
    coalesce(sum(x.price), 0),
    count(*)
    into v_addons, v_addons_total, v_addons_found
    from public.addons x
   where x.id = any(v_addon_ids)
     and (x.is_active or p_mode <> 'online');
  if v_addons_found <> cardinality(v_addon_ids) then
    return jsonb_build_object('ok', false, 'code', 'addon_unavailable');
  end if;

  -- ---- Charity preference (optional; never an amount) ----------------------
  if nullif(p->>'charity_id', '') is not null then
    begin
      v_charity_id := (p->>'charity_id')::uuid;
    exception when invalid_text_representation then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'charity_id');
    end;
    if not exists (
      select 1 from public.charities c
      where c.id = v_charity_id
        and (p_mode <> 'online' or (c.is_active and s.charity_enabled))
    ) then
      return jsonb_build_object('ok', false, 'code', 'charity_unavailable');
    end if;
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

  v_travel := coalesce(private.travel_minutes(v_location), 0);
  v_fee := private.location_fee(v_location);
  v_end := v_start + make_interval(mins => v.duration_minutes);
  v_block_from := v_start - make_interval(mins => v_travel);
  v_block := v_end + make_interval(mins => v.buffer_minutes + v_travel);

  if p_mode = 'online' and not s.booking_enabled then
    return jsonb_build_object('ok', false, 'code', 'booking_disabled');
  end if;

  if p_mode in ('online', 'admin') then
    v_local_date := (v_start at time zone s.timezone)::date;
    select true, c.reason into v_found, v_reason
    from private.compute_slots(v.id, v_local_date, v_local_date, v_location) c
    where c.slot_start = v_start;

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
      start_time, end_time, blocked_from, blocked_until, travel_minutes, location_fee,
      status, customer_notes, admin_notes, source,
      idempotency_key, privacy_accepted_at, addons, addons_total
    ) values (
      private.new_booking_reference(), v.id, v.name, v.price, v.price_type,
      v_name, v_email, v_phone, v_vehicle, v_reg,
      v_location, v_address, v_postal, v_city, v_instructions,
      v_start, v_end, v_block_from, v_block, v_travel, v_fee,
      v_status, v_notes,
      case when p_mode = 'online' then null else private.clean_text(p->>'admin_notes') end,
      case when p_mode = 'online' then 'online' else 'admin' end,
      v_idem,
      case when p_mode = 'online' then now() else null end,
      v_addons, v_addons_total
    )
    returning * into v_row;

    -- Same transaction: the preference is saved together with the booking or not at all.
    if v_charity_id is not null then
      insert into public.appointment_charity_selections (appointment_id, charity_id)
      values (v_row.id, v_charity_id);
    end if;
  exception
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
    when unique_violation then
      -- Concurrent retry with the same idempotency key won the race.
      select * into v_existing from public.appointments where idempotency_key = v_idem;
      if found then
        return private.booking_result(v_existing, true);
      end if;
      raise;
  end;

  return private.booking_result(v_row, false);
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_reschedule_appointment — now keeps the travel window
-- -----------------------------------------------------------------------------
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
  v_travel integer;
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
    from private.compute_slots(a.service_id, v_local_date, v_local_date, a.location_type, a.id) c
    where c.slot_start = p_start;

    if v_found is null then
      return jsonb_build_object('ok', false, 'code', 'outside_business_hours');
    end if;
    if v_reason in ('past', 'booked', 'blocked') then
      return jsonb_build_object('ok', false, 'code', case v_reason when 'past' then 'time_in_past' else 'slot_unavailable' end);
    end if;
  end if;

  v_old_start := a.start_time;
  v_travel := coalesce(private.travel_minutes(a.location_type), 0);

  begin
    update public.appointments
       set start_time = p_start,
           end_time = p_start + make_interval(mins => v.duration_minutes),
           travel_minutes = v_travel,
           blocked_from = p_start - make_interval(mins => v_travel),
           blocked_until = p_start + make_interval(mins => v.duration_minutes + v.buffer_minutes + v_travel)
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

-- -----------------------------------------------------------------------------
-- admin_update_appointment_location — change location type and/or address.
-- Recomputes the travel window; overlaps are refused.
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_appointment_location(p_id uuid, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.appointments;
  v public.services;
  v_location public.location_type;
  v_address text := private.clean_text(p->>'service_address');
  v_postal text := private.clean_text(p->>'service_postal_code');
  v_city text := private.clean_text(p->>'service_city');
  v_instructions text := private.clean_text(p->>'address_instructions');
  v_travel integer;
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
    v_location := (p->>'location_type')::public.location_type;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'location_type');
  end;
  if v_location is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'location_type');
  end if;

  if v_location::text = 'workshop' then
    v_address := null; v_postal := null; v_city := null; v_instructions := null;
  else
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

  select * into v from public.services where id = a.service_id;
  v_travel := case when v_location = a.location_type then a.travel_minutes else coalesce(private.travel_minutes(v_location), 0) end;

  begin
    update public.appointments
       set location_type = v_location,
           service_address = v_address,
           service_postal_code = v_postal,
           service_city = v_city,
           address_instructions = v_instructions,
           travel_minutes = v_travel,
           -- a changed location type takes the fee configured for the new type
           location_fee = case when v_location = a.location_type then a.location_fee else private.location_fee(v_location) end,
           blocked_from = a.start_time - make_interval(mins => v_travel),
           blocked_until = a.end_time + make_interval(mins => v.buffer_minutes + v_travel)
     where id = p_id
     returning * into a;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  end;

  return jsonb_build_object('ok', true, 'appointment_id', a.id, 'location_type', a.location_type);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privacy: anonymisation also removes any pending review invitation.
-- -----------------------------------------------------------------------------
create or replace function private.anonymize_appointment_row(p_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.review_invitations where appointment_id = p_id;
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

-- -----------------------------------------------------------------------------
-- Reviews: invitation links and submission
-- -----------------------------------------------------------------------------
create or replace function private.hash_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Issues (or re-issues) the single-use review link for a completed booking.
-- Returns the raw token ONCE; only its hash is stored.
create or replace function private.issue_review_invitation(p_appointment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.appointments;
  v_token text;
  v_expires timestamptz := now() + interval '90 days';
begin
  select * into a from public.appointments where id = p_appointment_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if a.anonymized_at is not null then
    return jsonb_build_object('ok', false, 'code', 'anonymized');
  end if;
  if a.status <> 'completed' then
    return jsonb_build_object('ok', false, 'code', 'not_completed');
  end if;
  if exists (select 1 from public.reviews r where r.appointment_id = a.id) then
    return jsonb_build_object('ok', false, 'code', 'already_reviewed');
  end if;

  -- 256 random bits, URL-safe base64.
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');

  insert into public.review_invitations (appointment_id, token_hash, expires_at)
  values (a.id, private.hash_token(v_token), v_expires)
  on conflict (appointment_id) do update
    set token_hash = excluded.token_hash, created_at = now(), expires_at = excluded.expires_at, used_at = null;

  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_expires);
end;
$$;

-- For the admin dashboard ("Kopiera länk").
create or replace function public.admin_issue_review_invitation(p_appointment_id uuid)
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
  return private.issue_review_invitation(p_appointment_id);
end;
$$;

-- For the admin-notify Edge Function (service_role only), which emails the link.
create or replace function public.issue_review_invitation(p_appointment_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.issue_review_invitation(p_appointment_id);
$$;

-- Public: what the review page needs to know about a link. Reveals nothing
-- beyond the service, the visit month and the customer's first name.
create or replace function public.get_review_invitation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i public.review_invitations;
  a public.appointments;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  select * into i from public.review_invitations where token_hash = private.hash_token(p_token);
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  if i.used_at is not null or exists (select 1 from public.reviews r where r.appointment_id = i.appointment_id) then
    return jsonb_build_object('ok', false, 'code', 'already_submitted');
  end if;
  if i.expires_at < now() then
    return jsonb_build_object('ok', false, 'code', 'expired_token');
  end if;
  select * into a from public.appointments where id = i.appointment_id;
  if not found or a.anonymized_at is not null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  return jsonb_build_object(
    'ok', true,
    'service_name', a.service_name,
    'visit_date', a.start_time,
    'first_name', split_part(a.customer_name, ' ', 1)
  );
end;
$$;

-- Public: submit a review with a valid invitation token. One per booking.
create or replace function public.submit_review(p_token text, p_display_name text, p_rating integer, p_body text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  i public.review_invitations;
  a public.appointments;
  -- Stored as plain text: control characters and anything tag-like are removed.
  v_name text := private.clean_text(regexp_replace(coalesce(p_display_name, ''), '<[^>]*>', '', 'g'));
  v_body text := private.clean_text(regexp_replace(coalesce(p_body, ''), '<[^>]*>', '', 'g'));
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  select * into i from public.review_invitations where token_hash = private.hash_token(p_token) for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  if i.used_at is not null then
    return jsonb_build_object('ok', false, 'code', 'already_submitted');
  end if;
  if i.expires_at < now() then
    return jsonb_build_object('ok', false, 'code', 'expired_token');
  end if;
  select * into a from public.appointments where id = i.appointment_id;
  if not found or a.anonymized_at is not null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  if p_rating is null or p_rating not between 1 and 5 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'rating');
  end if;
  if v_name is null or char_length(v_name) not between 2 and 60 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'display_name');
  end if;
  if v_body is null or char_length(v_body) not between 10 and 1500 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'field', 'body');
  end if;

  begin
    insert into public.reviews (appointment_id, display_name, rating, body, service_name, verified)
    values (a.id, v_name, p_rating, v_body, a.service_name, true);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'already_submitted');
  end;
  update public.review_invitations set used_at = now() where appointment_id = a.id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Public: flag a published review for moderation. Never hides it by itself.
create or replace function public.report_review(p_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  update public.reviews set reported_at = coalesce(reported_at, now())
   where id = p_id and status = 'approved';
  select true;
$$;

-- -----------------------------------------------------------------------------
-- Charity programme: admin summary of customer preferences and donations
-- -----------------------------------------------------------------------------
create or replace function public.admin_charity_summary(p_from timestamptz default null, p_to timestamptz default null)
returns table (
  charity_id uuid,
  name text,
  is_active boolean,
  selections bigint,
  planned_amount numeric,
  approved_amount numeric,
  completed_amount numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select
      c.id,
      c.name,
      c.is_active,
      (select count(*) from public.appointment_charity_selections x
         join public.appointments a on a.id = x.appointment_id
        where x.charity_id = c.id
          and a.status <> 'cancelled'
          and (p_from is null or a.start_time >= p_from)
          and (p_to is null or a.start_time < p_to)),
      coalesce((select sum(d.amount) from public.donation_allocations d where d.charity_id = c.id and d.status = 'planned'), 0),
      coalesce((select sum(d.amount) from public.donation_allocations d where d.charity_id = c.id and d.status = 'approved'), 0),
      coalesce((select sum(d.amount) from public.donation_allocations d where d.charity_id = c.id and d.status = 'completed'), 0)
    from public.charities c
    order by c.sort_order, c.name;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_public_config — everything the public site needs, nothing more.
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
        'pickup_available', s.pickup_service_enabled,
        'mobile_available', s.mobile_service_enabled,
        'workshop_instructions', s.workshop_instructions,
        'pickup_info_text', s.pickup_info_text,
        'pickup_area_text', s.pickup_area_text,
        'pickup_fee', s.pickup_fee,
        'mobile_fee', s.mobile_fee,
        'pickup_postal_prefixes', to_jsonb(s.pickup_postal_prefixes),
        'mobile_postal_prefixes', to_jsonb(s.mobile_postal_prefixes),
        'charity_enabled', s.charity_enabled,
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
        'duration_text', v.duration_text,
        'price', v.price,
        'price_type', v.price_type,
        'image_key', v.image_key,
        'tagline', v.tagline,
        'features', to_jsonb(v.features),
        'is_highlighted', v.is_highlighted,
        'allow_workshop', v.allow_workshop,
        'allow_pickup', v.allow_pickup,
        'allow_mobile', v.allow_mobile
      ) order by v.sort_order, v.name)
      from public.services v where v.is_active
    ), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'slug', x.slug,
        'name', x.name,
        'description', x.description,
        'price', x.price
      ) order by x.sort_order, x.name)
      from public.addons x where x.is_active
    ), '[]'::jsonb),
    'business_hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', h.weekday,
        'opening_time', to_char(h.opening_time, 'HH24:MI'),
        'closing_time', to_char(h.closing_time, 'HH24:MI'),
        'is_closed', h.is_closed
      ) order by h.weekday)
      from public.business_hours h
    ), '[]'::jsonb),
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'logo_url', p.logo_url,
        'logo_background', p.logo_background,
        'website_url', p.website_url
      ) order by p.sort_order, p.name)
      from public.partners p where p.is_visible
    ), '[]'::jsonb),
    'charities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'slug', c.slug,
        'name', c.name,
        'description', c.description,
        'website_url', c.website_url,
        'logo_url', c.logo_url
      ) order by c.sort_order, c.name)
      from public.charities c
      where c.is_active and (select charity_enabled from public.business_settings where id = 1)
    ), '[]'::jsonb),
    -- Only donations marked as completed (actually paid) are ever public.
    'donations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'charity_name', d.name,
        'amount', d.total,
        'last_completed_at', d.last_at
      ) order by d.total desc)
      from (
        select c.name, sum(a.amount) as total, max(a.completed_at) as last_at
        from public.donation_allocations a
        join public.charities c on c.id = a.charity_id
        where a.status = 'completed'
        group by c.name
      ) d
    ), '[]'::jsonb),
    -- Only reviews approved by an administrator.
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'display_name', r.display_name,
        'rating', r.rating,
        'body', r.body,
        'service_name', r.service_name,
        'verified', r.verified,
        'published_at', r.published_at
      ) order by r.published_at desc)
      from (
        select * from public.reviews where status = 'approved' order by published_at desc limit 24
      ) r
    ), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- Function privileges (default privileges already revoke EXECUTE from the API roles)
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Pure validation helpers used by CHECK constraints on admin-writable tables.
grant execute on function public.valid_text_list(text[], integer, integer) to anon, authenticated;
grant execute on function public.valid_postal_prefixes(text[]) to anon, authenticated;

-- Public read-only endpoints
grant execute on function public.get_public_config() to anon, authenticated;
grant execute on function public.get_available_slots(uuid, date, date, text) to anon, authenticated;
grant execute on function public.health_check() to anon, authenticated;
grant execute on function public.get_review_invitation(text) to anon, authenticated;
grant execute on function public.submit_review(text, text, integer, text) to anon, authenticated;
grant execute on function public.report_review(uuid) to anon, authenticated;

-- Used inside RLS policies and by the admin UI
grant execute on function public.is_admin() to authenticated;

-- Admin RPCs (each re-checks is_admin())
grant execute on function public.admin_create_appointment(jsonb, boolean) to authenticated;
grant execute on function public.admin_reschedule_appointment(uuid, timestamptz, boolean) to authenticated;
grant execute on function public.admin_set_appointment_status(uuid, public.appointment_status) to authenticated;
grant execute on function public.admin_anonymize_appointment(uuid) to authenticated;
grant execute on function public.admin_apply_retention() to authenticated;
grant execute on function public.admin_update_appointment_location(uuid, jsonb) to authenticated;
grant execute on function public.admin_issue_review_invitation(uuid) to authenticated;
grant execute on function public.admin_charity_summary(timestamptz, timestamptz) to authenticated;

-- Server-only (Edge Functions with the service_role key)
grant execute on function public.create_booking(jsonb) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.issue_review_invitation(uuid) to service_role;
