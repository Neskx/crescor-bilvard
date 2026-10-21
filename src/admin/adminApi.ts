// Data access for the admin dashboard. Runs with the administrator's session;
// Row Level Security and the admin_* RPCs enforce authorisation server-side.

import { supabase } from '../lib/supabase';
import { callFunction } from '../services/api';
import type {
  AdminAddon,
  AdminService,
  AdminSettings,
  Appointment,
  AppointmentStatus,
  BlockedPeriod,
  BusinessHour,
  ContactMessage,
  EmailStatus,
  NotificationLogEntry,
} from '../types';

export class AdminError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

function db() {
  if (!supabase) throw new AdminError('not_configured', 'Supabase är inte konfigurerat.');
  return supabase;
}

function fail(error: { code?: string; message?: string } | null, fallback = 'server_error'): never {
  const code = error?.code === '42501' ? 'forbidden' : error?.code === '23P01' ? 'slot_unavailable' : error?.code === '23503' ? 'in_use' : error?.code || fallback;
  throw new AdminError(code, error?.message);
}

const ADMIN_MESSAGES: Record<string, string> = {
  forbidden: 'Du saknar behörighet för åtgärden. Logga in igen.',
  slot_unavailable: 'Tiden krockar med en annan bokning eller en blockerad period.',
  outside_business_hours: 'Tiden ligger utanför öppettiderna eller passar inte tidsrastret. Markera "Tillåt utanför öppettider" om du vill boka ändå.',
  time_in_past: 'Tiden har redan passerat.',
  not_found: 'Bokningen hittades inte. Den kan ha tagits bort.',
  not_active: 'Endast väntande eller bekräftade bokningar kan flyttas.',
  anonymized: 'Bokningen är anonymiserad och kan inte ändras.',
  still_active: 'Kommande aktiva bokningar kan inte anonymiseras. Avboka först.',
  addon_unavailable: 'Ett valt tillägg finns inte längre. Ladda om sidan och försök igen.',
  in_use: 'Tjänsten har bokningar kopplade till sig och kan inte tas bort. Inaktivera den istället.',
  invalid_input: 'Kontrollera de ifyllda uppgifterna.',
  not_configured: 'Supabase är inte konfigurerat.',
  network: 'Kunde inte nå servern. Kontrollera anslutningen.',
  timeout: 'Servern svarade inte i tid. Försök igen.',
};

export function adminMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  const field = (error as { field?: string })?.field;
  if (code === 'invalid_input' && field) return `Kontrollera fältet: ${field}.`;
  return ADMIN_MESSAGES[code] ?? (error instanceof Error && error.message && !/^[a-z_]+$/.test(error.message) ? `Något gick fel: ${error.message}` : 'Något gick fel. Försök igen.');
}

/** Raises AdminError for RPC results of the form { ok: false, code }. */
function unwrap<T extends { ok: boolean; code?: string; field?: string }>(data: T | null): T {
  if (!data) throw new AdminError('server_error');
  if (!data.ok) {
    const err = new AdminError(data.code ?? 'server_error');
    (err as AdminError & { field?: string }).field = data.field;
    throw err;
  }
  return data;
}

// ---- Auth --------------------------------------------------------------------

export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await db().rpc('is_admin');
  if (error) fail(error);
  return data === true;
}

// ---- Appointments ------------------------------------------------------------

export interface AppointmentQuery {
  scope: 'upcoming' | 'past' | 'all';
  status?: AppointmentStatus | '';
  from?: string; // ISO
  to?: string; // ISO
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listAppointments(q: AppointmentQuery): Promise<{ rows: Appointment[]; total: number }> {
  const pageSize = q.pageSize ?? 50;
  const page = q.page ?? 0;
  const nowIso = new Date().toISOString();
  let query = db().from('appointments').select('*', { count: 'exact' });

  if (q.scope === 'upcoming') query = query.gte('end_time', nowIso).order('start_time', { ascending: true });
  else if (q.scope === 'past') query = query.lt('end_time', nowIso).order('start_time', { ascending: false });
  else query = query.order('start_time', { ascending: false });

  if (q.status) query = query.eq('status', q.status);
  if (q.from) query = query.gte('start_time', q.from);
  if (q.to) query = query.lt('start_time', q.to);
  if (q.search) {
    // Strip characters with meaning in PostgREST or()-filter syntax (dots inside
    // a value are fine: only the first two dots of "col.op.value" are parsed).
    const term = q.search.replace(/[%,()*\\"']/g, ' ').trim().slice(0, 60);
    if (term) {
      const p = `%${term}%`;
      query = query.or(
        `booking_reference.ilike.${p},customer_name.ilike.${p},customer_email.ilike.${p},customer_phone.ilike.${p},registration_number.ilike.${p}`,
      );
    }
  }

  const { data, error, count } = await query.range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) fail(error);
  return { rows: (data ?? []) as Appointment[], total: count ?? 0 };
}

export async function appointmentsBetween(fromIso: string, toIso: string): Promise<Appointment[]> {
  const { data, error } = await db()
    .from('appointments')
    .select('*')
    .lt('start_time', toIso)
    .gt('end_time', fromIso)
    .in('status', ['pending', 'confirmed', 'completed'])
    .order('start_time');
  if (error) fail(error);
  return (data ?? []) as Appointment[];
}

export async function countPending(): Promise<number> {
  const { count, error } = await db()
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .gte('end_time', new Date().toISOString());
  if (error) fail(error);
  return count ?? 0;
}

export async function getAppointment(id: string): Promise<Appointment> {
  const { data, error } = await db().from('appointments').select('*').eq('id', id).single();
  if (error) fail(error, 'not_found');
  return data as Appointment;
}

export async function setStatus(id: string, status: AppointmentStatus) {
  const { data, error } = await db().rpc('admin_set_appointment_status', { p_id: id, p_status: status });
  if (error) fail(error);
  return unwrap(data);
}

export async function reschedule(id: string, startIso: string, override: boolean) {
  const { data, error } = await db().rpc('admin_reschedule_appointment', { p_id: id, p_start: startIso, p_override: override });
  if (error) fail(error);
  return unwrap(data) as { ok: true; previous_start_time: string; start_time: string; end_time: string };
}

export async function createAppointment(payload: Record<string, unknown>, override: boolean) {
  const { data, error } = await db().rpc('admin_create_appointment', { p: payload, p_override: override });
  if (error) fail(error);
  return unwrap(data) as { ok: true; appointment_id: string; booking_reference: string };
}

export async function updateAdminNotes(id: string, admin_notes: string) {
  const { error } = await db().from('appointments').update({ admin_notes: admin_notes || null }).eq('id', id);
  if (error) fail(error);
}

export async function anonymizeAppointment(id: string) {
  const { data, error } = await db().rpc('admin_anonymize_appointment', { p_id: id });
  if (error) fail(error);
  return unwrap(data);
}

export async function applyRetention(): Promise<{ anonymized_appointments: number; deleted_messages: number }> {
  const { data, error } = await db().rpc('admin_apply_retention');
  if (error) fail(error);
  return unwrap(data) as unknown as { anonymized_appointments: number; deleted_messages: number };
}

export async function notificationLog(appointmentId: string): Promise<NotificationLogEntry[]> {
  const { data, error } = await db()
    .from('notification_log')
    .select('id, appointment_id, kind, status, error, created_at')
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: false });
  if (error) fail(error);
  return (data ?? []) as NotificationLogEntry[];
}

/** Sends a status email to the customer via the admin-notify Edge Function. */
export async function notifyCustomer(
  appointmentId: string,
  kind: 'confirmed' | 'cancelled' | 'rescheduled',
  previousStart?: string,
): Promise<EmailStatus | 'error'> {
  try {
    const { data } = await db().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return 'error';
    const res = await callFunction<{ ok: true; email: EmailStatus }>(
      'admin-notify',
      { appointment_id: appointmentId, kind, previous_start_time: previousStart ?? null },
      token,
    );
    return res.email;
  } catch {
    return 'error';
  }
}

// ---- Services ----------------------------------------------------------------

export async function listServices(): Promise<AdminService[]> {
  const { data, error } = await db().from('services').select('*').order('sort_order').order('name');
  if (error) fail(error);
  return (data ?? []) as AdminService[];
}

export type ServiceInput = Omit<AdminService, 'id' | 'created_at' | 'updated_at'>;

export async function saveService(id: string | null, input: ServiceInput) {
  const q = id ? db().from('services').update(input).eq('id', id) : db().from('services').insert(input);
  const { error } = await q;
  if (error) fail(error);
}

export async function deleteService(id: string) {
  const { error } = await db().from('services').delete().eq('id', id);
  if (error) fail(error);
}

// ---- Add-ons (tillägg) ------------------------------------------------------------

export async function listAddons(): Promise<AdminAddon[]> {
  const { data, error } = await db().from('addons').select('*').order('sort_order').order('name');
  if (error) fail(error);
  return ((data ?? []) as AdminAddon[]).map((a) => ({ ...a, price: Number(a.price) }));
}

export type AddonInput = Omit<AdminAddon, 'id' | 'created_at' | 'updated_at'>;

export async function saveAddon(id: string | null, input: AddonInput) {
  const q = id ? db().from('addons').update(input).eq('id', id) : db().from('addons').insert(input);
  const { error } = await q;
  if (error) fail(error);
}

/** Existing bookings keep their own snapshot, so deleting never alters history. */
export async function deleteAddon(id: string) {
  const { error } = await db().from('addons').delete().eq('id', id);
  if (error) fail(error);
}

// ---- Hours, blocked periods, settings, messages --------------------------------

export async function listHours(): Promise<BusinessHour[]> {
  const { data, error } = await db().from('business_hours').select('*').order('weekday');
  if (error) fail(error);
  return ((data ?? []) as BusinessHour[]).map((h) => ({ ...h, opening_time: h.opening_time.slice(0, 5), closing_time: h.closing_time.slice(0, 5) }));
}

export async function saveHours(hours: BusinessHour[]) {
  for (const h of hours) {
    const { error } = await db()
      .from('business_hours')
      .update({ opening_time: h.opening_time, closing_time: h.closing_time, is_closed: h.is_closed })
      .eq('weekday', h.weekday);
    if (error) fail(error);
  }
}

export async function listBlocked(): Promise<BlockedPeriod[]> {
  const { data, error } = await db()
    .from('blocked_dates')
    .select('*')
    .gte('end_time', new Date(Date.now() - 30 * 86_400_000).toISOString())
    .order('start_time');
  if (error) fail(error);
  return (data ?? []) as BlockedPeriod[];
}

export async function addBlocked(start: string, end: string, reason: string) {
  const { error } = await db().from('blocked_dates').insert({ start_time: start, end_time: end, reason: reason || null });
  if (error) fail(error);
}

export async function deleteBlocked(id: string) {
  const { error } = await db().from('blocked_dates').delete().eq('id', id);
  if (error) fail(error);
}

export async function getSettings(): Promise<AdminSettings> {
  const { data, error } = await db().from('business_settings').select('*').eq('id', 1).single();
  if (error) fail(error);
  return data as AdminSettings;
}

export async function saveSettings(input: Partial<AdminSettings>) {
  const { error } = await db().from('business_settings').update(input).eq('id', 1);
  if (error) fail(error);
}

export async function listMessages(): Promise<ContactMessage[]> {
  const { data, error } = await db().from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) fail(error);
  return (data ?? []) as ContactMessage[];
}

export async function markMessage(id: string, is_read: boolean) {
  const { error } = await db().from('contact_messages').update({ is_read }).eq('id', id);
  if (error) fail(error);
}

export async function deleteMessage(id: string) {
  const { error } = await db().from('contact_messages').delete().eq('id', id);
  if (error) fail(error);
}
