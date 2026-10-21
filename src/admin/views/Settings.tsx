import { useEffect, useState, type FormEvent } from 'react';
import { adminMessage, applyRetention, getSettings, saveSettings } from '../adminApi';
import { PageHeader, Toggle, useConfirm, useToast } from '../components';
import { Alert, Field, Spinner } from '../../components/ui';
import { validateEmail } from '../../../supabase/functions/_shared/validation';
import type { AdminSettings } from '../../types';

type Form = Omit<AdminSettings, 'updated_at'>;

const TEXT_FIELDS: { key: keyof Form; label: string; hint?: string; textarea?: boolean; max: number }[] = [
  { key: 'company_name', label: 'Företagsnamn', max: 120 },
  { key: 'company_phone', label: 'Telefon', hint: 'Visas på webbplatsen och i mejl.', max: 40 },
  { key: 'company_email', label: 'E-post', hint: 'Visas på webbplatsen och används som svarsadress.', max: 254 },
  { key: 'company_address', label: 'Adress till verkstaden', hint: 'Lämna tomt om ni inte tar emot bilar på en egen adress.', max: 300 },
  { key: 'opening_hours_text', label: 'Öppettider (text)', hint: 'Till exempel "Mån–fre 08–17". Visas på webbplatsen.', textarea: true, max: 300 },
  { key: 'service_area_text', label: 'Område för mobil bilvård', hint: 'Till exempel "Malmö med omnejd".', max: 300 },
  { key: 'org_number', label: 'Organisationsnummer', max: 20 },
  { key: 'notification_email', label: 'E-post för bokningsnotiser', hint: 'Hit skickas nya bokningar. Tomt = företagets e-post.', max: 254 },
];

export function SettingsView() {
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSettings()
      .then(({ updated_at: _ignored, ...rest }) => setF(rest))
      .catch((e) => setError(adminMessage(e)));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setFormError(null);
    const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
    const payload: Partial<Form> = {
      ...f,
      company_name: f.company_name.trim() || 'Crescor Bilvård',
      company_phone: clean(f.company_phone),
      company_email: clean(f.company_email),
      company_address: clean(f.company_address),
      opening_hours_text: clean(f.opening_hours_text),
      service_area_text: clean(f.service_area_text),
      org_number: clean(f.org_number),
      notification_email: clean(f.notification_email),
    };
    for (const k of ['company_email', 'notification_email'] as const) {
      if (payload[k] && validateEmail(payload[k]!)) return setFormError('Kontrollera e-postadresserna.');
    }
    if (payload.workshop_service_enabled && !payload.company_address) {
      return setFormError('Ange verkstadens adress för att kunna erbjuda bokning hos er.');
    }
    setBusy(true);
    try {
      await saveSettings(payload);
      toast('success', 'Inställningarna är sparade.');
    } catch (err) {
      setFormError(adminMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function runRetention() {
    const ok = await confirm({
      title: 'Gallra gamla personuppgifter?',
      body: `Bokningar som avslutades för mer än ${f?.retention_days} dagar sedan anonymiseras och gamla kontaktmeddelanden raderas. Detta kan inte ångras.`,
      confirmLabel: 'Gallra nu',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await applyRetention();
      toast('success', `${r.anonymized_appointments} bokningar anonymiserade, ${r.deleted_messages} meddelanden raderade.`);
    } catch (e) {
      toast('error', adminMessage(e));
    }
  }

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!f) return <Spinner label="Laddar inställningar" />;

  const missing = [
    !f.company_phone && 'telefonnummer',
    !f.company_email && 'e-postadress',
    !f.workshop_service_enabled && !f.mobile_service_enabled && 'minst ett platsalternativ (verkstad eller mobil)',
    !f.booking_enabled && 'aktivera onlinebokning',
  ].filter(Boolean);

  const num = (key: keyof Form, label: string, min: number, max: number, hint?: string) => (
    <Field id={`st-${key}`} label={label} hint={hint}>
      <input
        id={`st-${key}`}
        type="number"
        min={min}
        max={max}
        className="field-input"
        value={f[key] as number}
        onChange={(e) => setF({ ...f, [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })}
      />
    </Field>
  );

  return (
    <div className="max-w-3xl">
      <PageHeader title="Inställningar" sub="Företagsuppgifter och regler för onlinebokning." />
      {missing.length > 0 && (
        <Alert tone="warning" title="Saknas innan lansering" className="mb-8">
          {missing.join(', ')}.
        </Alert>
      )}
      <form onSubmit={submit} noValidate className="space-y-10">
        <section>
          <h2 className="eyebrow mb-4">Onlinebokning</h2>
          <Toggle checked={f.booking_enabled} onChange={(v) => setF({ ...f, booking_enabled: v })} label="Onlinebokning aktiverad" description="När den är avstängd visas ”Onlinebokningen öppnar snart” på webbplatsen." />
          <Toggle
            checked={f.workshop_service_enabled}
            onChange={(v) => setF({ ...f, workshop_service_enabled: v })}
            label="Bokning hos oss (verkstad)"
            description="Kräver att verkstadens adress är ifylld."
          />
          <Toggle checked={f.mobile_service_enabled} onChange={(v) => setF({ ...f, mobile_service_enabled: v })} label="Mobil bilvård på kundens adress" />
          <Toggle
            checked={f.auto_confirm}
            onChange={(v) => setF({ ...f, auto_confirm: v })}
            label="Bekräfta onlinebokningar automatiskt"
            description="Av: bokningar registreras som ”Väntar på bekräftelse” (tiden är ändå reserverad) och bekräftas av er. På: bokningen bekräftas direkt."
          />
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {num('booking_notice_hours', 'Framförhållning (timmar)', 0, 720, 'Minsta tid innan en bokning.')}
            {num('booking_horizon_days', 'Boka max (dagar framåt)', 1, 365)}
            <Field id="st-slot" label="Tidsintervall" hint="Hur ofta en starttid erbjuds.">
              <select id="st-slot" className="field-input" value={f.slot_interval_minutes} onChange={(e) => setF({ ...f, slot_interval_minutes: Number(e.target.value) })}>
                {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    Var {m}:e minut
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2">
          <h2 className="eyebrow sm:col-span-2">Företagsuppgifter</h2>
          {TEXT_FIELDS.map((t) => (
            <div key={t.key} className={t.textarea || t.key === 'company_address' ? 'sm:col-span-2' : ''}>
              <Field id={`st-${t.key}`} label={t.label} hint={t.hint} optional={t.key !== 'company_name'}>
                {t.textarea ? (
                  <textarea id={`st-${t.key}`} rows={2} maxLength={t.max} className="field-input" value={(f[t.key] as string | null) ?? ''} onChange={(e) => setF({ ...f, [t.key]: e.target.value })} />
                ) : (
                  <input id={`st-${t.key}`} maxLength={t.max} className="field-input" value={(f[t.key] as string | null) ?? ''} onChange={(e) => setF({ ...f, [t.key]: e.target.value })} />
                )}
              </Field>
            </div>
          ))}
        </section>

        <section>
          <h2 className="eyebrow mb-4">Integritet</h2>
          <div className="grid gap-5 sm:grid-cols-2">{num('retention_days', 'Spara personuppgifter (dagar)', 30, 3650, 'Därefter anonymiseras avslutade bokningar.')}</div>
          <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={() => void runRetention()}>
            Gallra nu
          </button>
        </section>

        {formError && <Alert tone="error">{formError}</Alert>}
        <button type="submit" className="btn btn-metal" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />} Spara inställningar
        </button>
      </form>
    </div>
  );
}
