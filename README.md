# Crescor Bilvård

Website and online booking system for **Crescor Bilvård**, a Swedish car detailing
company. Swedish-language public site, real-time availability, atomic double-booking
protection, a secure admin dashboard, and transactional e-mail — on free-tier
infrastructure.

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS 4 · Supabase (PostgreSQL,
Auth, Edge Functions) · Resend (optional) · Lucide · Playwright/Vitest.

## Features

**Public site:** home (`/`), services overview (`/tjanster`), one page per service
(`/tjanster/:slug`), booking (`/boka`, `?tjanst=<slug>` preselects), about
(`/om-oss`), contact (`/kontakt`), privacy policy (`/integritetspolicy`), 404.
Official logo (`brand/logomain.png`) in header, footer, mobile menu, admin and
e-mails; favicon and social image generated from it. Per-page titles,
descriptions, canonical URLs, breadcrumbs (JSON-LD), sitemap. Before/after gallery
with comparison slider, interactive *Varför Crescor* showcase, mobile booking bar,
reduced-motion support.

**Offering:** one main service (currently a **placeholder**, `biltvatt`) plus
optional fixed-price add-ons (*tillägg*), shown as a price list on the home,
services and service pages. Add-ons are chosen in booking step 1, snapshotted
(name + price) on each booking, and shown in the summary, e-mails and admin.
They do not change the booked duration.

**Booking flow** (5 steps): service + add-ons → location (workshop and/or customer address)
→ weekly calendar (desktop grid / mobile day picker) → details → summary with
privacy consent → booking reference, `.ics` download, honest e-mail status.
Survives refreshes, retries safely, recovers from every server error code with a
specific Swedish message and keeps the customer's data.

**Admin** (`/admin`): login & password reset, bookings list (search, filters,
pagination), week calendar, booking drawer (confirm, reschedule with conflict
checks, mark completed, cancel, notes, e-mail log, GDPR anonymisation), manual
bookings, services (prices, durations, buffers, active), add-ons (name, price,
active), opening hours, blocked
periods, business settings with a launch checklist, contact messages, retention.

## Project structure

```
src/
  booking/          booking flow: draft state, steps, calendar, slot loading
  admin/            admin dashboard (lazy-loaded chunk) and its data access
  sections/         homepage sections
  components/       shared UI, logo (pure SVG), navbar, footer, slider, lightbox
  config/site.ts    images, gallery, fallbacks (no business facts here)
  lib/              Stockholm-timezone dates, formatting, Supabase client, messages
  services/api.ts   public API calls with timeouts and typed errors
supabase/
  migrations/       schema, booking functions, RLS, initial services
  functions/        create-booking, contact, admin-notify, health (+ _shared)
  seed.sql          LOCAL demo data only
scripts/            create-admin, health-check, generate-logo
tests/              unit (Vitest), db (Postgres integration), e2e (Playwright + axe)
docs/               DEPLOYMENT, MONITORING, BACKUP, SECURITY, IMAGE_CREDITS
.github/workflows/  ci, health-check, backup
public/             images, logo SVGs, _headers / _redirects / .htaccess
```

## Local development

Requirements: Node.js ≥ 22.18, Docker Desktop.

```bash
npm install
npm run db:start            # local Supabase: applies migrations + demo seed
npx supabase status -o env  # shows API_URL and PUBLISHABLE_KEY
```

Create `.env.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:55421
VITE_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY from status>
```

Create a local admin and start the site:

```bash
SUPABASE_URL=http://127.0.0.1:55421 SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> \
  ADMIN_PASSWORD=LocalDevAdmin2026 node scripts/create-admin.mjs admin@crescor.test
npm run dev                 # http://localhost:5173  ·  admin: /admin
```

The local stack uses ports 554xx (configured in `supabase/config.toml`) so it can
run next to other Supabase projects. For local testing, create
`supabase/functions/.env` with `BOOKING_RATE_LIMIT_PER_HOUR=1000` (git-ignored).

## Testing

```bash
npm run typecheck
npm run lint
npm test            # 60 unit/component tests (validation, dates/DST, draft, e-mail templates, UI)
npm run test:db     # 30 integration tests against local Postgres (RLS, rules, concurrency, retention)
npm run test:e2e    # 20 Playwright tests: booking (desktop + mobile), slot race, admin, contact, subpages, axe a11y on every page
```

The DB and E2E suites need the local stack and the local admin above, and refuse
to run against hosted Supabase. E2E creates bookings in the local DB;
`npm run db:reset` wipes it (re-create the admin afterwards).

## Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Supabase project, migrations,
auth, first admin, Edge Functions & secrets, e-mail, business configuration,
Cloudflare Pages or cPanel, domain, monitoring, production test, backups.

## Before launch — needs the business 🔑

- Supabase project (EU region), Resend account + verified domain, hosting, domain.
- Real phone, e-mail, address/service area, org.nr, opening hours, blocked dates.
- Replace the **placeholder main service** (`Biltvätt`): name, description, image,
  **duration/buffer** and price in /admin → Tjänster.
- Review add-on prices and descriptions (/admin → Tjänster → Tillägg).
- Decide automatic vs manual confirmation.
- Own before/after photos → replace gallery images and set `GALLERY_IS_DEMO = false`.
- Optional real facts for *Om oss* (`ABOUT_EXTRA` in `src/sections/About.tsx`).
- Review the privacy policy (`src/pages/PrivacyPage.tsx`): region, suppliers, host.
- Verify image licences ([docs/IMAGE_CREDITS.md](docs/IMAGE_CREDITS.md)).
- Set up backups ([docs/BACKUP.md](docs/BACKUP.md)) and monitoring ([docs/MONITORING.md](docs/MONITORING.md)).

Nothing on the site invents business facts: unconfigured contact details are
hidden, services show “Pris enligt offert” until a price is entered, and online
booking stays off until enabled in admin.

## Editing content

| What | Where |
|---|---|
| Contact info, booking rules, opening-hours text | `/admin → Inställningar` |
| Services, prices, durations | `/admin → Tjänster` |
| Bookable hours / holidays | `/admin → Öppettider`, `Blockerade tider` |
| Marketing copy | `src/sections/*.tsx` |
| Gallery | `src/config/site.ts` + `public/images/` |
| Logo | replace `brand/logomain.png`, then `npm run logo` |
