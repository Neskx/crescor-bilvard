# Deployment guide

Everything below is done once. Items marked **🔑** need an account, credential
or business decision that only the business owner can provide.

Overview of what runs where:

| Part | Runs on | Cost |
|---|---|---|
| Website (static files) | Cloudflare Pages (recommended), Netlify or cPanel | Free tiers allow commercial use* |
| Database, admin login, availability, booking logic | Supabase (PostgreSQL + Auth) | Free plan |
| Booking / contact / notification endpoints | Supabase Edge Functions | Free plan |
| Transactional e-mail | Resend (optional) | Free tier |
| Uptime check | GitHub Actions | Free |

\* Check the current terms of the host you choose. Vercel's free “Hobby” plan
and GitHub Pages are **not** intended for commercial sites, so they are not
recommended here.

---

## 1. Create the Supabase project 🔑

1. Sign up at <https://supabase.com> and create a project.
2. **Region:** choose an EU region (e.g. *Stockholm* `eu-north-1` or *Frankfurt*)
   — keeps customer data in the EU/EEA. Update the privacy policy to match
   (`src/pages/PrivacyPage.tsx`, “[Ange vald serverregion…]”).
3. Save the database password in a password manager.

## 2. Apply the database migrations

```bash
npx supabase login
npx supabase link --project-ref <YOUR-PROJECT-REF>
npx supabase db push          # applies supabase/migrations/*.sql
```

`db push` does **not** apply `supabase/seed.sql` (demo data for local development only).

After the first manual deploy, the `Deploy Supabase` workflow
(`.github/workflows/deploy-supabase.yml`) applies new migrations and redeploys
the Edge Functions automatically on every push to `main` that touches
`supabase/`. It needs the repository secret `SUPABASE_ACCESS_TOKEN` and the
repository variable `SUPABASE_PROJECT_REF`.

After pushing, the database contains: the schema, Row Level Security, booking
functions, the six suggested services (no prices, durations to be reviewed),
all weekdays **closed**, and online booking **disabled**. Nothing is bookable
until you configure it in step 7.

## 3. Configure authentication

In the Supabase dashboard → **Authentication**:

1. **Sign In / Providers → User Signups:** turn **off** “Allow new users to sign
   up”. Administrators are created only with the script in step 4.
2. **URL Configuration:** set *Site URL* to `https://www.your-domain.se` and add
   `https://www.your-domain.se/admin` to *Redirect URLs* (used by “Glömt
   lösenordet?”).
3. **Recommended – SMTP:** Supabase's built-in mailer for password-reset e-mails
   is heavily rate-limited. Under **Emails → SMTP Settings** enter SMTP details
   (Resend provides SMTP credentials) so reset e-mails are delivered reliably.
4. Optional: **Passwords** → minimum length 12 and require upper/lower/digits
   (the local config already does this).

## 4. Create the first administrator securely

Run on your own computer (the service-role key never leaves it):

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role / secret key> \
node scripts/create-admin.mjs owner@your-domain.se
```

PowerShell:

```powershell
$env:SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
node scripts/create-admin.mjs owner@your-domain.se
```

A strong temporary password is printed once. Log in at `/admin`; to choose your
own password use “Glömt lösenordet?” (requires step 3.2/3.3). Run the script again
for additional administrators. To revoke access, delete the user in
Authentication → Users (the `admin_users` row is removed automatically).

## 5. Deploy the Edge Functions and secrets

```bash
npx supabase functions deploy create-booking --no-verify-jwt
npx supabase functions deploy contact        --no-verify-jwt
npx supabase functions deploy admin-notify   --no-verify-jwt
npx supabase functions deploy health         --no-verify-jwt
```

(`--no-verify-jwt` matches `supabase/config.toml`; `admin-notify` verifies the
administrator's session itself.)

Set secrets (generate random values e.g. with `openssl rand -hex 32`):

```bash
npx supabase secrets set \
  ALLOWED_ORIGINS="https://www.your-domain.se,https://your-domain.se" \
  SITE_URL="https://www.your-domain.se" \
  HEALTH_CHECK_TOKEN="<random>" \
  RATE_LIMIT_SALT="<random>"
```

## 6. Configure e-mail delivery (optional but recommended) 🔑

1. Create a [Resend](https://resend.com) account and **verify your domain**
   (adds DNS records). Sending from an unverified domain will fail.
2. Create an API key and set:

```bash
npx supabase secrets set RESEND_API_KEY="re_..." EMAIL_FROM="Crescor Bilvård <bokning@your-domain.se>"
```

Without these, bookings work normally; the site tells customers to keep their
booking number and never claims an e-mail was sent. Every send attempt is
logged per booking (visible in the admin booking drawer).

## 7. Configure the business 🔑

Log in at `/admin`:

1. **Inställningar** – phone, e-mail, workshop address (only if you receive cars
   at your own premises), service area for mobile detailing, org.nr,
   notification e-mail; choose *Bokning hos oss* and/or *Mobil bilvård*;
   decide on **automatic confirmation** (off = bookings arrive as “Väntar på
   bekräftelse” but still reserve the time); notice period, horizon and slot
   interval. Finally turn on **Onlinebokning aktiverad**.
2. **Tjänster** – review names, descriptions, **durations and buffers** (they
   drive scheduling), add prices if you want them shown, deactivate services you
   don't offer.
3. **Öppettider** – set real opening hours.
4. **Blockerade tider** – add holidays and vacations.

The settings page lists anything still missing before launch.

## 8. Deploy the frontend

### Option A — Cloudflare Pages (recommended)

1. Push the repository to GitHub (a **private** repository is recommended).
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo.
3. Build command `npm run build`, output directory `dist`, environment variable
   `NODE_VERSION=22`.
4. Environment variables (Production): `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY` (publishable key), `VITE_SITE_URL`, and optionally
   `VITE_TURNSTILE_SITE_KEY`.
5. `public/_headers` (security headers, CSP, caching) and `public/_redirects`
   (SPA routing) are applied automatically. Netlify reads the same files.

### Option B — cPanel / Apache

```bash
cp .env.example .env.production.local   # fill in the VITE_* values
npm ci && npm run build
```

Upload the **contents** of `dist/` (including the hidden `.htaccess`) to
`public_html/` via File Manager or FTP. `.htaccess` handles HTTPS redirect, SPA
routing, security headers and caching. Requires `mod_rewrite` and `mod_headers`
(standard on cPanel hosts).

## 9. Custom domain 🔑

- Cloudflare Pages: *Custom domains → Set up a domain*, follow the DNS steps.
  Add both `your-domain.se` and `www.your-domain.se`, and redirect one to the other.
- cPanel: point the domain to the hosting account and enable AutoSSL.

Then make sure these all use the final domain: `VITE_SITE_URL` (rebuild),
`ALLOWED_ORIGINS` secret, Supabase Auth Site URL / redirect URLs. If you use a
custom Supabase domain, add it to `connect-src` in `public/_headers` and
`public/.htaccess`.

## 10. GitHub Actions monitoring

Repository → Settings → Secrets and variables → Actions:

| Type | Name | Value |
|---|---|---|
| Secret | `HEALTH_URL` | `https://<ref>.supabase.co/functions/v1/health` |
| Secret | `HEALTH_CHECK_TOKEN` | same value as the Edge Function secret |
| Variable | `SITE_URL` | `https://www.your-domain.se` |

Run *Actions → Health check → Run workflow* once to confirm. Details in
[MONITORING.md](MONITORING.md).

## 11. Optional external cron safeguard

See [MONITORING.md → Secondary safeguard](MONITORING.md#secondary-safeguard-external-cron).

## 12. Test production bookings

1. Make a booking on the live site with your own e-mail (choose a time far ahead).
2. Check the confirmation screen, the e-mail (if configured) and that the booking
   appears in `/admin` and the slot is no longer available.
3. In admin: confirm → move → cancel it and check the customer e-mails.
4. Submit the contact form and check `/admin/meddelanden`.
5. Optional: run Lighthouse in Chrome DevTools on the live URL.

## 13. Backups

Supabase Free has **no automatic backups**. Follow [BACKUP.md](BACKUP.md) before
taking real bookings.

---

## Optional: Cloudflare Turnstile (spam protection) 🔑

If automated spam appears: create a Turnstile widget in Cloudflare (free), then

```bash
npx supabase secrets set TURNSTILE_SECRET_KEY="<secret>"
```

and set `VITE_TURNSTILE_SITE_KEY` in the frontend build. Configure **both or
neither**: with only the secret set, every booking would be rejected.

## Optional: automatic data retention

The admin can run *Inställningar → Gallra nu* at any time. To run it nightly,
enable the `pg_cron` extension (Database → Extensions) and run in the SQL editor:

```sql
select cron.schedule('crescor-retention', '15 3 * * *', $$ select private.apply_retention(); $$);
```
