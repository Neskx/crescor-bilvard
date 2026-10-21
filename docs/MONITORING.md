# Monitoring and free-tier limits

## Free-tier facts this design is based on (checked 2026-10-19)

- **Supabase Free** projects are paused after a period of inactivity
  (third-party guides published in 2026 report about one week). A paused
  project is offline until someone clicks **Restore** in the Supabase dashboard.
  Supabase's own billing docs confirm pausing exists and that paid plans are
  never paused, but do not define precisely what counts as “activity”.
- **Supabase Free** has **no automatic backups** (Supabase's backup docs advise
  Free users to export data themselves) → see [BACKUP.md](BACKUP.md).
- **GitHub Actions:** scheduled workflows in a *public* repository are disabled
  automatically after 60 days without repository activity. The `Keepalive`
  workflow re-enables them via the API on the 1st of every month. Private repositories have a monthly minutes quota;
  this check uses roughly 2–3 minutes per month.

Re-check these limits occasionally; providers change them.

**Important:** a health check makes it *likely* that a project with real
traffic is seen as active, but it is **not a guarantee** against pausing, and
it is not meant to circumvent Supabase's rules. A site taking real bookings will
normally generate activity on its own. If reliability matters more than cost,
the Supabase Pro plan removes pausing and adds daily backups.

## Primary safeguard — GitHub Actions

Workflow: [`.github/workflows/health-check.yml`](../.github/workflows/health-check.yml)

| | |
|---|---|
| **What it checks** | `GET /functions/v1/health` — the Edge Function runs `public.health_check()`, a single read of the one-row settings table, and returns `{status, database, latency_ms}`. No personal or business data. Optionally also that the website returns its HTML shell. |
| **How often** | Monday and Thursday at 06:17 UTC (never more than 4 days apart). Manual runs via *Run workflow*. |
| **Retries** | Up to 3 attempts per check with back-off, so a cold start does not cause a false alarm. |
| **Credentials** | `HEALTH_URL` and `HEALTH_CHECK_TOKEN` as GitHub *repository secrets*. The token is compared in constant time by the function; it is never printed in logs. |
| **When it fails** | The job fails and GitHub e-mails the repository owner. Open the run log to see which check failed and why. If the database is paused: Supabase dashboard → project → **Restore**. |

## Secondary safeguard — external cron

Use this **instead of** GitHub Actions if the repository is archived, the
workflow gets disabled, or you prefer a separate system. Avoid running both at a
high frequency — a twice-weekly check from one place is enough.

**Option 1 – cron-job.org (free, supports custom headers)**

1. Create a job: URL `https://<ref>.supabase.co/functions/v1/health`, method GET.
2. *Advanced → Headers*: `x-health-token: <HEALTH_CHECK_TOKEN>`.
3. Schedule: e.g. Monday and Thursday 07:00.
4. Enable failure notifications by e-mail. The token is stored in your
   cron-job.org account.

**Option 2 – any machine with Node.js (server, NAS, office PC)**

```bash
# crontab -e   (Linux/macOS)
17 6 * * 1,4  HEALTH_URL=https://<ref>.supabase.co/functions/v1/health HEALTH_CHECK_TOKEN=... SITE_URL=https://www.your-domain.se node /path/to/scripts/health-check.mjs || mail -s "Crescor health check failed" you@your-domain.se
```

On Windows, create a Task Scheduler task that runs
`node C:\path\scripts\health-check.mjs` with the same environment variables.
Keep the token in the scheduler's protected environment, not in a shared file.

## What happens when something is down

| Failure | Customer experience | Data |
|---|---|---|
| Supabase paused / unavailable | Site still loads (static). Booking section shows “Bokningen kunde inte laddas” with a retry button and contact options; services fall back to a built-in list (not bookable). | Nothing is lost; no booking can be half-written. |
| Network drop while submitting | Customer sees a specific message and can retry; the idempotency key guarantees no duplicate booking. | Booking either fully exists or not at all. |
| E-mail provider down | Booking succeeds; success screen says the confirmation e-mail may be delayed. | Failure logged in `notification_log` (visible in admin). |
| Edge Function error | Clear error, data kept in the form. | Logged in Supabase → Edge Functions → Logs (without personal data). |

## Where to look

- Supabase dashboard → **Edge Functions → Logs** (function errors, without request bodies)
- Supabase dashboard → **Reports / Usage** (free-tier quota usage)
- GitHub → **Actions** (health check history)
- `/admin` → booking drawer → **E-posthistorik** (delivery status per booking)
