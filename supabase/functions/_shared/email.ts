// Transactional email via Resend (https://resend.com).
// Configure with the secrets RESEND_API_KEY and EMAIL_FROM. Without them every
// send returns { status: 'not_configured' } — never a fake "sent".

export type EmailStatus = 'sent' | 'failed' | 'not_configured';

export interface EmailResult {
  status: EmailStatus;
  providerId?: string;
  error?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export function emailConfigured(): boolean {
  return Boolean(Deno.env.get('RESEND_API_KEY') && Deno.env.get('EMAIL_FROM'));
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!apiKey || !from) return { status: 'not_configured' };
  if (!message.to || message.to.endsWith('@invalid')) return { status: 'failed', error: 'no recipient' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => ({}));
    // Only a 2xx response with a message id counts as accepted by the provider.
    if (res.ok && typeof body?.id === 'string') return { status: 'sent', providerId: body.id };
    return { status: 'failed', error: `HTTP ${res.status}: ${String(body?.message ?? body?.name ?? 'unknown').slice(0, 200)}` };
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}
