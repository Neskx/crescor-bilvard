import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { addBlocked, adminMessage, deleteBlocked, listBlocked } from '../adminApi';
import { EmptyState, PageHeader, useConfirm, useToast } from '../components';
import { Alert, Field, Spinner } from '../../components/ui';
import { DEFAULT_TZ, addDays, formatDateTimeShort, todayKey, zonedTimeToUtc } from '../../lib/datetime';
import type { BlockedPeriod } from '../../types';

export function BlockedView() {
  const toast = useToast();
  const confirm = useConfirm();
  const today = todayKey(DEFAULT_TZ);
  const [items, setItems] = useState<BlockedPeriod[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wholeDays, setWholeDays] = useState(true);
  const [f, setF] = useState({ fromDate: today, fromTime: '08:00', toDate: today, toTime: '17:00', reason: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listBlocked()
      .then(setItems)
      .catch((e) => setError(adminMessage(e)));
  }, []);
  useEffect(load, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const start = zonedTimeToUtc(f.fromDate, wholeDays ? '00:00' : f.fromTime, DEFAULT_TZ);
    const end = wholeDays ? zonedTimeToUtc(addDays(f.toDate, 1), '00:00', DEFAULT_TZ) : zonedTimeToUtc(f.toDate, f.toTime, DEFAULT_TZ);
    if (end <= start) return setFormError('Slutet måste vara efter starten.');
    setBusy(true);
    try {
      await addBlocked(start, end, f.reason.trim());
      toast('success', 'Perioden är blockerad. Befintliga bokningar påverkas inte – kontrollera kalendern.');
      setF((x) => ({ ...x, reason: '' }));
      load();
    } catch (err) {
      setFormError(adminMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: BlockedPeriod) {
    if (!(await confirm({ title: 'Ta bort blockeringen?', body: 'Tiderna blir bokningsbara igen.', confirmLabel: 'Ta bort', danger: true }))) return;
    try {
      await deleteBlocked(b.id);
      load();
    } catch (e) {
      toast('error', adminMessage(e));
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Blockerade tider" sub="Semester, helgdagar och andra tider då inga bokningar ska kunna göras." />
      <form onSubmit={submit} noValidate className="grid gap-4 border border-white/10 bg-ink-850 p-5 sm:grid-cols-4">
        <label className="flex items-center gap-2 text-sm text-silver-300 sm:col-span-4">
          <input type="checkbox" checked={wholeDays} onChange={(e) => setWholeDays(e.target.checked)} className="accent-silver-200" /> Hela dagar
        </label>
        <Field id="bl-from" label="Från datum">
          <input id="bl-from" type="date" className="field-input" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value, toDate: e.target.value > f.toDate ? e.target.value : f.toDate })} />
        </Field>
        {!wholeDays && (
          <Field id="bl-fromt" label="Från kl.">
            <input id="bl-fromt" type="time" className="field-input" value={f.fromTime} onChange={(e) => setF({ ...f, fromTime: e.target.value })} />
          </Field>
        )}
        <Field id="bl-to" label="Till och med datum">
          <input id="bl-to" type="date" className="field-input" value={f.toDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} />
        </Field>
        {!wholeDays && (
          <Field id="bl-tot" label="Till kl.">
            <input id="bl-tot" type="time" className="field-input" value={f.toTime} onChange={(e) => setF({ ...f, toTime: e.target.value })} />
          </Field>
        )}
        <div className="sm:col-span-4">
          <Field id="bl-reason" label="Anledning" optional hint="Visas bara internt.">
            <input id="bl-reason" maxLength={200} className="field-input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="t.ex. Semester" />
          </Field>
        </div>
        {formError && (
          <div className="sm:col-span-4">
            <Alert tone="error">{formError}</Alert>
          </div>
        )}
        <div className="sm:col-span-4">
          <button type="submit" className="btn btn-metal btn-sm" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} Blockera period
          </button>
        </div>
      </form>

      <div className="mt-8">
        {error && <Alert tone="error">{error}</Alert>}
        {items === null && !error && <Spinner label="Laddar" />}
        {items?.length === 0 && <EmptyState title="Inga blockerade perioder" />}
        <ul className="space-y-2">
          {items?.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-4 border border-white/[0.07] bg-ink-900 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">
                  {formatDateTimeShort(b.start_time)} – {formatDateTimeShort(b.end_time)}
                </p>
                {b.reason && <p className="text-sm text-silver-400">{b.reason}</p>}
              </div>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Ta bort blockering" onClick={() => void remove(b)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
