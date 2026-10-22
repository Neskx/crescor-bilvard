-- =============================================================================
-- Crescor Bilvård — new location option "Vi hämtar bilen" (pickup).
--
-- Kept in its own migration: PostgreSQL does not allow a newly added enum value
-- to be used in the same transaction that adds it.
--
--   workshop          Lämna bilen     – customer brings the car to the workshop
--   pickup            Vi hämtar bilen – we collect the car and return it
--   customer_address  Tvätt på plats  – we wash the car at the customer's address
-- =============================================================================

alter type public.location_type add value if not exists 'pickup';
