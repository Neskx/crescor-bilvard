# Database backups

Supabase's **Free plan has no automatic backups**. The database holds customer
bookings, so set up one of the options below before going live.

> **Never commit a backup to git** (`backups/`, `*.dump`, `*.sql.gz` are
> git-ignored for this reason) and never store an unencrypted backup in a shared
> or public place — it contains personal data.

## What to back up

| File | Command | Contents |
|---|---|---|
| `roles.sql` | `supabase db dump --role-only` | Custom database roles |
| `schema.sql` | `supabase db dump` | Tables, functions, policies (also reproducible from `supabase/migrations`) |
| `data.sql` | `supabase db dump --data-only --use-copy` | **All rows incl. customer data** |

Connection string: Supabase dashboard → **Connect** → *Session pooler* (works over
IPv4). It contains the database password — treat it as a secret.

## Option A — manual backup (simplest)

Run monthly, and before larger changes:

```bash
export SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@aws-0-eu-north-1.pooler.supabase.com:5432/postgres"
mkdir -p backups && cd backups
npx supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f roles.sql
npx supabase db dump --db-url "$SUPABASE_DB_URL" -f schema.sql
npx supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy -f data.sql
```

(Requires Docker for the CLI's `pg_dump`.) Store the files encrypted, e.g. in an
encrypted archive (`7z a -p -mhe=on crescor-YYYY-MM.7z *.sql`) on storage only
the business controls, and delete the plain `.sql` files.

Verified locally on 2026-10-19: these commands produce a schema dump that
includes the double-booking constraint and a data dump with all public tables.

## Option B — scheduled, encrypted GitHub Actions backup

[`.github/workflows/backup.yml`](../.github/workflows/backup.yml) dumps the
database, encrypts it with AES-256 (GPG symmetric) and keeps it as a workflow
artifact for 7 days. Manual by default; uncomment the `schedule` to run weekly.

1. Add secrets `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE` (long random; keep a copy
   in a password manager — without it the backup is useless).
2. Run *Actions → Database backup → Run workflow*.
3. Download the artifact and move it to long-term storage within 7 days.

Use a **private repository**: artifacts are downloadable by anyone with read
access (the dump is encrypted, but private is still the safer default).

## Restoring

Decrypt (Option B):

```bash
gpg --decrypt crescor-backup-<date>.tar.gz.gpg > backup.tar.gz && tar -xzf backup.tar.gz
```

Restore into a **new, empty** Supabase project (never over a live database
without a fresh backup of it first):

```bash
psql "$NEW_DB_URL" -f backup/roles.sql
psql "$NEW_DB_URL" -f backup/schema.sql
psql "$NEW_DB_URL" -c "SET session_replication_role = replica" -f backup/data.sql
```

Then redeploy Edge Functions and secrets, recreate the admin users' access if
needed (`scripts/create-admin.mjs`), and point the frontend's `VITE_SUPABASE_*`
variables at the new project. Test restores occasionally — an untested backup is
not a backup.

## Retention

Backups are copies of personal data and fall under the same retention policy.
Delete old backups on a schedule consistent with the privacy policy (default
policy: booking data anonymised after ~2 years).
