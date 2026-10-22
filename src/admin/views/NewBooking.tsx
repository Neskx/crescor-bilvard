import { useEffect, useState, type FormEvent } from 'react';
import { adminMessage, createAppointment, listAddons, listServices, notifyCustomer } from '../adminApi';
import { PageHeader, useToast } from '../components';
import { Alert, Field, Spinner, fieldAria } from '../../components/ui';
import { DEFAULT_TZ, formatDuration, todayKey, zonedTimeToUtc } from '../../lib/datetime';
import { validateAddress, validateCustomerDetails, type FieldErrors } from '../../../supabase/functions/_shared/validation';
import { formatAmount } from '../../lib/format';
import type { AdminAddon, AdminService, LocationType } from '../../types';

const EMPTY = {
  service_id: '',
  date: '',
  time: '',
  location_type: 'workshop' as LocationType,
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  vehicle_information: '',
  registration_number: '',
  service_address: '',
  service_postal_code: '',
  service_city: '',
  address_instructions: '',
  customer_notes: '',
  admin_notes: '',
  status: 'confirmed' as 'confirmed' | 'pending',
};

export function NewBookingView({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [services, setServices] = useState<AdminService[]>([]);
  const [addons, setAddons] = useState<AdminAddon[]>([]);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [f, setF] = useState({ ...EMPTY, date: todayKey(DEFAULT_TZ) });
  const [override, setOverride] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listServices(), listAddons()])
      .then(([s, a]) => {
        setServices(s);
        setAddons(a);
        // Pre-select the only active service.
        const active = s.filter((x) => x.is_active);
        if (active.length === 1) setF((x) => (x.service_id ? x : { ...x, service_id: active[0].id }));
      })
      .catch((e) => setError(adminMessage(e)));
  }, []);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const errs: FieldErrors = { ...validateCustomerDetails(f) };
    if (f.location_type !== 'workshop') Object.assign(errs, validateAddress(f));
    if (!f.service_id) errs.service_id = 'Välj tjänst.';
    if (!f.date) errs.date = 'Välj datum.';
    if (!f.time) errs.time = 'Välj tid.';
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`nb-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await createAppointment(
        {
          service_id: f.service_id,
          addon_ids: addonIds,
          start_time: zonedTimeToUtc(f.date, f.time, DEFAULT_TZ),
          location_type: f.location_type,
          customer_name: f.customer_name,
          customer_email: f.customer_email,
          customer_phone: f.customer_phone,
          vehicle_information: f.vehicle_information,
          registration_number: f.registration_number,
          customer_notes: f.customer_notes,
          admin_notes: f.admin_notes,
          status: f.status,
          ...(f.location_type !== 'workshop'
            ? { service_address: f.service_address, service_postal_code: f.service_postal_code, service_city: f.service_city, address_instructions: f.address_instructions }
            : {}),
        },
        override,
      );
      let msg = `Bokning ${res.booking_reference} är skapad.`;
      if (sendEmail && f.status === 'confirmed') {
        const mail = await notifyCustomer(res.appointment_id, 'confirmed');
        msg += mail === 'sent' ? ' Bekräftelse skickad till kunden.' : ' Ingen bekräftelse kunde skickas via e-post.';
      }
      toast('success', msg);
      onChanged();
      setF({ ...EMPTY, date: f.date, service_id: f.service_id });
      setAddonIds([]);
    } catch (err) {
      setError(adminMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const input = (k: keyof typeof EMPTY, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, optional = false) => (
    <Field id={`nb-${k}`} label={label} error={errors[k]} optional={optional}>
      <input {...fieldAria(`nb-${k}`, errors[k])} className="field-input" value={f[k]} onChange={set(k)} {...props} />
    </Field>
  );

  return (
    <div className="max-w-3xl">
      <PageHeader title="Ny bokning" sub="För bokningar via telefon eller på plats. Krockar med andra bokningar stoppas alltid." />
      <form onSubmit={submit} noValidate className="space-y-8">
        <fieldset className="grid gap-5 sm:grid-cols-3">
          <legend className="eyebrow mb-4">Tjänst och tid</legend>
          <div className="sm:col-span-3">
            <Field id="nb-service_id" label="Tjänst" error={errors.service_id}>
              <select {...fieldAria('nb-service_id', errors.service_id)} className="field-input" value={f.service_id} onChange={set('service_id')}>
                <option value="">Välj tjänst…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatDuration(s.duration_minutes)}){s.is_active ? '' : ' – inaktiv'}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {addons.length > 0 && (
            <fieldset className="sm:col-span-3">
              <legend className="mb-2 text-sm text-silver-300">Tillägg</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {addons.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-silver-200"
                      checked={addonIds.includes(a.id)}
                      onChange={(e) => setAddonIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))}
                    />
                    <span className="flex-1">
                      {a.name} <span className="text-silver-400">+{formatAmount(a.price)}</span>
                      {!a.is_active && <span className="text-silver-500"> – inaktiv</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {input('date', 'Datum', { type: 'date' })}
          {input('time', 'Starttid', { type: 'time', step: 300 })}
          <Field id="nb-status" label="Status">
            <select id="nb-status" className="field-input" value={f.status} onChange={set('status')}>
              <option value="confirmed">Bekräftad</option>
              <option value="pending">Väntar på bekräftelse</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-silver-300 sm:col-span-3">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="accent-silver-200" />
            Tillåt utanför öppettider, tidsraster och för inaktiva tjänster
          </label>
        </fieldset>

        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="eyebrow mb-4">Kund</legend>
          <div className="sm:col-span-2">{input('customer_name', 'Namn', { autoComplete: 'off' })}</div>
          {input('customer_email', 'E-post', { type: 'email' })}
          {input('customer_phone', 'Telefon', { type: 'tel' })}
          {input('vehicle_information', 'Bil', {}, true)}
          {input('registration_number', 'Registreringsnummer', { className: 'field-input uppercase' }, true)}
        </fieldset>

        <fieldset className="grid gap-5 sm:grid-cols-6">
          <legend className="eyebrow mb-4">Plats</legend>
          <div className="flex flex-wrap gap-6 sm:col-span-6">
            {(
              [
                ['workshop', 'Lämna bilen'],
                ['pickup', 'Vi hämtar bilen'],
                ['customer_address', 'Tvätt på plats'],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <input type="radio" name="loc" checked={f.location_type === v} onChange={() => setF((x) => ({ ...x, location_type: v }))} className="accent-silver-200" />
                {l}
              </label>
            ))}
          </div>
          {f.location_type !== 'workshop' && (
            <>
              <div className="sm:col-span-6">{input('service_address', 'Gatuadress')}</div>
              <div className="sm:col-span-2">{input('service_postal_code', 'Postnummer', { inputMode: 'numeric' })}</div>
              <div className="sm:col-span-4">{input('service_city', 'Ort')}</div>
              <div className="sm:col-span-6">{input('address_instructions', 'Instruktioner', {}, true)}</div>
            </>
          )}
        </fieldset>

        <fieldset className="grid gap-5">
          <legend className="eyebrow mb-4">Anteckningar</legend>
          <Field id="nb-customer_notes" label="Kundens önskemål" optional error={errors.customer_notes}>
            <textarea id="nb-customer_notes" rows={3} maxLength={1000} className="field-input" value={f.customer_notes} onChange={set('customer_notes')} />
          </Field>
          <Field id="nb-admin_notes" label="Intern anteckning" optional>
            <textarea id="nb-admin_notes" rows={2} maxLength={2000} className="field-input" value={f.admin_notes} onChange={set('admin_notes')} />
          </Field>
        </fieldset>

        {f.status === 'confirmed' && (
          <label className="flex items-center gap-2 text-sm text-silver-300">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="accent-silver-200" />
            Skicka bokningsbekräftelse till kunden via e-post
          </label>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <button type="submit" className="btn btn-metal" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />} Skapa bokning
        </button>
      </form>
    </div>
  );
}
