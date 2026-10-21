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

-- The main service stays a placeholder priced on request; add-ons keep their real prices.
