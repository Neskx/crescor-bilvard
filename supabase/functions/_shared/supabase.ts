import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

let client: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — only ever used inside Edge Functions.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the Supabase platform.
 */
export function serviceClient(): SupabaseClient {
  if (client) return client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export interface BusinessSettingsRow {
  company_name: string;
  company_phone: string | null;
  company_email: string | null;
  company_address: string | null;
  notification_email: string | null;
  timezone: string;
  logo_url: string | null;
}

export interface AppointmentRow {
  id: string;
  booking_reference: string;
  service_name: string;
  price_snapshot: number | null;
  price_type_snapshot: 'fixed' | 'from' | 'on_request';
  addons: { id: string; name: string; price: number }[];
  addons_total: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  vehicle_information: string | null;
  registration_number: string | null;
  location_type: 'workshop' | 'pickup' | 'customer_address';
  location_fee: number | null;
  charity_name: string | null;
  service_address: string | null;
  service_postal_code: string | null;
  service_city: string | null;
  address_instructions: string | null;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  customer_notes: string | null;
  anonymized_at: string | null;
}

export async function loadSettings(db: SupabaseClient): Promise<BusinessSettingsRow> {
  const { data, error } = await db
    .from('business_settings')
    .select('company_name, company_phone, company_email, company_address, notification_email, timezone')
    .eq('id', 1)
    .single();
  if (error || !data) throw new Error(`settings: ${error?.message ?? 'missing'}`);
  // Public website address (secret SITE_URL) gives e-mails an absolute logo URL.
  const site = Deno.env.get('SITE_URL')?.replace(/\/+$/, '');
  return { ...(data as Omit<BusinessSettingsRow, 'logo_url'>), logo_url: site ? `${site}/logo/crescor-logo.png` : null };
}

export async function loadAppointment(db: SupabaseClient, id: string): Promise<AppointmentRow | null> {
  const { data, error } = await db
    .from('appointments')
    .select(
      'id, booking_reference, service_name, price_snapshot, price_type_snapshot, addons, addons_total, customer_name, customer_email, customer_phone, vehicle_information, registration_number, location_type, location_fee, service_address, service_postal_code, service_city, address_instructions, start_time, end_time, status, customer_notes, anonymized_at, appointment_charity_selections(charities(name))',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`appointment: ${error.message}`);
  if (!data) return null;
  // One-to-one embed: PostgREST returns an object (or null); tolerate an array too.
  const { appointment_charity_selections: sel, ...row } = data as Record<string, unknown> & {
    appointment_charity_selections: { charities: { name: string } | null } | { charities: { name: string } | null }[] | null;
  };
  const selection = Array.isArray(sel) ? sel[0] : sel;
  return { ...(row as Omit<AppointmentRow, 'charity_name'>), charity_name: selection?.charities?.name ?? null };
}

export async function logNotification(
  db: SupabaseClient,
  entry: { appointment_id: string | null; kind: string; status: string; provider_id?: string; error?: string },
): Promise<void> {
  const { error } = await db.from('notification_log').insert({
    appointment_id: entry.appointment_id,
    kind: entry.kind,
    status: entry.status,
    provider_id: entry.provider_id?.slice(0, 200) ?? null,
    error: entry.error?.slice(0, 500) ?? null,
  });
  if (error) console.error(`[notification_log] ${error.message}`);
}
