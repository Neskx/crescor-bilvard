import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { logError } from './http.ts';

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fixed-window rate limit keyed by a salted hash of the client IP, so raw IP
 * addresses are never stored. Fails OPEN on database errors: a broken limiter
 * must not block legitimate customers (the database has its own per-email limit).
 */
export async function allowRequest(
  db: SupabaseClient,
  scope: string,
  ip: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const salt = Deno.env.get('RATE_LIMIT_SALT') ?? Deno.env.get('SUPABASE_URL') ?? 'crescor';
    const bucket = `${scope}:${(await sha256Hex(`${salt}:${ip}`)).slice(0, 32)}`;
    const { data, error } = await db.rpc('check_rate_limit', {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data !== false;
  } catch (error) {
    logError('rate-limit', error);
    return true;
  }
}

/**
 * Verifies a Cloudflare Turnstile token when TURNSTILE_SECRET_KEY is configured.
 * Without the secret, CAPTCHA is disabled and this returns true.
 */
export async function verifyCaptcha(token: unknown, ip: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) return true;
  if (typeof token !== 'string' || token.length < 10 || token.length > 4096) return false;
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip !== 'unknown') form.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json();
    return body?.success === true;
  } catch (error) {
    logError('turnstile', error);
    return false;
  }
}
