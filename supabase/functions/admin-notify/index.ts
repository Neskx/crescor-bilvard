// POST /functions/v1/admin-notify
// Sends confirmation / cancellation / rescheduling emails to a customer after an
// administrator has changed a booking, and review invitations for completed
// bookings. Requires a valid admin session.

import { json, logError, preflight, readJson } from '../_shared/http.ts';
import { loadAppointment, loadSettings, logNotification, serviceClient } from '../_shared/supabase.ts';
import { isUuid } from '../_shared/validation.ts';
import { sendEmail } from '../_shared/email.ts';
import { customerStatusEmail, reviewInviteEmail } from '../_shared/emailTemplates.ts';

const KINDS = ['confirmed', 'cancelled', 'rescheduled', 'review_invite'] as const;
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

    if (kind === 'review_invite') {
      // The review page lives on the public website (secret SITE_URL).
      const site = Deno.env.get('SITE_URL')?.replace(/\/+$/, '');
      if (!site) return json(req, { ok: false, code: 'site_url_missing' }, 409);
      const { data: issued, error: issueError } = await db.rpc('issue_review_invitation', { p_appointment_id: appointment.id });
      if (issueError || !issued) throw issueError ?? new Error('empty result');
      if (!issued.ok) return json(req, { ok: false, code: issued.code }, 409);
      const link = `${site}/recension?t=${encodeURIComponent(issued.token as string)}`;
      const result = await sendEmail({ to: appointment.customer_email, ...reviewInviteEmail(appointment, settings, link), replyTo: settings.company_email ?? undefined });
      await logNotification(db, { appointment_id: appointment.id, kind, status: result.status, provider_id: result.providerId, error: result.error });
      // The link goes back to the administrator so it can be shared manually if e-mail fails.
      return json(req, { ok: true, email: result.status, link }, 200);
    }

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
