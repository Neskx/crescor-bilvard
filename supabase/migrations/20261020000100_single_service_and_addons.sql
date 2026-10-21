-- =============================================================================
-- Crescor Bilvård — one main service + optional add-ons (tillägg)
--
-- * The catalogue is reduced to ONE main service. It is a PLACEHOLDER: name,
--   description, duration and price must be set by the business in
--   /admin → Tjänster before launch.
-- * Add-ons are fixed-price extras the customer can tick when booking. They do
--   not change the booked duration (adjust the service's buffer if needed).
-- * Each appointment stores a snapshot of the chosen add-ons (name + price) so
--   later price changes never alter existing bookings.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Add-ons
-- -----------------------------------------------------------------------------
create table public.addons (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name        text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 300),
  price       numeric(10, 2) not null check (price >= 0),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger addons_updated_at
  before update on public.addons
  for each row execute function public.set_updated_at();

alter table public.addons enable row level security;
grant select, insert, update, delete on public.addons to authenticated;
create policy "admins manage addons" on public.addons
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.addons (slug, name, description, price, sort_order)
values
  ('djurhar', 'Borttagning av djurhår', 'Noggrann borttagning av djurhår från säten, mattor och klädsel.', 100, 10),
  ('keramiskt-sprayvax', 'Keramiskt sprayvax', 'Ger lacken extra glans och ett skyddande, vattenavvisande lager.', 100, 20),
  ('flackborttagning', 'Fläckborttagning', 'Behandling av enskilda fläckar i klädsel och mattor.', 50, 30),
  ('vattenavvisande-vindruta', 'Vattenavvisande vindruta', 'Behandling som får regnvatten att pärla av för bättre sikt.', 50, 40),
  ('luktbehandling', 'Luktbehandling', 'Neutraliserar dålig lukt i kupén.', 100, 50),
  ('extra-smutsig-bil', 'Extra smutsig bil', 'Tillägg när bilen är extra smutsig och kräver mer arbete.', 150, 60);

-- -----------------------------------------------------------------------------
-- Appointments: snapshot of the chosen add-ons
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column addons jsonb not null default '[]'::jsonb check (jsonb_typeof(addons) = 'array'),
  add column addons_total numeric(10, 2) not null default 0 check (addons_total >= 0);

-- -----------------------------------------------------------------------------
-- Catalogue: one placeholder main service replaces the initial suggestions.
-- Suggested services without bookings are removed; any that already have
-- bookings are only deactivated so their history stays intact.
-- -----------------------------------------------------------------------------
insert into public.services (slug, name, description, duration_minutes, buffer_minutes, price_type, image_key, sort_order)
values
  ('biltvatt', 'Biltvätt',
   'Platshållare – beskrivningen av tjänsten uppdateras inom kort. Välj gärna tillägg för att anpassa behandlingen efter din bil.',
   120, 30, 'on_request', 'utvandig', 10)
on conflict (slug) do nothing;

delete from public.services s
 where s.slug in ('invandig-rekond', 'utvandig-rekond', 'helrekond', 'polering-lackvard', 'kladsel-satesrengoring', 'specialbehandlingar')
   and not exists (select 1 from public.appointments a where a.service_id = s.id);

update public.services
   set is_active = false
 where slug in ('invandig-rekond', 'utvandig-rekond', 'helrekond', 'polering-lackvard', 'kladsel-satesrengoring', 'specialbehandlingar');

-- -----------------------------------------------------------------------------
-- get_public_config(): now also returns the active add-ons.
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
    ), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- private.insert_appointment: unchanged from 20261019000200 except for add-ons
-- (validated, snapshotted into appointments.addons / addons_total and returned).
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
  v_addon_ids uuid[];
  v_addons jsonb;
  v_addons_total numeric(10, 2);
  v_addons_found integer;
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
        'service_name', v_existing.service_name,
        'addons', v_existing.addons,
        'addons_total', v_existing.addons_total
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

  -- ---- Add-ons (trusted server-side names and prices) ----------------------
  -- addon_ids is an optional JSON array of add-on ids. Duplicates are ignored.
  -- Online bookings may only use active add-ons; admins may also use inactive ones.
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
      idempotency_key, privacy_accepted_at, addons, addons_total
    ) values (
      private.new_booking_reference(), v.id, v.name, v.price, v.price_type,
      v_name, v_email, v_phone, v_vehicle, v_reg,
      v_location, v_address, v_postal, v_city, v_instructions,
      v_start, v_end, v_block, v_status, v_notes,
      case when p_mode = 'online' then null else private.clean_text(p->>'admin_notes') end,
      case when p_mode = 'online' then 'online' else 'admin' end,
      v_idem,
      case when p_mode = 'online' then now() else null end,
      v_addons, v_addons_total
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
          'service_name', v_existing.service_name,
          'addons', v_existing.addons,
          'addons_total', v_existing.addons_total
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
    'service_name', v_row.service_name,
    'addons', v_row.addons,
    'addons_total', v_row.addons_total
  );
end;
$$;
