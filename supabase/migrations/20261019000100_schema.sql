-- =============================================================================
-- Crescor Bilvård — core schema
-- All timestamps are stored as timestamptz (UTC). Local business logic uses the
-- timezone configured in business_settings (default Europe/Stockholm).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.appointment_status as enum ('pending', 'confirmed', 'cancelled', 'completed');
create type public.location_type as enum ('workshop', 'customer_address');
create type public.price_type as enum ('fixed', 'from', 'on_request');

-- -----------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Administrators (linked to Supabase Auth users)
-- -----------------------------------------------------------------------------
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Business settings (exactly one row, id = 1)
-- -----------------------------------------------------------------------------
create table public.business_settings (
  id                      smallint primary key default 1 check (id = 1),
  company_name            text not null default 'Crescor Bilvård' check (char_length(company_name) between 1 and 120),
  company_phone           text check (char_length(company_phone) <= 40),
  company_email           text check (char_length(company_email) <= 254),
  -- Address of the company's own premises. NULL = no workshop configured.
  company_address         text check (char_length(company_address) <= 300),
  -- Free text shown on the site, e.g. "Mån–fre 08–17". NULL = not shown.
  opening_hours_text      text check (char_length(opening_hours_text) <= 300),
  -- Area served for mobile detailing, e.g. "Malmö med omnejd". NULL = not shown.
  service_area_text       text check (char_length(service_area_text) <= 300),
  org_number              text check (char_length(org_number) <= 20),
  timezone                text not null default 'Europe/Stockholm',
  booking_enabled         boolean not null default false,
  workshop_service_enabled boolean not null default false,
  mobile_service_enabled  boolean not null default false,
  -- If true, online bookings are confirmed immediately; otherwise they are
  -- registered as 'pending' and must be confirmed by an administrator.
  -- Pending bookings still reserve their time slot.
  auto_confirm            boolean not null default false,
  booking_notice_hours    integer not null default 24 check (booking_notice_hours between 0 and 720),
  booking_horizon_days    integer not null default 60 check (booking_horizon_days between 1 and 365),
  slot_interval_minutes   integer not null default 30 check (slot_interval_minutes in (15, 20, 30, 45, 60, 90, 120)),
  retention_days          integer not null default 730 check (retention_days between 30 and 3650),
  -- Where administrator notifications are sent. Falls back to company_email.
  notification_email      text check (char_length(notification_email) <= 254),
  updated_at              timestamptz not null default now(),
  -- An unknown timezone name raises an error here, rejecting the write.
  constraint valid_timezone check (('2000-01-01 00:00:00+00'::timestamptz at time zone timezone) is not null)
);

create trigger business_settings_updated_at
  before update on public.business_settings
  for each row execute function public.set_updated_at();

insert into public.business_settings (id) values (1);

-- -----------------------------------------------------------------------------
-- Services
-- -----------------------------------------------------------------------------
create table public.services (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name             text not null check (char_length(name) between 2 and 80),
  description      text not null default '' check (char_length(description) <= 600),
  duration_minutes integer not null check (duration_minutes between 15 and 720),
  buffer_minutes   integer not null default 0 check (buffer_minutes between 0 and 240),
  price            numeric(10, 2) check (price is null or price >= 0),
  price_type       public.price_type not null default 'on_request',
  image_key        text check (char_length(image_key) <= 60),
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint price_matches_type check (
    (price_type = 'on_request') or (price is not null)
  )
);

create trigger services_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Business hours (one row per ISO weekday, 1 = Monday … 7 = Sunday)
-- -----------------------------------------------------------------------------
create table public.business_hours (
  weekday      smallint primary key check (weekday between 1 and 7),
  opening_time time not null default '08:00',
  closing_time time not null default '17:00',
  is_closed    boolean not null default true,
  constraint opening_before_closing check (is_closed or opening_time < closing_time)
);

-- Closed by default: no opening hours are assumed until the business sets them.
insert into public.business_hours (weekday) select g from generate_series(1, 7) g;

-- -----------------------------------------------------------------------------
-- Blocked periods (holidays, vacations, other unavailability)
-- -----------------------------------------------------------------------------
create table public.blocked_dates (
  id         uuid primary key default gen_random_uuid(),
  start_time timestamptz not null,
  end_time   timestamptz not null,
  reason     text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  constraint blocked_range_valid check (start_time < end_time)
);

create index blocked_dates_range_idx on public.blocked_dates using gist (tstzrange(start_time, end_time, '[)'));

-- -----------------------------------------------------------------------------
-- Appointments
-- -----------------------------------------------------------------------------
create table public.appointments (
  id                   uuid primary key default gen_random_uuid(),
  booking_reference    text not null unique check (booking_reference ~ '^CB-[A-Z0-9]{6}$'),
  service_id           uuid not null references public.services (id) on delete restrict,
  -- Snapshot of the service at booking time (the service may later be renamed).
  service_name         text not null check (char_length(service_name) <= 80),
  price_snapshot       numeric(10, 2),
  price_type_snapshot  public.price_type not null default 'on_request',
  customer_name        text not null check (char_length(customer_name) between 1 and 100),
  customer_email       text not null check (char_length(customer_email) between 3 and 254),
  customer_phone       text not null check (char_length(customer_phone) between 1 and 40),
  vehicle_information  text check (char_length(vehicle_information) <= 100),
  registration_number  text check (char_length(registration_number) <= 12),
  location_type        public.location_type not null,
  service_address      text check (char_length(service_address) <= 120),
  service_postal_code  text check (char_length(service_postal_code) <= 10),
  service_city         text check (char_length(service_city) <= 60),
  address_instructions text check (char_length(address_instructions) <= 500),
  start_time           timestamptz not null,
  end_time             timestamptz not null,
  -- end_time + service buffer: the period during which no other booking may start.
  blocked_until        timestamptz not null,
  status               public.appointment_status not null default 'pending',
  customer_notes       text check (char_length(customer_notes) <= 1000),
  admin_notes          text check (char_length(admin_notes) <= 2000),
  source               text not null default 'online' check (source in ('online', 'admin')),
  idempotency_key      uuid unique,
  privacy_accepted_at  timestamptz,
  anonymized_at        timestamptz,
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint appointment_times_valid check (start_time < end_time and end_time <= blocked_until),
  constraint address_required_for_mobile check (
    location_type <> 'customer_address'
    or anonymized_at is not null
    or (service_address is not null and service_postal_code is not null and service_city is not null)
  ),
  -- THE double-booking guard. Two active (pending/confirmed) appointments can
  -- never have overlapping [start_time, blocked_until) ranges. This is enforced
  -- by PostgreSQL itself, regardless of which code path inserts or updates.
  constraint no_overlapping_active_appointments
    exclude using gist (tstzrange(start_time, blocked_until, '[)') with &&)
    where (status in ('pending', 'confirmed'))
);

create index appointments_start_idx on public.appointments (start_time);
create index appointments_status_start_idx on public.appointments (status, start_time);
create index appointments_email_created_idx on public.appointments (lower(customer_email), created_at);

create trigger appointments_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Contact form messages
-- -----------------------------------------------------------------------------
create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 100),
  email      text not null check (char_length(email) between 3 and 254),
  phone      text check (char_length(phone) <= 40),
  message    text not null check (char_length(message) between 1 and 3000),
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index contact_messages_created_idx on public.contact_messages (created_at desc);

-- -----------------------------------------------------------------------------
-- Notification log (what was sent, and whether the provider accepted it)
-- -----------------------------------------------------------------------------
create table public.notification_log (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments (id) on delete cascade,
  kind           text not null check (kind in ('booking_customer', 'booking_admin', 'confirmed', 'cancelled', 'rescheduled', 'contact_admin')),
  status         text not null check (status in ('sent', 'failed', 'not_configured')),
  provider_id    text check (char_length(provider_id) <= 200),
  error          text check (char_length(error) <= 500),
  created_at     timestamptz not null default now()
);

create index notification_log_appointment_idx on public.notification_log (appointment_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Rate limiting buckets (keys are salted hashes, never raw IP addresses)
-- -----------------------------------------------------------------------------
create table public.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 1,
  primary key (bucket, window_start)
);
