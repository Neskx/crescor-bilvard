import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the LOCAL Supabase stack (`npx supabase start`)
// and a local admin (see README → "Testing"). They create real bookings in the
// local database, so never point them at production.
//
// Safety: Playwright starts its OWN Vite server on a separate port, with the
// Supabase URL/key injected explicitly (process env beats .env.local in Vite).
// A developer's own `npm run dev` — which may use .env.local pointing at the
// hosted project — is never reused.

const PORT = 5179;
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:55421';
// The standard, publicly documented anon key of every local Supabase stack.
const SUPABASE_ANON_KEY =
  process.env.E2E_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SUPABASE_URL)) {
  throw new Error(`Refusing to run E2E tests against ${SUPABASE_URL}: only a local Supabase stack is allowed.`);
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile.spec.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
      // Never call a real CAPTCHA service from tests.
      VITE_TURNSTILE_SITE_KEY: '',
    },
  },
});
