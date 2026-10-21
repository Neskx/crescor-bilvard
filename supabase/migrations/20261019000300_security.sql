-- =============================================================================
-- Crescor Bilvård — Row Level Security and privileges (least privilege)
--
-- Anonymous visitors can ONLY:
--   * call get_public_config(), get_available_slots(), health_check()
-- They cannot read or write any table directly.
--
-- Authenticated users can only do something if they are listed in admin_users.
-- service_role (Edge Functions only, never the browser) bypasses RLS.
-- =============================================================================

alter table public.admin_users       enable row level security;
alter table public.business_settings enable row level security;
alter table public.services          enable row level security;
alter table public.business_hours    enable row level security;
alter table public.blocked_dates     enable row level security;
alter table public.appointments      enable row level security;
alter table public.contact_messages  enable row level security;
alter table public.notification_log  enable row level security;
alter table public.rate_limits       enable row level security;

-- ---- Table privileges -------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.admin_users to authenticated;
grant select, update on public.business_settings to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, update on public.business_hours to authenticated;
grant select, insert, update, delete on public.blocked_dates to authenticated;
-- Appointments: admins read and edit notes directly; status, time and creation
-- go through the admin_* RPCs so that scheduling rules are always applied.
grant select on public.appointments to authenticated;
grant update (admin_notes, vehicle_information, registration_number, customer_phone, customer_email, customer_name)
  on public.appointments to authenticated;
grant select, update, delete on public.contact_messages to authenticated;
grant select on public.notification_log to authenticated;
-- rate_limits: no grants at all (service_role only).

-- ---- Policies -----------------------------------------------------------------
create policy "admins read own membership" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

create policy "admins manage settings" on public.business_settings
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins manage services" on public.services
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins manage hours" on public.business_hours
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins manage blocked dates" on public.blocked_dates
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins read appointments" on public.appointments
  for select to authenticated using ((select public.is_admin()));

create policy "admins edit appointments" on public.appointments
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins manage messages" on public.contact_messages
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins read notification log" on public.notification_log
  for select to authenticated using ((select public.is_admin()));

-- ---- Function privileges ------------------------------------------------------
-- Supabase grants EXECUTE on new functions to anon/authenticated by default.
-- Revoke everything, then grant exactly what each role needs.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- Public read-only endpoints
grant execute on function public.get_public_config() to anon, authenticated;
grant execute on function public.get_available_slots(uuid, date, date) to anon, authenticated;
grant execute on function public.health_check() to anon, authenticated;

-- Used inside RLS policies and by the admin UI
grant execute on function public.is_admin() to authenticated;

-- Admin RPCs (each re-checks is_admin())
grant execute on function public.admin_create_appointment(jsonb, boolean) to authenticated;
grant execute on function public.admin_reschedule_appointment(uuid, timestamptz, boolean) to authenticated;
grant execute on function public.admin_set_appointment_status(uuid, public.appointment_status) to authenticated;
grant execute on function public.admin_anonymize_appointment(uuid) to authenticated;
grant execute on function public.admin_apply_retention() to authenticated;

-- Server-only (Edge Functions with the service_role key)
grant execute on function public.create_booking(jsonb) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
