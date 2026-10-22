// Data access for the Phase 2 admin sections (locations, reviews, partners,
// charity programme). Same conventions as adminApi.ts: runs with the
// administrator's session; RLS and the admin_* RPCs enforce authorisation.

import { supabase } from '../lib/supabase';
import { callFunction } from '../services/api';
import { AdminError } from './adminApi';
import type {
  AdminCharity,
  AdminPartner,
  AdminReview,
  CharitySummaryRow,
  DonationAllocation,
  EmailStatus,
} from '../types';

function db() {
  if (!supabase) throw new AdminError('not_configured', 'Supabase är inte konfigurerat.');
  return supabase;
}

function fail(error: { code?: string; message?: string } | null, fallback = 'server_error'): never {
  const code = error?.code === '42501' ? 'forbidden' : error?.code === '23503' ? 'in_use' : error?.code || fallback;
  throw new AdminError(code, error?.message);
}

function unwrap<T extends { ok: boolean; code?: string; field?: string }>(data: T | null): T {
  if (!data) throw new AdminError('server_error');
  if (!data.ok) {
    const err = new AdminError(data.code ?? 'server_error');
    (err as AdminError & { field?: string }).field = data.field;
    throw err;
  }
  return data;
}

// ---- Locations ---------------------------------------------------------------------

/** Changes location type and/or address of a booking; the travel window is recomputed server-side. */
export async function updateAppointmentLocation(id: string, payload: Record<string, unknown>) {
  const { data, error } = await db().rpc('admin_update_appointment_location', { p_id: id, p: payload });
  if (error) fail(error);
  return unwrap(data);
}

// ---- Reviews -------------------------------------------------------------------------

export async function listReviews(): Promise<AdminReview[]> {
  const { data, error } = await db().from('reviews').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) fail(error);
  return (data ?? []) as AdminReview[];
}

export async function updateReview(id: string, patch: Partial<Pick<AdminReview, 'status' | 'admin_note' | 'reported_at'>>) {
  const { error } = await db().from('reviews').update(patch).eq('id', id);
  if (error) fail(error);
}

export async function deleteReview(id: string) {
  const { error } = await db().from('reviews').delete().eq('id', id);
  if (error) fail(error);
}

/** Review status of one booking (for the booking drawer). */
export async function reviewStateFor(appointmentId: string): Promise<{ invitedAt: string | null; usedAt: string | null; review: AdminReview | null }> {
  const [inv, rev] = await Promise.all([
    db().from('review_invitations').select('created_at, used_at').eq('appointment_id', appointmentId).maybeSingle(),
    db().from('reviews').select('*').eq('appointment_id', appointmentId).maybeSingle(),
  ]);
  if (inv.error) fail(inv.error);
  if (rev.error) fail(rev.error);
  return { invitedAt: inv.data?.created_at ?? null, usedAt: inv.data?.used_at ?? null, review: (rev.data as AdminReview | null) ?? null };
}

/** Creates a new personal review link (invalidates any earlier one) without sending e-mail. */
export async function issueReviewLink(appointmentId: string): Promise<string> {
  const { data, error } = await db().rpc('admin_issue_review_invitation', { p_appointment_id: appointmentId });
  if (error) fail(error);
  const r = unwrap(data) as unknown as { ok: true; token: string };
  return `${window.location.origin}/recension?t=${encodeURIComponent(r.token)}`;
}

/** Emails a review invitation via the admin-notify Edge Function. Returns the link too, for manual sharing. */
export async function sendReviewInvite(appointmentId: string): Promise<{ email: EmailStatus; link: string }> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AdminError('forbidden');
  try {
    return await callFunction<{ ok: true; email: EmailStatus; link: string }>('admin-notify', { appointment_id: appointmentId, kind: 'review_invite' }, token);
  } catch (e) {
    throw new AdminError((e as { code?: string }).code ?? 'server_error');
  }
}

// ---- Partners ------------------------------------------------------------------------

export async function listPartners(): Promise<AdminPartner[]> {
  const { data, error } = await db().from('partners').select('*').order('sort_order').order('name');
  if (error) fail(error);
  return (data ?? []) as AdminPartner[];
}

export type PartnerInput = Omit<AdminPartner, 'id' | 'created_at' | 'updated_at'>;

export async function savePartner(id: string | null, input: PartnerInput) {
  const q = id ? db().from('partners').update(input).eq('id', id) : db().from('partners').insert(input);
  const { error } = await q;
  if (error) fail(error);
}

export async function deletePartner(id: string) {
  const { error } = await db().from('partners').delete().eq('id', id);
  if (error) fail(error);
}

const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Uploads a logo to the public `partner-logos` bucket and returns its public URL. */
export async function uploadPartnerLogo(file: File): Promise<string> {
  const ext = LOGO_TYPES[file.type];
  if (!ext) throw new AdminError('logo_type');
  if (file.size > LOGO_MAX_BYTES) throw new AdminError('logo_size');
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await db().storage.from('partner-logos').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
  if (error) throw new AdminError('logo_upload', error.message);
  return db().storage.from('partner-logos').getPublicUrl(path).data.publicUrl;
}

// ---- Charity programme -------------------------------------------------------------------

export async function listCharities(): Promise<AdminCharity[]> {
  const { data, error } = await db().from('charities').select('*').order('sort_order').order('name');
  if (error) fail(error);
  return (data ?? []) as AdminCharity[];
}

export type CharityInput = Omit<AdminCharity, 'id' | 'created_at' | 'updated_at'>;

export async function saveCharity(id: string | null, input: CharityInput) {
  const q = id ? db().from('charities').update(input).eq('id', id) : db().from('charities').insert(input);
  const { error } = await q;
  if (error) fail(error);
}

export async function deleteCharity(id: string) {
  const { error } = await db().from('charities').delete().eq('id', id);
  if (error) fail(error);
}

export async function charitySummary(fromIso?: string, toIso?: string): Promise<CharitySummaryRow[]> {
  const { data, error } = await db().rpc('admin_charity_summary', { p_from: fromIso ?? null, p_to: toIso ?? null });
  if (error) fail(error);
  return ((data ?? []) as CharitySummaryRow[]).map((r) => ({
    ...r,
    selections: Number(r.selections),
    planned_amount: Number(r.planned_amount),
    approved_amount: Number(r.approved_amount),
    completed_amount: Number(r.completed_amount),
  }));
}

export async function charityForAppointment(appointmentId: string): Promise<string | null> {
  const { data, error } = await db().from('appointment_charity_selections').select('charities(name)').eq('appointment_id', appointmentId).maybeSingle();
  if (error) fail(error);
  const c = (data as { charities: { name: string } | { name: string }[] | null } | null)?.charities;
  return (Array.isArray(c) ? c[0]?.name : c?.name) ?? null;
}

export async function listDonations(): Promise<DonationAllocation[]> {
  const { data, error } = await db().from('donation_allocations').select('*').order('created_at', { ascending: false });
  if (error) fail(error);
  return ((data ?? []) as DonationAllocation[]).map((d) => ({ ...d, amount: Number(d.amount) }));
}

export type DonationInput = Pick<DonationAllocation, 'charity_id' | 'accounting_period' | 'amount' | 'status' | 'reference' | 'notes'>;

export async function saveDonation(id: string | null, input: DonationInput) {
  const q = id ? db().from('donation_allocations').update(input).eq('id', id) : db().from('donation_allocations').insert(input);
  const { error } = await q;
  if (error) fail(error);
}

export async function deleteDonation(id: string) {
  const { error } = await db().from('donation_allocations').delete().eq('id', id);
  if (error) fail(error);
}

/** CSV with ; separator and BOM, so Excel (Swedish locale) opens it correctly. */
export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    // Neutralise spreadsheet formulas, then quote every cell.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Updates only the per-location availability flags of a service. */
export async function setServiceLocations(id: string, patch: { allow_workshop?: boolean; allow_pickup?: boolean; allow_mobile?: boolean }) {
  const { error } = await db().from('services').update(patch).eq('id', id);
  if (error) fail(error);
}
