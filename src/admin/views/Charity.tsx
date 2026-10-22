import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { adminMessage, getSettings, saveSettings } from '../adminApi';
import {
  charitySummary,
  deleteCharity,
  deleteDonation,
  downloadCsv,
  listCharities,
  listDonations,
  saveCharity,
  saveDonation,
  type CharityInput,
  type DonationInput,
} from '../adminApiPhase2';
import { EmptyState, PageHeader, Toggle, useConfirm, useToast } from '../components';
import { Alert, Field, Spinner } from '../../components/ui';
import { DEFAULT_TZ, formatDateTimeShort, todayKey, zonedTimeToUtc } from '../../lib/datetime';
import { cx, formatAmount } from '../../lib/format';
import type { AdminCharity, CharitySummaryRow, DonationAllocation, DonationStatus } from '../../types';

const DONATION_STATUS_LABEL: Record<DonationStatus, string> = {
  planned: 'Preliminär',
  approved: 'Godkänd',
  completed: 'Genomförd',
};
const STATUS_HINT: Record<DonationStatus, string> = {
  planned: 'Ett preliminärt belopp – inte beslutat.',
  approved: 'Beslutat men ännu inte utbetalt.',
  completed: 'Utbetalt. Visas offentligt.',
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// ---- Causes -----------------------------------------------------------------------------

const BLANK_CHARITY: CharityInput = { slug: '', name: '', description: '', website_url: null, logo_url: null, is_active: false, sort_order: 100, admin_note: null };

function CharityForm({ initial, id, onDone }: { initial: CharityInput; id: string | null; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<CharityInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = f.name.trim();
    const website = f.website_url?.trim() || null;
    const logo = f.logo_url?.trim() || null;
    if (name.length < 2) return setError('Ange organisationens namn.');
    if (website && !/^https:\/\/[^\s"'<>]+\.[^\s"'<>]+$/.test(website)) return setError('Webbadressen måste vara en säker adress som börjar med https://.');
    if (logo && !/^(\/[A-Za-z0-9._/-]+|https:\/\/[^\s"'<>]+)$/.test(logo)) return setError('Logotypens adress måste börja med https:// eller /.');
    setBusy(true);
    try {
      await saveCharity(id, {
        ...f,
        name,
        description: f.description.trim(),
        website_url: website,
        logo_url: logo,
        admin_note: f.admin_note?.trim() || null,
        slug: f.slug || slugify(name) || `andamal-${Date.now()}`,
      });
      toast('success', 'Ändamålet är sparat.');
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
        <Field id="ch-name" label="Organisation">
          <input id="ch-name" className="field-input" maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="ch-url" label="Officiell webbplats" optional hint="Kontrollera adressen mot organisationens egna material.">
          <input id="ch-url" type="url" className="field-input" maxLength={300} placeholder="https://" value={f.website_url ?? ''} onChange={(e) => setF({ ...f, website_url: e.target.value })} />
        </Field>
      </div>
      <div className="sm:col-span-4">
        <Field id="ch-desc" label="Kort beskrivning" optional hint="Visas för kunden. Undvik påståenden om samarbete eller effekt som inte är bekräftade.">
          <textarea id="ch-desc" rows={2} maxLength={300} className="field-input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="ch-logo" label="Logotyp (adress)" optional hint="Använd bara en officiell logotyp om organisationen tillåter det.">
          <input id="ch-logo" className="field-input" maxLength={500} value={f.logo_url ?? ''} onChange={(e) => setF({ ...f, logo_url: e.target.value })} />
        </Field>
      </div>
      <Field id="ch-sort" label="Sortering">
        <input id="ch-sort" type="number" className="field-input" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} />
      </Field>
      <div>
        <Toggle checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Aktiv" description="Kan väljas vid bokning." />
      </div>
      <div className="sm:col-span-4">
        <Field id="ch-note" label="Intern anteckning" optional hint="T.ex. verifieringsstatus. Visas aldrig publikt.">
          <textarea id="ch-note" rows={2} maxLength={500} className="field-input" value={f.admin_note ?? ''} onChange={(e) => setF({ ...f, admin_note: e.target.value })} />
        </Field>
      </div>
      {error && (
        <div className="sm:col-span-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="flex gap-2 sm:col-span-4">
        <button type="submit" className="btn btn-metal btn-sm" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />} Spara
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Avbryt
        </button>
      </div>
    </form>
  );
}

// ---- Donations ------------------------------------------------------------------------------

function DonationForm({ charities, initial, id, onDone }: { charities: AdminCharity[]; initial: DonationInput; id: string | null; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<DonationInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.charity_id) return setError('Välj ändamål.');
    if (f.accounting_period.trim().length < 2) return setError('Ange period, t.ex. "2026 Q4".');
    if (!(f.amount > 0)) return setError('Ange ett belopp större än 0 kr.');
    if (f.status === 'completed' && !f.reference?.trim()) return setError('Ange en referens eller ett kvittonummer för en genomförd gåva.');
    setBusy(true);
    try {
      await saveDonation(id, { ...f, accounting_period: f.accounting_period.trim(), reference: f.reference?.trim() || null, notes: f.notes?.trim() || null });
      toast('success', 'Gåvan är sparad.');
      onDone();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === '23505' ? 'Det finns redan en gåva för samma ändamål och period. Redigera den istället.' : adminMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 border border-white/10 bg-ink-850 p-5 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <Field id="dn-charity" label="Ändamål">
          <select id="dn-charity" className="field-input" value={f.charity_id} onChange={(e) => setF({ ...f, charity_id: e.target.value })}>
            <option value="">Välj…</option>
            {charities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_active ? '' : ' (inaktiv)'}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="dn-period" label="Period" hint='T.ex. "2026 Q4".'>
        <input id="dn-period" className="field-input" maxLength={40} value={f.accounting_period} onChange={(e) => setF({ ...f, accounting_period: e.target.value })} />
      </Field>
      <Field id="dn-amount" label="Belopp (kr)">
        <input id="dn-amount" type="number" min={1} step={1} className="field-input" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} />
      </Field>
      <div className="sm:col-span-2">
        <Field id="dn-status" label="Status" hint={STATUS_HINT[f.status]}>
          <select id="dn-status" className="field-input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as DonationStatus })}>
            {(Object.keys(DONATION_STATUS_LABEL) as DonationStatus[]).map((s) => (
              <option key={s} value={s}>
                {DONATION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="dn-ref" label="Referens / kvitto" optional={f.status !== 'completed'}>
          <input id="dn-ref" className="field-input" maxLength={200} value={f.reference ?? ''} onChange={(e) => setF({ ...f, reference: e.target.value })} />
        </Field>
      </div>
      <div className="sm:col-span-4">
        <Field id="dn-notes" label="Anteckning" optional>
          <textarea id="dn-notes" rows={2} maxLength={1000} className="field-input" value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
      {error && (
        <div className="sm:col-span-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="flex gap-2 sm:col-span-4">
        <button type="submit" className="btn btn-metal btn-sm" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />} Spara
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Avbryt
        </button>
      </div>
    </form>
  );
}

// ---- View -------------------------------------------------------------------------------------

export function CharityView() {
  const toast = useToast();
  const confirm = useConfirm();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [charities, setCharities] = useState<AdminCharity[] | null>(null);
  const [donations, setDonations] = useState<DonationAllocation[]>([]);
  const [summary, setSummary] = useState<CharitySummaryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editCharity, setEditCharity] = useState<string | 'new' | null>(null);
  const [editDonation, setEditDonation] = useState<string | 'new' | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(() => {
    const fromIso = from ? zonedTimeToUtc(from, '00:00', DEFAULT_TZ) : undefined;
    const toIso = to ? zonedTimeToUtc(to, '23:59', DEFAULT_TZ) : undefined;
    Promise.all([getSettings(), listCharities(), listDonations(), charitySummary(fromIso, toIso)])
      .then(([s, c, d, sum]) => {
        setEnabled(s.charity_enabled);
        setCharities(c);
        setDonations(d);
        setSummary(sum);
      })
      .catch((e) => setError(adminMessage(e)));
  }, [from, to]);
  useEffect(load, [load]);

  async function toggleProgramme(v: boolean) {
    setEnabled(v);
    try {
      await saveSettings({ charity_enabled: v });
      toast('success', v ? 'Välgörenhetsinitiativet visas på webbplatsen och i bokningen.' : 'Välgörenhetsinitiativet är dolt. Bokningen fungerar som vanligt.');
    } catch (e) {
      setEnabled(!v);
      toast('error', adminMessage(e));
    }
  }

  async function removeCharity(c: AdminCharity) {
    const ok = await confirm({
      title: `Ta bort "${c.name}"?`,
      body: 'Ändamål som redan valts av kunder eller har registrerade gåvor kan inte tas bort – inaktivera dem istället.',
      confirmLabel: 'Ta bort',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCharity(c.id);
      toast('success', 'Ändamålet är borttaget.');
      load();
    } catch (e) {
      toast('error', adminMessage(e));
    }
  }

  async function removeDonation(d: DonationAllocation) {
    const ok = await confirm({ title: 'Ta bort gåvan?', body: `${d.accounting_period}: ${formatAmount(d.amount)}. Detta kan inte ångras.`, confirmLabel: 'Ta bort', danger: true });
    if (!ok) return;
    try {
      await deleteDonation(d.id);
      toast('success', 'Gåvan är borttagen.');
      load();
    } catch (e) {
      toast('error', adminMessage(e));
    }
  }

  const name = (id: string) => charities?.find((c) => c.id === id)?.name ?? '–';

  const exportDonations = () =>
    downloadCsv(`gavor-${todayKey(DEFAULT_TZ)}.csv`, [
      ['Ändamål', 'Period', 'Belopp (kr)', 'Status', 'Referens', 'Anteckning', 'Skapad', 'Godkänd', 'Genomförd'],
      ...donations.map((d) => [
        name(d.charity_id),
        d.accounting_period,
        d.amount,
        DONATION_STATUS_LABEL[d.status],
        d.reference,
        d.notes,
        formatDateTimeShort(d.created_at, DEFAULT_TZ),
        d.approved_at ? formatDateTimeShort(d.approved_at, DEFAULT_TZ) : null,
        d.completed_at ? formatDateTimeShort(d.completed_at, DEFAULT_TZ) : null,
      ]),
    ]);

  const exportSummary = () =>
    downloadCsv(`kundval-${todayKey(DEFAULT_TZ)}.csv`, [
      ['Ändamål', 'Aktiv', 'Kundval (ej avbokade)', 'Preliminärt (kr)', 'Godkänt (kr)', 'Genomfört (kr)'],
      ...summary.map((r) => [r.name, r.is_active ? 'Ja' : 'Nej', r.selections, r.planned_amount, r.approved_amount, r.completed_amount]),
    ]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (charities === null || enabled === null) return <Spinner label="Laddar välgörenhet" />;

  const totalSelections = summary.reduce((s, r) => s + r.selections, 0);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Välgörenhet"
        sub="Kunder väljer ett ändamål vid bokning – utan extra kostnad. Ni bestämmer själva hur mycket som skänks; inga belopp räknas ut automatiskt och inga pengar överförs härifrån."
      />

      <section className="border border-white/[0.07] bg-ink-900 px-5">
        <Toggle
          checked={enabled}
          onChange={(v) => void toggleProgramme(v)}
          label="Visa välgörenhetsinitiativet"
          description="Visar sektionen på startsidan och steget ”Välj ändamål” i bokningen. Av: steget döljs och bokningen fungerar som vanligt."
        />
      </section>

      {/* ---- Customer preferences ---- */}
      <section className="mt-12" aria-labelledby="ch-summary">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="ch-summary" className="font-display text-2xl font-semibold">
              Kundernas val
            </h2>
            <p className="mt-1 text-sm text-silver-400">Antal bokningar (ej avbokade) per ändamål. Vägledande för hur ni fördelar era gåvor.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-silver-400">
              Från
              <input type="date" className="field-input mt-1 !py-2" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-xs text-silver-400">
              Till
              <input type="date" className="field-input mt-1 !py-2" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={exportSummary}>
              <Download className="h-4 w-4" aria-hidden /> Exportera
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-silver-400">
                <th className="py-2 font-normal">Ändamål</th>
                <th className="py-2 text-right font-normal">Kundval</th>
                <th className="py-2 text-right font-normal">Preliminärt</th>
                <th className="py-2 text-right font-normal">Godkänt</th>
                <th className="py-2 text-right font-normal">Genomfört</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.charity_id} className="border-b border-white/[0.05]">
                  <td className="py-3">
                    {r.name} {!r.is_active && <span className="text-xs text-silver-500">(inaktiv)</span>}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {r.selections}
                    {totalSelections > 0 && <span className="ml-1 text-xs text-silver-500">({Math.round((r.selections / totalSelections) * 100)} %)</span>}
                  </td>
                  <td className="py-3 text-right text-silver-400 tabular-nums">{formatAmount(r.planned_amount)}</td>
                  <td className="py-3 text-right tabular-nums">{formatAmount(r.approved_amount)}</td>
                  <td className="py-3 text-right font-semibold tabular-nums">{formatAmount(r.completed_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- Donations ---- */}
      <section className="mt-12" aria-labelledby="ch-donations">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="ch-donations" className="font-display text-2xl font-semibold">
              Gåvor
            </h2>
            <p className="mt-1 text-sm text-silver-400">Endast gåvor med status ”Genomförd” visas på webbplatsen.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={exportDonations} disabled={donations.length === 0}>
              <Download className="h-4 w-4" aria-hidden /> Exportera
            </button>
            <button type="button" className="btn btn-metal btn-sm" onClick={() => setEditDonation('new')} disabled={charities.length === 0}>
              <Plus className="h-4 w-4" aria-hidden /> Registrera gåva
            </button>
          </div>
        </div>
        {editDonation === 'new' && (
          <div className="mb-4">
            <DonationForm
              charities={charities}
              initial={{ charity_id: '', accounting_period: '', amount: 0, status: 'planned', reference: null, notes: null }}
              id={null}
              onDone={() => { setEditDonation(null); load(); }}
            />
          </div>
        )}
        {donations.length === 0 && editDonation !== 'new' && <EmptyState title="Inga gåvor registrerade">Registrera en gåva när ni har bestämt ett belopp.</EmptyState>}
        <ul className="space-y-2">
          {donations.map((d) =>
            editDonation === d.id ? (
              <li key={d.id}>
                <DonationForm charities={charities} initial={d} id={d.id} onDone={() => { setEditDonation(null); load(); }} />
              </li>
            ) : (
              <li key={d.id} className="flex flex-col gap-2 border border-white/[0.07] bg-ink-900 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">
                    {name(d.charity_id)} · {d.accounting_period} · <span className="tabular-nums">{formatAmount(d.amount)}</span>
                  </p>
                  <p className="text-xs text-silver-400">
                    {d.reference ? `Ref: ${d.reference}` : 'Ingen referens'}
                    {d.completed_at && ` · utbetald ${formatDateTimeShort(d.completed_at, DEFAULT_TZ)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      'border px-2 py-0.5 text-[0.68rem] font-semibold',
                      d.status === 'completed' ? 'border-emerald-200/40 bg-emerald-200/10 text-emerald-100' : d.status === 'approved' ? 'border-white/40 text-white' : 'border-white/15 text-silver-400',
                    )}
                  >
                    {DONATION_STATUS_LABEL[d.status]}
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditDonation(d.id)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Redigera
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="Ta bort gåvan" onClick={() => void removeDonation(d)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      </section>

      {/* ---- Causes ---- */}
      <section className="mt-12" aria-labelledby="ch-causes">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="ch-causes" className="font-display text-2xl font-semibold">
              Ändamål
            </h2>
            <p className="mt-1 text-sm text-silver-400">Aktivera ett ändamål först när organisationens namn och officiella webbplats är kontrollerade.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditCharity('new')}>
            <Plus className="h-4 w-4" aria-hidden /> Nytt ändamål
          </button>
        </div>
        {editCharity === 'new' && (
          <div className="mb-4">
            <CharityForm initial={BLANK_CHARITY} id={null} onDone={() => { setEditCharity(null); load(); }} />
          </div>
        )}
        <ul className="space-y-2">
          {charities.map((c) =>
            editCharity === c.id ? (
              <li key={c.id}>
                <CharityForm initial={c} id={c.id} onDone={() => { setEditCharity(null); load(); }} />
              </li>
            ) : (
              <li key={c.id} className="flex flex-col gap-2 border border-white/[0.07] bg-ink-900 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {c.name} {!c.is_active && <span className="ml-2 border border-white/15 px-1.5 text-[0.65rem] text-silver-500">INAKTIV</span>}
                  </p>
                  <p className="truncate text-sm text-silver-400">{c.website_url ?? 'Ingen webbplats angiven'}</p>
                  {c.admin_note && <p className="mt-1 text-xs text-amber-100/80">{c.admin_note}</p>}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditCharity(c.id)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Redigera
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={`Ta bort ${c.name}`} onClick={() => void removeCharity(c)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
