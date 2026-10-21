import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { adminMessage, deleteAddon, listAddons, saveAddon, type AddonInput } from '../adminApi';
import { EmptyState, Toggle, useConfirm, useToast } from '../components';
import { Alert, Field, Spinner } from '../../components/ui';
import { formatAmount } from '../../lib/format';
import type { AdminAddon } from '../../types';

const BLANK: AddonInput = { slug: '', name: '', description: '', price: 0, sort_order: 100, is_active: true };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function AddonForm({ initial, id, onDone }: { initial: AddonInput; id: string | null; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<AddonInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (f.name.trim().length < 2) return setError('Ange ett namn.');
    if (Number.isNaN(f.price) || f.price < 0) return setError('Ange ett giltigt pris.');
    setBusy(true);
    try {
      await saveAddon(id, {
        ...f,
        name: f.name.trim(),
        description: f.description.trim(),
        slug: f.slug || slugify(f.name) || `tillagg-${Date.now()}`,
      });
      toast('success', 'Tillägget är sparat.');
      onDone();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === '23505' ? 'Det finns redan ett tillägg med samma namn/slug.' : adminMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 border border-white/10 bg-ink-850 p-5 sm:grid-cols-4">
      <div className="sm:col-span-4">
        <Field id="ad-name" label="Namn">
          <input id="ad-name" className="field-input" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
      </div>
      <div className="sm:col-span-4">
        <Field id="ad-desc" label="Beskrivning" optional>
          <textarea id="ad-desc" rows={2} maxLength={300} className="field-input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
      </div>
      <Field id="ad-price" label="Pris (kr)">
        <input id="ad-price" type="number" min={0} step={1} className="field-input" value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} />
      </Field>
      <Field id="ad-sort" label="Sortering" hint="Lägre visas först.">
        <input id="ad-sort" type="number" className="field-input" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} />
      </Field>
      <div className="sm:col-span-2">
        <Toggle checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Aktiv" description="Inaktiva tillägg visas inte och kan inte väljas online." />
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

export function AddonsSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [addons, setAddons] = useState<AdminAddon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const load = useCallback(() => {
    listAddons()
      .then(setAddons)
      .catch((e) => setError(adminMessage(e)));
  }, []);
  useEffect(load, [load]);

  async function remove(a: AdminAddon) {
    const ok = await confirm({
      title: `Ta bort "${a.name}"?`,
      body: 'Tillägget tas bort permanent. Befintliga bokningar behåller tillägget och priset de bokades med.',
      confirmLabel: 'Ta bort',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAddon(a.id);
      toast('success', 'Tillägget är borttaget.');
      load();
    } catch (e) {
      toast('error', adminMessage(e));
    }
  }

  return (
    <section aria-labelledby="addons-admin-title" className="mt-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="addons-admin-title" className="font-display text-2xl font-semibold">
            Tillägg
          </h2>
          <p className="mt-1 text-sm text-silver-400">Valfria extra behandlingar med fast pris. Påverkar inte den bokade tiden.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden /> Nytt tillägg
        </button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {editing === 'new' && (
        <div className="mb-6">
          <AddonForm initial={BLANK} id={null} onDone={() => { setEditing(null); load(); }} />
        </div>
      )}
      {addons === null && !error && <Spinner label="Laddar tillägg" />}
      {addons?.length === 0 && <EmptyState title="Inga tillägg">Lägg till ett tillägg som kunden kan välja vid bokning.</EmptyState>}
      <ul className="space-y-3">
        {addons?.map((a) =>
          editing === a.id ? (
            <li key={a.id}>
              <AddonForm initial={a} id={a.id} onDone={() => { setEditing(null); load(); }} />
            </li>
          ) : (
            <li key={a.id} className="flex flex-col gap-3 border border-white/[0.07] bg-ink-900 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">
                  {a.name} {!a.is_active && <span className="ml-2 border border-white/15 px-1.5 text-[0.65rem] text-silver-500">INAKTIV</span>}
                </p>
                <p className="mt-1 text-sm text-silver-400">+{formatAmount(a.price)}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(a.id)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Redigera
                </button>
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Ta bort ${a.name}`} onClick={() => void remove(a)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
