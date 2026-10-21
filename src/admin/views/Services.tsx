import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { adminMessage, deleteService, listServices, saveService, type ServiceInput } from '../adminApi';
import { EmptyState, PageHeader, Toggle, useConfirm, useToast } from '../components';
import { Alert, Field, Spinner } from '../../components/ui';
import { SERVICE_IMAGES } from '../../config/site';
import { formatDuration } from '../../lib/datetime';
import { formatPrice } from '../../lib/format';
import type { AdminService, PriceType } from '../../types';
import { AddonsSection } from './Addons';

const BLANK: ServiceInput = {
  slug: '',
  name: '',
  description: '',
  duration_minutes: 120,
  buffer_minutes: 30,
  price: null,
  price_type: 'on_request',
  image_key: 'default',
  sort_order: 100,
  is_active: true,
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function ServiceForm({ initial, id, onDone }: { initial: ServiceInput; id: string | null; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<ServiceInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (f.name.trim().length < 2) return setError('Ange ett namn.');
    if (f.duration_minutes < 15 || f.duration_minutes > 720) return setError('Tiden måste vara mellan 15 och 720 minuter.');
    if (f.price_type !== 'on_request' && (f.price === null || Number.isNaN(f.price) || f.price < 0)) return setError('Ange ett giltigt pris, eller välj "Pris enligt offert".');
    setBusy(true);
    try {
      await saveService(id, {
        ...f,
        name: f.name.trim(),
        description: f.description.trim(),
        slug: f.slug || slugify(f.name) || `tjanst-${Date.now()}`,
        price: f.price_type === 'on_request' ? null : f.price,
      });
      toast('success', 'Tjänsten är sparad.');
      onDone();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === '23505' ? 'Det finns redan en tjänst med samma namn/slug.' : adminMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 border border-white/10 bg-ink-850 p-5 sm:grid-cols-4">
      <div className="sm:col-span-4">
        <Field id="sv-name" label="Namn">
          <input id="sv-name" className="field-input" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
      </div>
      <div className="sm:col-span-4">
        <Field id="sv-desc" label="Beskrivning">
          <textarea id="sv-desc" rows={3} maxLength={600} className="field-input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
      </div>
      <Field id="sv-dur" label="Tid (min)" hint="Styr hur lång tid som bokas.">
        <input id="sv-dur" type="number" min={15} max={720} step={5} className="field-input" value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: Number(e.target.value) })} />
      </Field>
      <Field id="sv-buf" label="Buffert (min)" hint="Ställtid efter bokningen.">
        <input id="sv-buf" type="number" min={0} max={240} step={5} className="field-input" value={f.buffer_minutes} onChange={(e) => setF({ ...f, buffer_minutes: Number(e.target.value) })} />
      </Field>
      <Field id="sv-ptype" label="Pris">
        <select id="sv-ptype" className="field-input" value={f.price_type} onChange={(e) => setF({ ...f, price_type: e.target.value as PriceType })}>
          <option value="on_request">Pris enligt offert</option>
          <option value="from">Från-pris</option>
          <option value="fixed">Fast pris</option>
        </select>
      </Field>
      <Field id="sv-price" label="Belopp (kr)">
        <input
          id="sv-price"
          type="number"
          min={0}
          step={1}
          disabled={f.price_type === 'on_request'}
          className="field-input"
          value={f.price ?? ''}
          onChange={(e) => setF({ ...f, price: e.target.value === '' ? null : Number(e.target.value) })}
        />
      </Field>
      <Field id="sv-img" label="Bild">
        <select id="sv-img" className="field-input" value={f.image_key ?? 'default'} onChange={(e) => setF({ ...f, image_key: e.target.value })}>
          {Object.keys(SERVICE_IMAGES).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Field>
      <Field id="sv-sort" label="Sortering" hint="Lägre visas först.">
        <input id="sv-sort" type="number" className="field-input" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} />
      </Field>
      <div className="sm:col-span-2">
        <Toggle checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Aktiv" description="Inaktiva tjänster visas inte och kan inte bokas online." />
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

export function ServicesView() {
  const toast = useToast();
  const confirm = useConfirm();
  const [services, setServices] = useState<AdminService[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const load = useCallback(() => {
    listServices()
      .then(setServices)
      .catch((e) => setError(adminMessage(e)));
  }, []);
  useEffect(load, [load]);

  async function remove(s: AdminService) {
    const ok = await confirm({
      title: `Ta bort "${s.name}"?`,
      body: 'Tjänsten tas bort permanent. Har den bokningar kan den inte tas bort – inaktivera den då istället.',
      confirmLabel: 'Ta bort',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteService(s.id);
      toast('success', 'Tjänsten är borttagen.');
      load();
    } catch (e) {
      toast('error', adminMessage(e));
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Tjänster"
        sub="Namn, tid, pris och vilka tjänster och tillägg som går att boka."
        actions={
          <button type="button" className="btn btn-metal btn-sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden /> Ny tjänst
          </button>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {editing === 'new' && (
        <div className="mb-6">
          <ServiceForm initial={BLANK} id={null} onDone={() => { setEditing(null); load(); }} />
        </div>
      )}
      {services === null && !error && <Spinner label="Laddar tjänster" />}
      {services?.length === 0 && <EmptyState title="Inga tjänster">Lägg till din första tjänst.</EmptyState>}
      <ul className="space-y-3">
        {services?.map((s) =>
          editing === s.id ? (
            <li key={s.id}>
              <ServiceForm initial={s} id={s.id} onDone={() => { setEditing(null); load(); }} />
            </li>
          ) : (
            <li key={s.id} className="flex flex-col gap-3 border border-white/[0.07] bg-ink-900 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">
                  {s.name} {!s.is_active && <span className="ml-2 border border-white/15 px-1.5 text-[0.65rem] text-silver-500">INAKTIV</span>}
                </p>
                <p className="mt-1 text-sm text-silver-400">
                  {formatDuration(s.duration_minutes)} + {s.buffer_minutes} min buffert · {formatPrice(s.price, s.price_type) ?? 'Pris enligt offert'}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(s.id)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Redigera
                </button>
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Ta bort ${s.name}`} onClick={() => void remove(s)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      <AddonsSection />
    </div>
  );
}
