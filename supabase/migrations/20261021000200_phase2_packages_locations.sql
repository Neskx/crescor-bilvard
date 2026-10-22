-- =============================================================================
-- Crescor Bilvård — Phase 2, part 1: service packages and location options
--
-- * Services get customer-facing details (duration range, included items,
--   label, highlight) and per-location availability.
-- * Three location options: workshop (Lämna bilen), pickup (Vi hämtar bilen)
--   and customer_address (Tvätt på plats). Pickup and on-site bookings reserve
--   configurable travel time BEFORE and AFTER the work, so the single team /
--   vehicle can never be booked into overlapping trips.
-- * Optional, admin-configured location fees. NULL = no fee is shown or charged.
-- * Optional postal-code zones per location. Empty = no restriction.
--
-- Existing appointments, services and ids are preserved. The old placeholder
-- service "biltvatt" is converted IN PLACE to "Enkel Tvätt", so its id and all
-- historical bookings (which keep their own name/price snapshot) stay intact.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Validation helpers usable in CHECK constraints. They live in `public` because
-- constraints are evaluated with the privileges of the writing role (admins
-- write through the Data API and have no access to the `private` schema).
-- -----------------------------------------------------------------------------
create or replace function public.valid_text_list(p text[], p_max_items integer, p_max_len integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p), 0) <= p_max_items
     and not exists (select 1 from unnest(p) x where x is null or char_length(btrim(x)) = 0 or char_length(x) > p_max_len);
$$;

create or replace function public.valid_postal_prefixes(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p), 0) <= 200
     and not exists (select 1 from unnest(p) x where x is null or x !~ '^[0-9]{1,5}$');
$$;

-- -----------------------------------------------------------------------------
-- Services: package details + per-location availability
-- -----------------------------------------------------------------------------
alter table public.services
  -- Customer-facing estimate, e.g. "1,5–2 timmar". Scheduling uses duration_minutes.
  add column duration_text  text check (char_length(duration_text) <= 40),
  -- Short label shown on the card, e.g. "Bas". Never a popularity claim unless confirmed.
  add column tagline        text check (char_length(tagline) <= 40),
  -- Included items, shown as a checklist. Editable in /admin.
  add column features       text[] not null default '{}' check (public.valid_text_list(features, 15, 120)),
  -- Visually emphasised card (e.g. the most comprehensive package).
  add column is_highlighted boolean not null default false,
  add column allow_workshop boolean not null default true,
  add column allow_pickup   boolean not null default true,
  add column allow_mobile   boolean not null default true;

-- -----------------------------------------------------------------------------
-- Business settings: location options
-- -----------------------------------------------------------------------------
alter table public.business_settings
  add column pickup_service_enabled  boolean not null default false,
  -- Shown when the customer chooses "Lämna bilen" (e.g. parking, key drop).
  add column workshop_instructions   text check (char_length(workshop_instructions) <= 500),
  -- Explains how collection and return are arranged. NULL = a neutral default text.
  add column pickup_info_text        text check (char_length(pickup_info_text) <= 500),
  add column pickup_area_text        text check (char_length(pickup_area_text) <= 300),
  -- Optional fees. NULL = no fee (nothing is shown or charged).
  add column pickup_fee              numeric(10, 2) check (pickup_fee is null or pickup_fee >= 0),
  add column mobile_fee              numeric(10, 2) check (mobile_fee is null or mobile_fee >= 0),
  -- Travel time reserved before AND after pickup / on-site appointments.
  add column pickup_travel_minutes   integer not null default 30 check (pickup_travel_minutes between 0 and 240),
  add column mobile_travel_minutes   integer not null default 30 check (mobile_travel_minutes between 0 and 240),
  -- Supported postal-code prefixes (e.g. {'211','212'}). Empty = no restriction.
  add column pickup_postal_prefixes  text[] not null default '{}' check (public.valid_postal_prefixes(pickup_postal_prefixes)),
  add column mobile_postal_prefixes  text[] not null default '{}' check (public.valid_postal_prefixes(mobile_postal_prefixes));

-- -----------------------------------------------------------------------------
-- Appointments: travel window and location fee snapshot
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column travel_minutes integer not null default 0 check (travel_minutes between 0 and 240),
  add column location_fee   numeric(10, 2) check (location_fee is null or location_fee >= 0),
  -- Start of the reserved period (start_time minus travel time).
  add column blocked_from   timestamptz;

update public.appointments set blocked_from = start_time where blocked_from is null;
alter table public.appointments alter column blocked_from set not null;

-- Keeps blocked_from consistent for any code path that sets or moves start_time
-- without specifying it explicitly.
create or replace function private.appointments_blocked_from()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.blocked_from is null
     or (tg_op = 'UPDATE' and new.start_time is distinct from old.start_time and new.blocked_from = old.blocked_from) then
    new.blocked_from := new.start_time - make_interval(mins => coalesce(new.travel_minutes, 0));
  end if;
  return new;
end;
$$;

create trigger appointments_blocked_from
  before insert or update on public.appointments
  for each row execute function private.appointments_blocked_from();

alter table public.appointments drop constraint appointment_times_valid;
alter table public.appointments add constraint appointment_times_valid
  check (blocked_from <= start_time and start_time < end_time and end_time <= blocked_until);

-- Address is required for every location except the workshop (pickup included).
alter table public.appointments drop constraint address_required_for_mobile;
alter table public.appointments add constraint address_required_for_mobile check (
  location_type::text = 'workshop'
  or anonymized_at is not null
  or (service_address is not null and service_postal_code is not null and service_city is not null)
);

-- THE double-booking guard, now covering travel time. Same name as before.
alter table public.appointments drop constraint no_overlapping_active_appointments;
alter table public.appointments add constraint no_overlapping_active_appointments
  exclude using gist (tstzrange(blocked_from, blocked_until, '[)') with &&)
  where (status in ('pending', 'confirmed'));

create index appointments_location_start_idx on public.appointments (location_type, start_time);

-- -----------------------------------------------------------------------------
-- Package catalogue. Durations are conservative scheduling defaults (upper end
-- of the estimates); the customer sees the range in duration_text.
-- -----------------------------------------------------------------------------
update public.services
   set slug = 'enkel-tvatt',
       name = 'Enkel Tvätt',
       description = 'En smidig och noggrann tvätt för dig som vill fräscha upp bilen och ge den ett välvårdat intryck.',
       duration_minutes = 120,
       duration_text = '1,5–2 timmar',
       price = 650,
       price_type = 'fixed',
       tagline = 'Bas',
       features = array['Smidig och noggrann tvätt', 'Fräschar upp bilens intryck', 'Exakt innehåll bekräftas vid bokningen'],
       image_key = 'utvandig',
       sort_order = 10,
       is_active = true,
       allow_mobile = false
 where slug = 'biltvatt'
   and not exists (select 1 from public.services where slug = 'enkel-tvatt');

insert into public.services
  (slug, name, description, duration_minutes, buffer_minutes, price, price_type, duration_text, tagline, features, image_key, sort_order, is_highlighted, allow_mobile)
values
  ('enkel-tvatt', 'Enkel Tvätt',
   'En smidig och noggrann tvätt för dig som vill fräscha upp bilen och ge den ett välvårdat intryck.',
   120, 30, 650, 'fixed', '1,5–2 timmar', 'Bas',
   array['Smidig och noggrann tvätt', 'Fräschar upp bilens intryck', 'Exakt innehåll bekräftas vid bokningen'],
   'utvandig', 10, false, false),
  ('mini-rekond', 'Mini Rekond',
   'En mer omfattande bilvård med extra fokus på detaljerna. Vi rengör fälgar, dammsuger kupén och arbetar noggrant med bilens invändiga ytor.',
   210, 30, 1200, 'fixed', '3–3,5 timmar', 'Mer detaljer',
   array['Handrengöring av fälgar', 'Dammsugning av kupén', 'Detaljrengöring med pensel', 'Noggrannare rengöring av invändiga ytor'],
   'invandig', 20, false, false),
  ('premium-rekond', 'Premium Rekond',
   'För dig som vill ge bilen extra omsorg. En grundlig rekond med textilrengöring, noggrant detaljarbete och fokus på ett så välvårdat resultat som möjligt.',
   300, 30, 1800, 'fixed', '4,5–5 timmar', 'Mest omfattande',
   array['Allt som ingår i Mini Rekond', 'Textilrengöring av klädsel', 'Grundligare detaljarbete', 'Extra fokus på finish och renhet', 'Omfattande invändig behandling'],
   'helrekond', 30, true, false)
on conflict (slug) do nothing;
