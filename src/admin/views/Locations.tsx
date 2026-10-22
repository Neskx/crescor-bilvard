import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Truck, Warehouse } from 'lucide-react';
import { adminMessage, getSettings, listAppointments, listServices, saveSettings } from '../adminApi';
import { setServiceLocations } from '../adminApiPhase2';
import { EmptyState, PageHeader, StatusBadge, Toggle, useToast } from '../components';
import { BookingDrawer } from './BookingDrawer';
import { Alert, Field, Spinner } from '../../components/ui';
import { DEFAULT_TZ, formatDateTimeShort } from '../../lib/datetime';
import { formatAmount } from '../../lib/format';
import type { AdminService, AdminSettings, Appointment, LocationType } from '../../types';

type Form = Pick<
  AdminSettings,
  | 'workshop_service_enabled'
  | 'pickup_service_enabled'
  | 'mobile_service_enabled'
  | 'workshop_instructions'
  | 'pickup_info_text'
  | 'pickup_area_text'
  | 'service_area_text'
  | 'pickup_fee'
  | 'mobile_fee'
  | 'pickup_travel_minutes'
  | 'mobile_travel_minutes'
> & { pickup_zones: string; mobile_zones: string; company_address: string | null };

const parseZones = (text: string) =>
  [...new Set(text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
const zonesValid = (zones: string[]) => zones.every((z) => /^[0-9]{1,5}$/.test(z)) && zones.length <= 200;

function UpcomingList({ location, title, onOpen }: { location: LocationType; title: string; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listAppointments({ scope: 'upcoming', location, pageSize: 50 })
      .then((r) => setRows(r.rows.filter((a) => a.status === 'pending' || a.status === 'confirmed')))
      .catch((e) => setError(adminMessage(e)));
  }, [location]);
  return (
    <section aria-label={title}>
      <h3 className="font-display text-2xl font-semibold">{title}</h3>
      {error && <Alert tone="error">{error}</Alert>}
      {rows === null && !error && <Spinner label="Laddar" />}
      {rows?.length === 0 && <p className="mt-2 text-sm text-silver-500">Inga kommande bokningar.</p>}
      <ul className="mt-3 space-y-2">
        {rows?.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onOpen(a.id)}
              className="flex w-full flex-col gap-1 border border-white/[0.07] bg-ink-900 p-3 text-left text-sm hover:border-white/20 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                <span className="font-semibold">{formatDateTimeShort(a.start_time, DEFAULT_TZ)}</span> · {a.service_name} · {a.customer_name}
                <span className="block text-silver-400">
                  {[a.service_address, [a.service_postal_code, a.service_city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                  {a.travel_minutes > 0 && ` · ${a.travel_minutes} min restid före/efter`}
                </span>
              </span>
              <StatusBadge status={a.status} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LocationsView() {
  const toast = useToast();
  const [f, setF] = useState<Form | null>(null);
  const [services, setServices] = useState<AdminService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([getSettings(), listServices()])
      .then(([s, v]) => {
        setF({
          workshop_service_enabled: s.workshop_service_enabled,
          pickup_service_enabled: s.pickup_service_enabled,
          mobile_service_enabled: s.mobile_service_enabled,
          workshop_instructions: s.workshop_instructions,
          pickup_info_text: s.pickup_info_text,
          pickup_area_text: s.pickup_area_text,
          service_area_text: s.service_area_text,
          pickup_fee: s.pickup_fee === null ? null : Number(s.pickup_fee),
          mobile_fee: s.mobile_fee === null ? null : Number(s.mobile_fee),
          pickup_travel_minutes: s.pickup_travel_minutes,
          mobile_travel_minutes: s.mobile_travel_minutes,
          pickup_zones: (s.pickup_postal_prefixes ?? []).join(', '),
          mobile_zones: (s.mobile_postal_prefixes ?? []).join(', '),
          company_address: s.company_address,
        });
        setServices(v);
      })
      .catch((e) => setError(adminMessage(e)));
  }, []);
  useEffect(load, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setFormError(null);
    const pickupZones = parseZones(f.pickup_zones);
    const mobileZones = parseZones(f.mobile_zones);
    if (!zonesValid(pickupZones) || !zonesValid(mobileZones)) {
      return setFormError('Postnummerområden anges som 1–5 siffror, separerade med komma, t.ex. "211, 212, 21432".');
    }
    for (const fee of [f.pickup_fee, f.mobile_fee]) {
      if (fee !== null && (Number.isNaN(fee) || fee < 0)) return setFormError('Avgifter måste vara 0 kr eller mer – eller lämnas tomma.');
    }
    if (f.workshop_service_enabled && !f.company_address) {
      return setFormError('Ange verkstadens adress under Inställningar för att kunna erbjuda "Lämna bilen".');
    }
    const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
    setBusy(true);
    try {
      await saveSettings({
        workshop_service_enabled: f.workshop_service_enabled,
        pickup_service_enabled: f.pickup_service_enabled,
        mobile_service_enabled: f.mobile_service_enabled,
        workshop_instructions: clean(f.workshop_instructions),
        pickup_info_text: clean(f.pickup_info_text),
        pickup_area_text: clean(f.pickup_area_text),
        service_area_text: clean(f.service_area_text),
        pickup_fee: f.pickup_fee,
        mobile_fee: f.mobile_fee,
        pickup_travel_minutes: f.pickup_travel_minutes,
        mobile_travel_minutes: f.mobile_travel_minutes,
        pickup_postal_prefixes: pickupZones,
        mobile_postal_prefixes: mobileZones,
      });
      toast('success', 'Platsinställningarna är sparade.');
      load();
    } catch (err) {
      setFormError(adminMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleService(s: AdminService, key: 'allow_workshop' | 'allow_pickup' | 'allow_mobile', value: boolean) {
    setServices((list) => list.map((x) => (x.id === s.id ? { ...x, [key]: value } : x)));
    try {
      await setServiceLocations(s.id, { [key]: value });
    } catch (e) {
      toast('error', adminMessage(e));
      load();
    }
  }

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!f) return <Spinner label="Laddar platsinställningar" />;

  const feeInput = (key: 'pickup_fee' | 'mobile_fee', label: string) => (
    <Field id={`loc-${key}`} label={label} optional hint="Tomt = ingen avgift visas eller tas ut.">
      <input
        id={`loc-${key}`}
        type="number"
        min={0}
        step={1}
        className="field-input"
        value={f[key] ?? ''}
        onChange={(e) => setF({ ...f, [key]: e.target.value === '' ? null : Number(e.target.value) })}
      />
    </Field>
  );
  const travelInput = (key: 'pickup_travel_minutes' | 'mobile_travel_minutes') => (
    <Field id={`loc-${key}`} label="Restid (min)" hint="Reserveras både före och efter bokningen.">
      <input
        id={`loc-${key}`}
        type="number"
        min={0}
        max={240}
        step={5}
        className="field-input"
        value={f[key]}
        onChange={(e) => setF({ ...f, [key]: Math.max(0, Math.min(240, Number(e.target.value) || 0)) })}
      />
    </Field>
  );
  const text = (key: 'pickup_area_text' | 'service_area_text' | 'pickup_info_text' | 'workshop_instructions', label: string, hint?: string, rows = 0, max = 300) => (
    <Field id={`loc-${key}`} label={label} optional hint={hint}>
      {rows ? (
        <textarea id={`loc-${key}`} rows={rows} maxLength={max} className="field-input" value={f[key] ?? ''} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
      ) : (
        <input id={`loc-${key}`} maxLength={max} className="field-input" value={f[key] ?? ''} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
      )}
    </Field>
  );

  return (
    <div className="max-w-4xl">
      <PageHeader title="Platser & hämtning" sub="Lämna bilen, hämtning och tvätt på plats – vad som erbjuds, var, och till vilken avgift." />

      <form onSubmit={submit} noValidate className="space-y-10">
        <section className="border border-white/[0.07] bg-ink-900 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <Warehouse className="h-5 w-5 text-silver-400" aria-hidden /> Lämna bilen
          </h2>
          <Toggle checked={f.workshop_service_enabled} onChange={(v) => setF({ ...f, workshop_service_enabled: v })} label="Erbjud online" />
          <p className="mt-4 text-sm text-silver-400">
            Adress: {f.company_address ?? <span className="text-amber-100">saknas</span>} ·{' '}
            <Link to="/admin/installningar" className="underline">
              ändra under Inställningar
            </Link>
          </p>
          <div className="mt-4">{text('workshop_instructions', 'Instruktioner vid ankomst', 'T.ex. var bilen parkeras och hur nyckeln lämnas.', 3, 500)}</div>
        </section>

        <section className="border border-white/[0.07] bg-ink-900 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <Truck className="h-5 w-5 text-silver-400" aria-hidden /> Vi hämtar bilen
          </h2>
          <Toggle checked={f.pickup_service_enabled} onChange={(v) => setF({ ...f, pickup_service_enabled: v })} label="Erbjud online" />
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            <div className="sm:col-span-3">{text('pickup_area_text', 'Område (visas för kunden)', 'T.ex. "Malmö med omnejd".')}</div>
            <div className="sm:col-span-3">
              <Field id="loc-pickup-zones" label="Postnummerområden" optional hint="Postnummer eller början av postnummer, separerade med komma. Tomt = ingen begränsning.">
                <input id="loc-pickup-zones" className="field-input" value={f.pickup_zones} onChange={(e) => setF({ ...f, pickup_zones: e.target.value })} placeholder="211, 212, 213" />
              </Field>
            </div>
            {feeInput('pickup_fee', 'Hämtningsavgift (kr)')}
            {travelInput('pickup_travel_minutes')}
            <div className="sm:col-span-3">
              {text('pickup_info_text', 'Information om hämtning och återlämning', 'Tomt = en neutral standardtext om att ni kontaktar kunden för att bekräfta tider.', 3, 500)}
            </div>
          </div>
        </section>

        <section className="border border-white/[0.07] bg-ink-900 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <MapPin className="h-5 w-5 text-silver-400" aria-hidden /> Tvätt på plats
          </h2>
          <Toggle checked={f.mobile_service_enabled} onChange={(v) => setF({ ...f, mobile_service_enabled: v })} label="Erbjud online" />
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            <div className="sm:col-span-3">{text('service_area_text', 'Område (visas för kunden)', 'T.ex. "Malmö med omnejd".')}</div>
            <div className="sm:col-span-3">
              <Field id="loc-mobile-zones" label="Postnummerområden" optional hint="Postnummer eller början av postnummer, separerade med komma. Tomt = ingen begränsning.">
                <input id="loc-mobile-zones" className="field-input" value={f.mobile_zones} onChange={(e) => setF({ ...f, mobile_zones: e.target.value })} placeholder="211, 212, 213" />
              </Field>
            </div>
            {feeInput('mobile_fee', 'Framkörningsavgift (kr)')}
            {travelInput('mobile_travel_minutes')}
          </div>
        </section>

        {formError && <Alert tone="error">{formError}</Alert>}
        <button type="submit" className="btn btn-metal" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />} Spara platsinställningar
        </button>
      </form>

      <section className="mt-14" aria-labelledby="loc-matrix">
        <h2 id="loc-matrix" className="font-display text-2xl font-semibold">
          Vilka paket erbjuds var?
        </h2>
        <p className="mt-1 text-sm text-silver-400">Sparas direkt. Ett alternativ som är avstängt ovan visas inte alls för kunden.</p>
        {services.length === 0 ? (
          <EmptyState title="Inga tjänster" />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-silver-400">
                  <th className="py-2 font-normal">Paket</th>
                  <th className="py-2 font-normal">Lämna bilen</th>
                  <th className="py-2 font-normal">Vi hämtar</th>
                  <th className="py-2 font-normal">På plats</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} className="border-b border-white/[0.05]">
                    <td className="py-3">
                      {s.name} {!s.is_active && <span className="text-xs text-silver-500">(inaktiv)</span>}
                    </td>
                    {(['allow_workshop', 'allow_pickup', 'allow_mobile'] as const).map((k) => (
                      <td key={k} className="py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-silver-200"
                          aria-label={`${s.name}: ${k === 'allow_workshop' ? 'Lämna bilen' : k === 'allow_pickup' ? 'Vi hämtar bilen' : 'Tvätt på plats'}`}
                          checked={s[k]}
                          onChange={(e) => void toggleService(s, k, e.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(f.pickup_fee !== null || f.mobile_fee !== null) && (
          <p className="mt-3 text-xs text-silver-500">
            Aktuella avgifter: {f.pickup_fee !== null ? `hämtning ${formatAmount(f.pickup_fee)}` : 'hämtning –'} ·{' '}
            {f.mobile_fee !== null ? `på plats ${formatAmount(f.mobile_fee)}` : 'på plats –'}. Befintliga bokningar behåller avgiften de bokades med.
          </p>
        )}
      </section>

      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        <UpcomingList location="pickup" title="Kommande hämtningar" onOpen={setOpenId} />
        <UpcomingList location="customer_address" title="Kommande tvättar på plats" onOpen={setOpenId} />
      </div>

      <BookingDrawer id={openId} onClose={() => setOpenId(null)} onChanged={() => undefined} />
    </div>
  );
}
