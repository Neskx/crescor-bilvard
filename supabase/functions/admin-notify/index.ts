// POST /functions/v1/admin-notify
// Sends confirmation / cancellation / rescheduling emails to a customer after an
// administrator has changed a booking. Requires a valid admin session.

import { json, logError, preflight, readJson } from '../_shared/http.ts';
import { loadAppointment, loadSettings, logNotification, serviceClient } from '../_shared/supabase.ts';
import { isUuid } from '../_shared/validation.ts';
import { sendEmail } from '../_shared/email.ts';
import { customerStatusEmail } from '../_shared/emailTemplates.ts';

const KINDS = ['confirmed', 'cancelled', 'rescheduled'] as const;
type Kind = (typeof KINDS)[number];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json(req, { ok: false, code: 'method_not_allowed' }, 405);

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return json(req, { ok: false, code: 'unauthorized' }, 401);

  let db;
  try {
    db = serviceClient();
  } catch (error) {
    logError('admin-notify:config', error);
    return json(req, { ok: false, code: 'server_error' }, 500);
  }

  // ---- Authenticate + authorise ------------------------------------------------
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData?.user) return json(req, { ok: false, code: 'unauthorized' }, 401);

  const { data: adminRow, error: adminError } = await db
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (adminError) {
    logError('admin-notify:admin-check', adminError);
    return json(req, { ok: false, code: 'server_error' }, 503);
  }
  if (!adminRow) return json(req, { ok: false, code: 'forbidden' }, 403);

  // ---- Input -------------------------------------------------------------------
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const kind = body?.kind as Kind;
  if (!body || !isUuid(body.appointment_id) || !KINDS.includes(kind)) {
    return json(req, { ok: false, code: 'invalid_input' }, 400);
  }
  const previousStart = typeof body.previous_start_time === 'string' ? body.previous_start_time : null;

  try {
    const [appointment, settings] = await Promise.all([loadAppointment(db, body.appointment_id), loadSettings(db)]);
    if (!appointment) return json(req, { ok: false, code: 'not_found' }, 404);
    if (appointment.anonymized_at) return json(req, { ok: false, code: 'anonymized' }, 409);

    const mail = customerStatusEmail(kind, appointment, settings, previousStart);
    const result = await sendEmail({ to: appointment.customer_email, ...mail, replyTo: settings.company_email ?? undefined });
    await logNotification(db, {
      appointment_id: appointment.id,
      kind,
      status: result.status,
      provider_id: result.providerId,
      error: result.error,
    });
    return json(req, { ok: true, email: result.status }, 200);
  } catch (error) {
    logError('admin-notify', error);
    return json(req, { ok: false, code: 'server_error' }, 503);
  }
});
