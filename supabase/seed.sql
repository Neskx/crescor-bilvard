-- =============================================================================
-- LOCAL DEVELOPMENT SEED ONLY — applied by `supabase db reset` on your machine.
-- It is NEVER applied to the production project by `supabase db push`.
--
-- Everything here is demonstration data, clearly marked [DEMO].
-- =============================================================================

update public.business_settings set
  company_phone = '[DEMO] 070-000 00 00',
  company_email = 'demo@example.com',
  company_address = '[DEMO] Exempelgatan 1, 123 45 Exempelstad',
  opening_hours_text = '[DEMO] Mån–fre 08–17',
  service_area_text = '[DEMO] Exempelstad med omnejd',
  booking_enabled = true,
  workshop_service_enabled = true,
  mobile_service_enabled = true,
  auto_confirm = false,
  booking_notice_hours = 12,
  notification_email = 'admin@example.com'
where id = 1;

update public.business_hours set is_closed = false, opening_time = '08:00', closing_time = '17:00'
where weekday between 1 and 5;

update public.business_hours set is_closed = false, opening_time = '10:00', closing_time = '15:00'
where weekday = 6;

-- Phase 2 location options (local demo only). Fees stay unset: nothing is charged
-- unless the business configures it. On-site washing is enabled for one package
-- so the per-package rule can be tried locally.
update public.business_settings set
  pickup_service_enabled = true,
  pickup_area_text = '[DEMO] Exempelstad med omnejd',
  workshop_instructions = '[DEMO] Parkera på markerad plats och lämna nyckeln i receptionen.'
where id = 1;

update public.services set allow_mobile = true where slug = 'enkel-tvatt';

-- Package prices come from the migrations; add-ons keep their real prices.
