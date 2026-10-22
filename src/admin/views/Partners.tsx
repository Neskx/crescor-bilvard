import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { adminMessage } from '../adminApi';
import { LOGO_MAX_BYTES, deletePartner, listPartners, savePartner, uploadPartnerLogo, type PartnerInput } from '../adminApiPhase2';
import { EmptyState, PageHeader, Toggle, useConfirm, useToast } from '../components';
import { Alert, Field, Spinner } from '../../components/ui';
import { PARTNER_LOGOS } from '../../config/site';
import { cx } from '../../lib/format';
import type { AdminPartner } from '../../types';

const BLANK: PartnerInput = { name: '', logo_url: null, logo_background: 'light', website_url: null, sort_order: 100, is_visible: true, admin_note: null };
const URL_RE = /^https?:\/\/[^\s"'<>]+\.[^\s"'<>]+$/;

function Preview({ p }: { p: Pick<PartnerInput, 'name' | 'logo_url' | 'logo_background'> }) {
  const light = p.logo_background === 'light';
  return (
    <div className={cx('flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden px-3 py-3', light ? 'bg-white' : 'border border-white/10 bg-black')}>
      {p.logo_url ? (
        <img src={p.logo_url} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <span className={cx('font-display text-center text-lg leading-tight font-semibold uppercase', light ? 'text-ink-800' : 'text-silver-200')}>{p.name || 'Namn'}</span>
      )}
    </div>
  );
}

function PartnerForm({ initial, id, onDone }: { initial: PartnerInput; id: string | null; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<PartnerInput>(initial);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bundled = PARTNER_LOGOS.find((l) => l.path === f.logo_url);
  const source = !f.logo_url ? 'none' : bundled ? 'bundled' : 'uploaded';

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > LOGO_MAX_BYTES) return setError('Logotypen får vara högst 2 MB.');
    setUploading(true);
    try {
      const url = await uploadPartnerLogo(file);
      setF((x) => ({ ...x, logo_url: url }));
    } catch (e) {
      setError(adminMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = f.name.trim();
    const website = f.website_url?.trim() || null;
    if (!name) return setError('Ange företagets namn.');
    if (website && !URL_RE.test(website)) return setError('Webbadressen måste börja med https:// (eller http://), t.ex. https://exempel.se.');
    setBusy(true);
    try {
      await savePartner(id, { ...f, name, website_url: website, admin_note: f.admin_note?.trim() || null });
      toast('success', 'Samarbetspartnern är sparad.');
      onDone();
    } catch (err) {
      setError(adminMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 border border-white/10 bg-ink-850 p-5 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <Field id="pt-name" label="Företagsnamn" hint="Används som alternativtext för logotypen.">
          <input id="pt-name" className="field-input" maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="pt-url" label="Webbplats" optional hint="Lämna tomt om adressen inte är bekräftad.">
          <input id="pt-url" type="url" inputMode="url" className="field-input" maxLength={300} placeholder="https://" value={f.website_url ?? ''} onChange={(e) => setF({ ...f, website_url: e.target.value })} />
        </Field>
      </div>

      <div className="sm:col-span-4">
        <p className="field-label">Logotyp</p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Preview p={f} />
          <div className="grid flex-1 gap-3">
            <select
              aria-label="Logotypkälla"
              className="field-input"
              value={source === 'bundled' ? f.logo_url! : source}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'none') setF({ ...f, logo_url: null });
                else if (v !== 'uploaded') {
                  const l = PARTNER_LOGOS.find((x) => x.path === v);
                  setF({ ...f, logo_url: v, logo_background: l?.background ?? f.logo_background });
                }
              }}
            >
              <option value="none">Ingen logotyp – visa namnet</option>
              {PARTNER_LOGOS.map((l) => (
                <option key={l.path} value={l.path}>
                  Medföljande: {l.label}
                </option>
              ))}
              {source === 'uploaded' && <option value="uploaded">Uppladdad bild</option>}
            </select>
            {bundled && !bundled.verified && (
              <Alert tone="warning">Ägaren till den här logotypen är inte bekräftad. Koppla den bara om du vet att den tillhör {f.name || 'företaget'}.</Alert>
            )}
            <label className={cx('btn btn-ghost btn-sm w-fit cursor-pointer', uploading && 'pointer-events-none opacity-50')}>
              {uploading ? <Spinner className="h-4 w-4" label="Laddar upp" /> : <Upload className="h-4 w-4" aria-hidden />} Ladda upp egen (PNG, JPG, WebP, max 2 MB)
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
            <div className="flex gap-5 text-sm">
              {(['light', 'dark'] as const).map((bg) => (
                <label key={bg} className="flex items-center gap-2">
                  <input type="radio" name="pt-bg" className="accent-silver-200" checked={f.logo_background === bg} onChange={() => setF({ ...f, logo_background: bg })} />
                  {bg === 'light' ? 'Ljus ruta (för mörka logotyper)' : 'Mörk ruta (för ljusa logotyper)'}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Field id="pt-sort" label="Sortering" hint="Lägre visas först.">
        <input id="pt-sort" type="number" className="field-input" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} />
      </Field>
      <div className="sm:col-span-3">
        <Toggle checked={f.is_visible} onChange={(v) => setF({ ...f, is_visible: v })} label="Visa på webbplatsen" />
      </div>
      <div className="sm:col-span-4">
        <Field id="pt-note" label="Intern anteckning" optional>
          <textarea id="pt-note" rows={2} maxLength={500} className="field-input" value={f.admin_note ?? ''} onChange={(e) => setF({ ...f, admin_note: e.target.value })} />
        </Field>
      </div>
      {error && (
        <div className="sm:col-span-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="flex gap-2 sm:col-span-4">
        <button type="submit" className="btn btn-metal btn-sm" disabled={busy || uploading}>
          {busy && <Spinner className="h-4 w-4" />} Spara
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Avbryt
        </button>
      </div>
    </form>
  );
}

export function PartnersView() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<AdminPartner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const load = useCallback(() => {
    listPartners()
      .then(setRows)
      .catch((e) => setError(adminMessage(e)));
  }, []);
  useEffect(load, [load]);

  const input = (p: AdminPartner): PartnerInput => ({
    name: p.name,
    logo_url: p.logo_url,
    logo_background: p.logo_background,
    website_url: p.website_url,
    sort_order: p.sort_order,
    is_visible: p.is_visible,
    admin_note: p.admin_note,
  });

  async function patch(p: AdminPartner, change: Partial<PartnerInput>, message: string) {
    try {
      await savePartner(p.id, { ...input(p), ...change });
      toast('success', message);
      load();
    } catch (e) {
      toast('error', adminMessage(e));
    }
  }

  async function move(index: number, delta: -1 | 1) {
    if (!rows || !rows[index + delta]) return;
    // Swap the two, then renumber 10, 20, 30… and save only rows whose position changed.
    const order = [...rows];
    [order[index], order[index + delta]] = [order[index + delta], order[index]];
    try {
      await Promise.all(
        order.map((r, i) => (r.sort_order === (i + 1) * 10 ? null : savePartner(r.id, { ...input(r), sort_order: (i + 1) * 10 }))),
      );
      load();
    } catch (e) {
      toast('error', adminMessage(e));
    }
  }

  async function remove(p: AdminPartner) {
    const ok = await confirm({ title: `Ta bort "${p.name}"?`, body: 'Partnern tas bort från listan. Vill du bara sluta visa den räcker det att dölja den.', confirmLabel: 'Ta bort', danger: true });
    if (!ok) return;
    try {
      await deletePartner(p.id);
      toast('success', 'Samarbetspartnern är borttagen.');
      load();
    } catch (e) {
      toast('error', adminMessage(e));
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Samarbetspartners"
        sub="Visas i sektionen ”Våra samarbetspartners”. Ange bara uppgifter som är bekräftade av respektive företag."
        actions={
          <button type="button" className="btn btn-metal btn-sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden /> Ny partner
          </button>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {editing === 'new' && (
        <div className="mb-6">
          <PartnerForm initial={{ ...BLANK, sort_order: ((rows?.length ?? 0) + 1) * 10 }} id={null} onDone={() => { setEditing(null); load(); }} />
        </div>
      )}
      {rows === null && !error && <Spinner label="Laddar partners" />}
      {rows?.length === 0 && <EmptyState title="Inga samarbetspartners">Sektionen döljs tills minst en partner är synlig.</EmptyState>}
      <ul className="space-y-3">
        {rows?.map((p, i) =>
          editing === p.id ? (
            <li key={p.id}>
              <PartnerForm initial={input(p)} id={p.id} onDone={() => { setEditing(null); load(); }} />
            </li>
          ) : (
            <li key={p.id} className="flex flex-col gap-4 border border-white/[0.07] bg-ink-900 p-4 sm:flex-row sm:items-center">
              <Preview p={p} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {p.name} {!p.is_visible && <span className="ml-2 border border-white/15 px-1.5 text-[0.65rem] text-silver-500">DOLD</span>}
                </p>
                <p className="mt-1 truncate text-sm text-silver-400">{p.website_url ?? 'Ingen webbplats angiven'}</p>
                {p.admin_note && <p className="mt-1 text-xs text-amber-100/80">{p.admin_note}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost btn-sm !px-2" aria-label={`Flytta upp ${p.name}`} disabled={i === 0} onClick={() => void move(i, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button type="button" className="btn btn-ghost btn-sm !px-2" aria-label={`Flytta ned ${p.name}`} disabled={i === (rows?.length ?? 0) - 1} onClick={() => void move(i, 1)}>
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void patch(p, { is_visible: !p.is_visible }, p.is_visible ? 'Partnern är dold.' : 'Partnern visas nu.')}
                >
                  {p.is_visible ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />} {p.is_visible ? 'Dölj' : 'Visa'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(p.id)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Redigera
                </button>
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Ta bort ${p.name}`} onClick={() => void remove(p)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
