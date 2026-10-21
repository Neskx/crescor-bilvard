// POST /functions/v1/contact — stores a contact-form message and notifies the business.
// The message is stored first, so it is never lost if email delivery fails.

import { clientIp, json, logError, preflight, readJson } from '../_shared/http.ts';
import { allowRequest, verifyCaptcha } from '../_shared/security.ts';
import { loadSettings, logNotification, serviceClient } from '../_shared/supabase.ts';
import { validateContactInput } from '../_shared/validation.ts';
import { sendEmail, type EmailStatus } from '../_shared/email.ts';
import { adminContactEmail } from '../_shared/emailTemplates.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json(req, { ok: false, code: 'method_not_allowed' }, 405);

  const body = await readJson(req);
  const parsed = validateContactInput(body);
  if (!parsed.ok) return json(req, { ok: false, code: 'invalid_input', errors: parsed.errors }, 400);

  // Honeypot: real users never fill the hidden "website" field.
  if (typeof (body as Record<string, unknown>).website === 'string' && (body as Record<string, string>).website.trim() !== '') {
    return json(req, { ok: true, email: 'sent' }, 200);
  }

  let db;
  try {
    db = serviceClient();
  } catch (error) {
    logError('contact:config', error);
    return json(req, { ok: false, code: 'server_error' }, 500);
  }

  const ip = clientIp(req);
  const perHour = Math.max(1, Number(Deno.env.get('CONTACT_RATE_LIMIT_PER_HOUR') ?? '5') || 5);
  if (!(await allowRequest(db, 'contact', ip, perHour, 3600))) {
    return json(req, { ok: false, code: 'rate_limited' }, 429);
  }
  if (!(await verifyCaptcha((body as Record<string, unknown>).captcha_token, ip))) {
    return json(req, { ok: false, code: 'captcha_failed' }, 403);
  }

  const { error } = await db.from('contact_messages').insert({
    name: parsed.value.name,
    email: parsed.value.email,
    phone: parsed.value.phone ?? null,
    message: parsed.value.message,
  });
  if (error) {
    logError('contact:insert', error);
    return json(req, { ok: false, code: 'server_error' }, 503);
  }

  let email: EmailStatus = 'not_configured';
  try {
    const settings = await loadSettings(db);
    const to = settings.notification_email ?? settings.company_email;
    if (to) {
      const result = await sendEmail({ to, ...adminContactEmail(parsed.value, settings), replyTo: parsed.value.email });
      email = result.status;
      await logNotification(db, {
        appointment_id: null,
        kind: 'contact_admin',
        status: result.status,
        provider_id: result.providerId,
        error: result.error,
      });
    }
  } catch (notifyError) {
    logError('contact:notify', notifyError);
    email = 'failed';
  }

  // The customer only needs to know the message was received (it is stored).
  return json(req, { ok: true, email }, 201);
});
