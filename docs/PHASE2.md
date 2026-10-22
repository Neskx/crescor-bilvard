# Phase 2 — packages, locations, reviews, partners, charity

## What changed

| Area | Summary |
|---|---|
| Packages | Enkel Tvätt (650 kr, 120 min booked), Mini Rekond (1 200 kr, 210 min), Premium Rekond (1 800 kr, 300 min). Customer-facing ranges (`duration_text`), included items (`features`), label and highlight are editable in **/admin → Tjänster & priser**. |
| Locations | *Lämna bilen*, *Vi hämtar bilen* (new) and *Tvätt på plats*. Pickup/on-site bookings reserve travel time **before and after** the work; the single exclusion constraint prevents overlapping trips. Optional fees (empty = no fee), postal-code zones and per-package availability in **/admin → Platser & hämtning**. |
| Booking flow | Tjänst → Plats → Tid → Uppgifter → Ändamål (hidden when the programme is off or no cause is active) → Bekräfta. The cause is saved in the same transaction as the booking. |
| Reviews | Only via a single-use link for a **completed** booking (drawer → *Skicka inbjudan* / *Kopiera länk*). Nothing is public until approved in **/admin → Recensioner**. No reviews or ratings are seeded; no rating is added to structured data. |
| Partners | Table `partners`, shown as a slowly scrolling, translucent logo strip (pauses on hover/focus; static for reduced motion); supplied logos optimised to `public/partners/*.webp` (originals in `brand/partners/`, regenerate with `node scripts/process-partner-logos.mjs`). Managed in **/admin → Samarbetspartners** (upload needs the `partner-logos` Storage bucket). |
| Charity | No percentage and no automatic calculation. Customers record a preferred cause; the business enters donations manually as *Preliminär → Godkänd → Genomförd*. Only *Genomförd* totals are public. CSV export in **/admin → Välgörenhet**. |

## Database migrations

```
20261021000100_location_pickup.sql                    new enum value 'pickup' (own transaction)
20261021000200_phase2_packages_locations.sql          service/settings/appointment columns, travel-aware overlap guard, packages
20261021000300_phase2_reviews_partners_charities.sql  new tables, RLS, seed partners/causes, Storage bucket (guarded)
20261021000400_phase2_functions.sql                   scheduling, booking insert, review RPCs, public config, grants
```

* Additive only: no table is dropped, no appointment deleted. The placeholder
  service `biltvatt` is converted **in place** to *Enkel Tvätt* (same id); old
  bookings keep their own name/price snapshot. `/tjanster/biltvatt` redirects.
* Tested by applying them incrementally (`supabase migration up`) on a database
  with an existing booking, which kept its id, service link and snapshot.
* ⚠️ `.github/workflows/deploy-supabase.yml` applies migrations and deploys Edge
  Functions **on every push to `main`**. Pushing this branch to `main` deploys it.

## Configuration after deploying

1. **Edge Function secret `SITE_URL`** must be set (already listed in DEPLOYMENT.md §5) — the review e-mail links to `${SITE_URL}/recension`. Without it, use *Kopiera länk* in the booking drawer.
2. **/admin → Platser & hämtning**: turn on *Vi hämtar bilen* if wanted; set areas, zones, travel time (default 30 min each way) and fees (leave empty for none).
3. **On-site washing is off for all three packages** until enabled per package (it is not assumed). If *Tvätt på plats* was enabled before, customers won't see it until you tick packages here.
4. **/admin → Välgörenhet**: the programme is on; WFP and Svenska Röda Korset are active.
5. No new environment variables for the frontend. No new Edge Functions (`admin-notify` handles review invitations).

## Needs confirmation by the business owner

* Exact contents of **Enkel Tvätt** (seeded as neutral points incl. "Exakt innehåll bekräftas vid bokningen").
* Whether on-site washing is offered, and for which packages; pickup/on-site **fees** and **zones**.
* Partner names/logos: **Reklamex** vs the logo text **REKLAMX**; whether the green **JK** logo belongs to **Jöhlteam Konsult** (spelling unconfirmed — hidden); Partner website URLs (none were invented). *(Confirmed 2026-10-22: the pickaxe/M logo is Metallotech's; SSM removed — migration 20261022000100.)*
* Causes: **Ny Gemenskap** (exists in Stockholm, official website not verified — inactive) and the breast-cancer recipient (**Bröstcancerförbundet** vs Cancerfonden's Rosa Bandet — inactive). Permission before showing any charity logo.
* Whether a "Populär" label may be used (none is shown).
