# Security and privacy design

## Trust boundaries

```
Browser (public)                Supabase
───────────────                 ─────────────────────────────────────────────
anon / publishable key  ──►  PostgREST ──► get_public_config()   (read-only, no PII)
                                         ──► get_available_slots() (times + boolean only)
                                         ──► health_check()
                        ──►  Edge Function create-booking ─┐
                        ──►  Edge Function contact        ─┤ service_role (server only)
admin session (JWT)     ──►  Edge Function admin-notify   ─┘   ──► create_booking() …
admin session (JWT)     ──►  PostgREST ──► tables via RLS (admins only) + admin_* RPCs
```

- The browser only ever holds the **publishable/anon key**. The service-role key
  exists only inside Edge Functions (injected by Supabase) and on the machine of
  whoever runs `scripts/create-admin.mjs`.
- Anonymous users have **no table privileges at all** (`revoke all … from anon`).
  They can execute exactly three read-only functions.
- `create_booking()` can only be executed by `service_role`, i.e. through the
  `create-booking` Edge Function, which validates input, rate-limits per IP,
  and verifies Turnstile when configured.
- Signed-in users get nothing unless their user id is in `admin_users`
  (`is_admin()` in every policy and every `admin_*` function).

## Double-booking prevention (defence in depth)

1. The UI shows availability computed by the database.
2. On submit, the database **recomputes** availability for that exact slot with
   the same function (`private.compute_slots`) — the frontend is never trusted.
3. All booking writes take a transaction-level advisory lock.
4. A PostgreSQL **exclusion constraint** (`no_overlapping_active_appointments`)
   makes overlapping active appointments impossible, whatever code path writes.
   Pending bookings count, so they cannot be double-booked either.
5. An **idempotency key** per booking draft makes retries (double clicks,
   timeouts, refreshes, closed browsers) return the original booking instead of
   creating a second one.

Verified by `tests/db/booking.test.ts` (12 simultaneous requests → exactly one
succeeds; direct inserts bypassing the function are rejected) and by the
two-browser race in `tests/e2e/booking.spec.ts`.

## Input handling

- Validation rules are shared between browser and Edge Functions
  (`supabase/functions/_shared/validation.ts`) and enforced again in SQL
  (length `CHECK` constraints, format checks in `insert_appointment`).
- Duration, buffer and price always come from the `services` table; any
  client-supplied values are ignored.
- All database access is parameterised (supabase-js / PostgREST, or SQL functions
  with typed arguments). The admin search strips PostgREST filter syntax.
- React escapes all rendered text; e-mail templates escape every value
  (`escapeHtml`, unit-tested).
- Request bodies are size-limited (32 KB) in Edge Functions.

## Abuse protection

- Per-IP fixed-window rate limits in Edge Functions (bookings 10/h, contact 5/h,
  configurable). IPs are stored only as salted SHA-256 hashes for ≤2 days.
- Per-e-mail limit in the database: max 3 active online bookings per 24 h.
- Honeypot field on the contact form.
- Optional Cloudflare Turnstile on booking and contact forms.

## Browser hardening

`public/_headers` and `public/.htaccess` set a strict Content-Security-Policy
(scripts only from self and Turnstile), HSTS, `X-Frame-Options: DENY`,
`nosniff`, a restrictive `Permissions-Policy`, and `noindex` for `/admin`.
Fonts are self-hosted (no requests to Google). No analytics or tracking.

## Error handling

Edge Functions log errors **without request bodies or personal data** and
return stable error codes; the UI maps codes to specific Swedish messages.

## Privacy (GDPR) support

- Data minimisation: only data needed for the booking is collected; vehicle
  details are optional.
- Configurable retention (`business_settings.retention_days`, default 730):
  *Gallra nu* in admin, or nightly via `pg_cron` (see DEPLOYMENT.md).
- Per-booking anonymisation for erasure requests (admin booking drawer).
- Editable privacy policy template at `/integritetspolicy`
  (`src/pages/PrivacyPage.tsx`) — must be reviewed by the business.

This technical setup **supports** GDPR compliance but does not by itself
guarantee it: a legal basis, processor agreements (Supabase, Resend, host),
routines for data-subject requests and an accurate privacy policy are the
business's responsibility.

## Operational checklist

- [ ] Signups disabled in Supabase Auth
- [ ] `ALLOWED_ORIGINS`, `HEALTH_CHECK_TOKEN`, `RATE_LIMIT_SALT` set
- [ ] Repository private; no `.env*` files committed (`git status` before pushing)
- [ ] Admins use unique, strong passwords; remove admins who leave
- [ ] Backups configured and a restore tested
- [ ] Privacy policy reviewed and supplier list/region filled in
