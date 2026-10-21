// GET /functions/v1/health — lightweight uptime check for scheduled monitoring.
// Performs one tiny database read (a single-row settings table). No personal data.
// If HEALTH_CHECK_TOKEN is set, callers must send it in the x-health-token header.

import { json, logError, preflight } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'GET' && req.method !== 'POST') return json(req, { status: 'error' }, 405);

  const expected = Deno.env.get('HEALTH_CHECK_TOKEN');
  if (expected && !safeEqual(req.headers.get('x-health-token') ?? '', expected)) {
    return json(req, { status: 'unauthorized' }, 401);
  }

  const started = Date.now();
  try {
    const { data, error } = await serviceClient().rpc('health_check');
    if (error || data?.ok !== true) throw error ?? new Error('unexpected health response');
    return json(req, { status: 'ok', database: 'ok', latency_ms: Date.now() - started });
  } catch (error) {
    logError('health', error);
    return json(req, { status: 'degraded', database: 'error', latency_ms: Date.now() - started }, 503);
  }
});
