// HTTP helpers shared by all Edge Functions.

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  // In production set ALLOWED_ORIGINS (e.g. "https://crescorbilvard.se,https://www.crescorbilvard.se").
  // Without it, any origin is allowed — acceptable for local development only.
  const allow = allowedOrigins.length === 0 ? '*' : allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-health-token',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  return null;
}

const MAX_BODY_BYTES = 32 * 1024;

/** Reads a JSON body with a size limit. Returns null for invalid/oversized bodies. */
export async function readJson(req: Request): Promise<unknown | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return null;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/** Logs an error without leaking request bodies or personal data. */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : String(error);
  console.error(`[${context}] ${message.slice(0, 500)}`);
}
