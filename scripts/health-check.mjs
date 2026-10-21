#!/usr/bin/env node
// Uptime check used by the GitHub Actions workflow and usable from any
// scheduler (cron, Windows Task Scheduler, a VPS…).
//
//   HEALTH_URL=https://<ref>.supabase.co/functions/v1/health \
//   HEALTH_CHECK_TOKEN=... \
//   SITE_URL=https://www.example.se \
//   node scripts/health-check.mjs
//
// Exits 0 when healthy, 1 otherwise. Never prints secrets.

const HEALTH_URL = process.env.HEALTH_URL;
const TOKEN = process.env.HEALTH_CHECK_TOKEN ?? '';
const SITE_URL = process.env.SITE_URL ?? '';
const ATTEMPTS = Number(process.env.HEALTH_ATTEMPTS ?? 3);

if (!HEALTH_URL) {
  console.error('HEALTH_URL is not set.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(name, url, headers, validate) {
  let last = '';
  for (let i = 1; i <= ATTEMPTS; i++) {
    const started = Date.now();
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      const body = await res.text();
      const problem = validate(res, body);
      if (!problem) {
        console.log(`✔ ${name}: HTTP ${res.status} in ${Date.now() - started} ms`);
        return true;
      }
      last = problem;
    } catch (error) {
      last = error instanceof Error ? error.name + ': ' + error.message : String(error);
    }
    console.warn(`  ${name}: attempt ${i}/${ATTEMPTS} failed (${last})`);
    // Back off: a cold-starting function or briefly unavailable project gets a second chance.
    if (i < ATTEMPTS) await sleep(5_000 * i);
  }
  console.error(`✘ ${name}: ${last}`);
  return false;
}

const results = [];

results.push(
  await check('Backend health (Edge Function + database)', HEALTH_URL, TOKEN ? { 'x-health-token': TOKEN } : {}, (res, body) => {
    if (res.status !== 200) return `unexpected HTTP ${res.status}`;
    try {
      const json = JSON.parse(body);
      return json.status === 'ok' && json.database === 'ok' ? null : `status=${json.status} database=${json.database}`;
    } catch {
      return 'response was not JSON';
    }
  }),
);

if (SITE_URL) {
  results.push(
    await check('Website', SITE_URL, {}, (res, body) => {
      if (res.status !== 200) return `unexpected HTTP ${res.status}`;
      return body.includes('id="root"') ? null : 'page did not contain the app root';
    }),
  );
}

if (results.every(Boolean)) {
  console.log('All checks passed.');
} else {
  console.error('One or more checks failed. If the Supabase project is paused, restore it from the Supabase dashboard.');
  process.exit(1);
}
