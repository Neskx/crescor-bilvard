// POST /functions/v1/create-booking
//
// 1. Validate input            4. Atomically create the booking (DB function,
// 2. Rate limit per IP            which re-checks availability under a lock and
// 3. Verify CAPTCHA (optional)    relies on an exclusion constraint)
//                              5. Send notifications — failures here never turn
//                                 a persisted booking into an error.

import { clientIp, json, logError, preflight, readJson } from '../_shared/http.ts';
import { allowRequest, verifyCaptcha } from '../_shared/security.ts';
import { loadAppointment, loadSettings, logNotification, serviceClient } from '../_shared/supabase.ts';
import { validateBookingInput } from '../_shared/validation.ts';
import { sendEmail, type EmailStatus } from '../_shared/email.ts';
import { adminBookingEmail, customerBookingEmail } from '../_shared/emailTemplates.ts';

const BUSINESS_ERRORS: Record<string, number> = {
  slot_unavailable: 409,
  time_in_past: 409,
  too_soon: 409,
  too_far: 409,
  outside_business_hours: 409,
  service_unavailable: 409,
  addon_unavailable: 409,
  location_unavailable: 409,
  booking_disabled: 409,
  rate_limited: 429,
  invalid_input: 400,
  privacy_not_accepted: 400,
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json(req, { ok: false, code: 'method_not_allowed' }, 405);

  const body = await readJson(req);
  if (!body || typeof body !== 'object') return json(req, { ok: false, code: 'invalid_input' }, 400);

  const parsed = validateBookingInput(body);
  if (!parsed.ok) return json(req, { ok: false, code: 'invalid_input', errors: parsed.errors }, 400);

  let db;
  try {
    db = serviceClient();
  } catch (error) {
    logError('create-booking:config', error);
    return json(req, { ok: false, code: 'server_error' }, 500);
  }

  const ip = clientIp(req);
  const perHour = Math.max(1, Number(Deno.env.get('BOOKING_RATE_LIMIT_PER_HOUR') ?? '10') || 10);
  if (!(await allowRequest(db, 'booking', ip, perHour, 3600))) {
    return json(req, { ok: false, code: 'rate_limited' }, 429);
  }
  if (!(await verifyCaptcha((body as Record<string, unknown>).captcha_token, ip))) {
    return json(req, { ok: false, code: 'captcha_failed' }, 403);
  }

  // ---- Persist ---------------------------------------------------------------
  const { data: result, error } = await db.rpc('create_booking', { p: parsed.value });
  if (error || !result) {
    logError('create-booking:rpc', error ?? 'empty result');
    return json(req, { ok: false, code: 'server_error' }, 503);
  }
  if (!result.ok) {
    return json(req, { ok: false, code: result.code, field: result.field }, BUSINESS_ERRORS[result.code] ?? 400);
  }

  const response = {
    ok: true,
    duplicate: Boolean(result.duplicate),
    booking_reference: result.booking_reference as string,
    status: result.status as string,
    start_time: result.start_time as string,
    end_time: result.end_time as string,
    service_name: result.service_name as string,
    addons: (result.addons ?? []) as { id: string; name: string; price: number }[],
    addons_total: Number(result.addons_total ?? 0),
    email: 'not_configured' as EmailStatus,
  };

  // ---- Notify (best effort; the booking is already safely stored) -----------
  try {
    if (response.duplicate) {
      // A retried request: report what happened the first time, send nothing new.
      const { data: log } = await db
        .from('notification_log')
        .select('status')
        .eq('appointment_id', result.appointment_id)
        .eq('kind', 'booking_customer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      response.email = (log?.status as EmailStatus) ?? 'failed';
      return json(req, response, 200);
    }

    const [appointment, settings] = await Promise.all([loadAppointment(db, result.appointment_id), loadSettings(db)]);
    if (appointment) {
      const customerMail = customerBookingEmail(appointment, settings);
      const adminMail = adminBookingEmail(appointment, settings);
      const adminTo = settings.notification_email ?? settings.company_email;

      const [customerResult, adminResult] = await Promise.all([
        sendEmail({
          to: appointment.customer_email,
          ...customerMail,
          replyTo: settings.company_email ?? undefined,
        }),
        adminTo
          ? sendEmail({ to: adminTo, ...adminMail, replyTo: appointment.customer_email })
          : Promise.resolve({ status: 'not_configured' as const }),
      ]);

      response.email = customerResult.status;
      await Promise.all([
        logNotification(db, {
          appointment_id: appointment.id,
          kind: 'booking_customer',
          status: customerResult.status,
          provider_id: customerResult.providerId,
          error: customerResult.error,
        }),
        logNotification(db, {
          appointment_id: appointment.id,
          kind: 'booking_admin',
          status: adminResult.status,
          provider_id: 'providerId' in adminResult ? adminResult.providerId : undefined,
          error: 'error' in adminResult ? adminResult.error : undefined,
        }),
      ]);
    }
  } catch (notifyError) {
    logError('create-booking:notify', notifyError);
    response.email = 'failed';
  }

  return json(req, response, 201);
});
