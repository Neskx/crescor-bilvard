-- =============================================================================
-- Crescor Bilvård — Phase 2, part 2: reviews, partners, charity programme
--
-- Integrity rules that matter here:
-- * Reviews are NEVER seeded. Only reviews submitted by customers through a
--   personal invitation link (one per completed booking) and approved by an
--   administrator are ever shown publicly.
-- * Partners: names/logos/links are editable data. No website URLs are invented.
-- * Charity programme: there is NO percentage and NO automatic calculation.
--   Customers only record a preferred cause. Administrators enter donation
--   amounts manually; only donations marked completed are shown publicly.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reviews
-- -----------------------------------------------------------------------------
create type public.review_status as enum ('pending', 'approved', 'rejected', 'hidden');

create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  -- One review per booking. NULL only if the booking is ever removed.
  appointment_id uuid unique references public.appointments (id) on delete set null,
  display_name   text not null check (char_length(display_name) between 2 and 60),
  rating         smallint not null check (rating between 1 and 5),
  body           text not null check (char_length(body) between 10 and 1500),
  -- Snapshot of the booked service, e.g. "Mini Rekond".
  service_name   text check (char_length(service_name) <= 80),
  -- True when the review came through a verified booking invitation.
  verified       boolean not null default false,
  status         public.review_status not null default 'pending',
  admin_note     text check (char_length(admin_note) <= 500),
  -- Set when a visitor reports a published review. Cleared by an administrator.
  reported_at    timestamptz,
  created_at     timestamptz not null default now(),
  moderated_at   timestamptz,
  published_at   timestamptz
);

create index reviews_status_published_idx on public.reviews (status, published_at desc);

create or replace function private.reviews_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.moderated_at := now();
    if new.status = 'approved' and new.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger reviews_moderation
  before update on public.reviews
  for each row execute function private.reviews_moderation();

-- Personal, single-use invitation links. Only a SHA-256 hash of the token is stored.
create table public.review_invitations (
  appointment_id uuid primary key references public.appointments (id) on delete cascade,
  token_hash     text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  used_at        timestamptz
);

alter table public.notification_log drop constraint notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check
  check (kind in ('booking_customer', 'booking_admin', 'confirmed', 'cancelled', 'rescheduled', 'contact_admin', 'review_invite'));

-- -----------------------------------------------------------------------------
-- Partners
-- -----------------------------------------------------------------------------
create table public.partners (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(btrim(name)) between 1 and 100),
  -- Bundled asset (/partners/…) or an uploaded file (https://…). NULL = placeholder.
  logo_url        text check (char_length(logo_url) <= 500 and logo_url ~ '^(/partners/[A-Za-z0-9._-]+|https://[^\s"''<>]+)$'),
  -- Tile background that suits the logo: 'light' for dark logos, 'dark' for light logos.
  logo_background text not null default 'light' check (logo_background in ('light', 'dark')),
  website_url     text check (char_length(website_url) <= 300 and website_url ~ '^https?://[^\s"''<>]+\.[^\s"''<>]+$'),
  sort_order      integer not null default 0,
  is_visible      boolean not null default true,
  admin_note      text check (char_length(admin_note) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index partners_name_unique on public.partners (lower(btrim(name)));

create trigger partners_updated_at
  before update on public.partners
  for each row execute function public.set_updated_at();

-- Logos supplied by the business. Only confident name ↔ logo matches are linked.
-- Two further supplied logos (/partners/jk.webp, /partners/pickaxe-m.webp) are
-- bundled but NOT linked: their owners must be confirmed in /admin first.
-- (The pickaxe/M logo was later confirmed as Metallotech's: see 20261022000100.)
insert into public.partners (name, logo_url, logo_background, sort_order, is_visible, admin_note) values
  ('Greentopia AB', '/partners/greentopia.webp', 'light', 10, true, null),
  ('BoxPark', '/partners/boxpark.webp', 'dark', 20, true, null),
  ('Korpera', '/partners/korpera.webp', 'dark', 30, true, null),
  ('Reklamex', '/partners/reklamx.webp', 'light', 40, true,
   'Logotypen skriver "REKLAMX" medan anteckningen säger "Reklamex" – bekräfta korrekt företagsnamn.'),
  ('Metallotech', null, 'light', 50, true,
   'Logotyp saknas. Den medföljande hacka/M-logotypen (/partners/pickaxe-m.webp) kan tillhöra Metallotech – bekräfta innan den kopplas.'),
  ('SSM', null, 'light', 60, true, 'Logotyp saknas – ladda upp en när den finns.'),
  ('Jöhlteam Konsult', null, 'light', 70, false,
   'Dold tills stavningen är bekräftad. Den medföljande JK-logotypen (/partners/jk.webp) kan tillhöra företaget – bekräfta innan den kopplas.')
on conflict do nothing;

-- Public bucket for uploaded partner logos. Guarded: local stacks may run without Storage.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('partner-logos', 'partner-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy "admins read partner logos" on storage.objects
      for select to authenticated using (bucket_id = 'partner-logos' and (select public.is_admin()))$p$;
    execute $p$create policy "admins upload partner logos" on storage.objects
      for insert to authenticated with check (bucket_id = 'partner-logos' and (select public.is_admin()))$p$;
    execute $p$create policy "admins update partner logos" on storage.objects
      for update to authenticated using (bucket_id = 'partner-logos' and (select public.is_admin()))$p$;
    execute $p$create policy "admins delete partner logos" on storage.objects
      for delete to authenticated using (bucket_id = 'partner-logos' and (select public.is_admin()))$p$;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Charity programme
-- -----------------------------------------------------------------------------
alter table public.business_settings
  -- Shows the charity section and the "Välj ändamål" booking step.
  add column charity_enabled boolean not null default true;

create table public.charities (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name        text not null check (char_length(btrim(name)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 300),
  website_url text check (char_length(website_url) <= 300 and website_url ~ '^https://[^\s"''<>]+\.[^\s"''<>]+$'),
  logo_url    text check (char_length(logo_url) <= 500 and logo_url ~ '^(/[A-Za-z0-9._/-]+|https://[^\s"''<>]+)$'),
  is_active   boolean not null default false,
  sort_order  integer not null default 0,
  -- Internal: verification status, contact person, etc. Never public.
  admin_note  text check (char_length(admin_note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger charities_updated_at
  before update on public.charities
  for each row execute function public.set_updated_at();

-- Websites verified against the organisations' own published material (2026-10).
insert into public.charities (slug, name, description, website_url, is_active, sort_order, admin_note) values
  ('world-food-programme', 'World Food Programme',
   'FN:s livsmedelsprogram ger mat och stöd till människor som drabbats av konflikter, katastrofer och hunger.',
   'https://www.wfp.org', true, 10, null),
  ('roda-korset', 'Svenska Röda Korset',
   'Humanitär frivilligorganisation som arbetar för att förebygga och lindra mänskligt lidande.',
   'https://www.rodakorset.se', true, 20, null),
  ('ny-gemenskap', 'Ny Gemenskap',
   'Ideell förening i Stockholm med dagverksamhet för människor i hemlöshet.',
   null, false, 30, 'Inaktiv tills organisationen och dess officiella webbplats är bekräftade.'),
  ('brostcancerforbundet', 'Bröstcancerförbundet',
   'Stöd till personer som berörs av bröstcancer.',
   'https://www.brostcancerforbundet.se', false, 40,
   'Inaktiv: bekräfta mottagare (Bröstcancerförbundet eller Cancerfondens Rosa Bandet) innan aktivering.')
on conflict (slug) do nothing;

-- The customer's preferred cause for a booking. Does not imply any amount.
create table public.appointment_charity_selections (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  charity_id     uuid not null references public.charities (id) on delete restrict,
  selected_at    timestamptz not null default now()
);

create index appointment_charity_selections_charity_idx on public.appointment_charity_selections (charity_id);

-- Donations decided and entered manually by the business.
--   planned   = preliminary amount, not yet decided
--   approved  = decided, not yet paid
--   completed = actually paid (only these are ever shown publicly)
create type public.donation_status as enum ('planned', 'approved', 'completed');

create table public.donation_allocations (
  id                uuid primary key default gen_random_uuid(),
  charity_id        uuid not null references public.charities (id) on delete restrict,
  -- Free text period label, e.g. "2026 Q4" or "Oktober 2026".
  accounting_period text not null check (char_length(btrim(accounting_period)) between 2 and 40),
  amount            numeric(12, 2) not null check (amount > 0),
  status            public.donation_status not null default 'planned',
  -- Payment reference / receipt number.
  reference         text check (char_length(reference) <= 200),
  notes             text check (char_length(notes) <= 1000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  approved_at       timestamptz,
  completed_at      timestamptz,
  -- One allocation per charity and period prevents accidental duplicates.
  constraint donation_allocations_period_unique unique (charity_id, accounting_period),
  constraint donation_completed_has_date check (status <> 'completed' or completed_at is not null)
);

create or replace function private.donation_status_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('approved', 'completed') and new.approved_at is null then
    new.approved_at := now();
  end if;
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  end if;
  if new.status <> 'completed' then
    new.completed_at := null;
  end if;
  if new.status = 'planned' then
    new.approved_at := null;
  end if;
  return new;
end;
$$;

create trigger donation_allocations_dates
  before insert or update on public.donation_allocations
  for each row execute function private.donation_status_dates();

create trigger donation_allocations_updated_at
  before update on public.donation_allocations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security: admins manage everything; the public reads ONLY through
-- get_public_config() and the narrow review RPCs.
-- -----------------------------------------------------------------------------
alter table public.reviews                        enable row level security;
alter table public.review_invitations             enable row level security;
alter table public.partners                       enable row level security;
alter table public.charities                      enable row level security;
alter table public.appointment_charity_selections enable row level security;
alter table public.donation_allocations           enable row level security;

revoke all on public.reviews, public.review_invitations, public.partners, public.charities,
  public.appointment_charity_selections, public.donation_allocations from anon, authenticated;

grant select, delete on public.reviews to authenticated;
grant update (status, admin_note, reported_at) on public.reviews to authenticated;
grant select on public.review_invitations to authenticated;
grant select, insert, update, delete on public.partners to authenticated;
grant select, insert, update, delete on public.charities to authenticated;
grant select on public.appointment_charity_selections to authenticated;
grant select, insert, update, delete on public.donation_allocations to authenticated;

create policy "admins manage reviews" on public.reviews
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins read review invitations" on public.review_invitations
  for select to authenticated using ((select public.is_admin()));
create policy "admins manage partners" on public.partners
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage charities" on public.charities
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins read charity selections" on public.appointment_charity_selections
  for select to authenticated using ((select public.is_admin()));
create policy "admins manage donations" on public.donation_allocations
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
