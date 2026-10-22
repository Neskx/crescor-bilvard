import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Check, CheckCheck, Copy, Mail, MapPin, MessageSquareQuote, ShieldOff, X, XCircle } from 'lucide-react';
import {
  AdminError,
  adminMessage,
  anonymizeAppointment,
  getAppointment,
  notificationLog,
  notifyCustomer,
  reschedule,
  setStatus,
  updateAdminNotes,
} from '../adminApi';
import { charityForAppointment, issueReviewLink, reviewStateFor, sendReviewInvite, updateAppointmentLocation } from '../adminApiPhase2';
import { StatusBadge, useConfirm, useToast } from '../components';
import { LOCATION_LABEL } from '../../booking/locations';
import { Alert, Spinner } from '../../components/ui';
import { DEFAULT_TZ, dateKeyInZone, formatDateLong, formatDateTimeShort, formatTime, zonedTimeToUtc } from '../../lib/datetime';
import { formatAmount, formatTotal, telHref } from '../../lib/format';
import { validateAddress } from '../../../supabase/functions/_shared/validation';
import type { AdminReview, Appointment, EmailStatus, LocationType, NotificationLogEntry } from '../../types';

const KIND_LABEL: Record<string, string> = {
  booking_customer: 'Bokningsbekräftelse till kund',
  booking_admin: 'Notis till företaget',
  confirmed: 'Bekräftelse till kund',
  cancelled: 'Avbokning till kund',
  rescheduled: 'Ny tid till kund',
  review_invite: 'Recensionsinbjudan till kund',
};

const REVIEW_STATUS: Record<AdminReview['status'], string> = { pending: 'väntar på granskning', approved: 'publicerad', rejected: 'avvisad', hidden: 'dold' };

type LocationForm = { location_type: LocationType; service_address: string; service_postal_code: string; service_city: string; address_instructions: string };
const EMAIL_LABEL: Record<string, string> = { sent: 'Skickat', failed: 'Misslyckades', not_configured: 'E-post ej konfigurerad' };

function emailToast(status: EmailStatus | 'error'): string {
  if (status === 'sent') return 'Kunden har fått ett mejl.';
  if (status === 'not_configured') return 'E-post är inte konfigurerad – kontakta kunden på annat sätt.';
  return 'Mejlet till kunden kunde inte skickas. Kontakta kunden på annat sätt.';
}

export function BookingDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const [a, setA] = useState<Appointment | null>(null);
  const [log, setLog] = useState<NotificationLogEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [notify, setNotify] = useState(true);
  const [moving, setMoving] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [override, setOverride] = useState(false);
  const [charity, setCharity] = useState<string | null>(null);
  const [review, setReview] = useState<Awaited<ReturnType<typeof reviewStateFor>> | null>(null);
  const [reviewLink, setReviewLink] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState(false);
  const [loc, setLoc] = useState<LocationForm | null>(null);
  const tz = DEFAULT_TZ;

  const load = async (appointmentId: string) => {
    setLoadError(null);
    try {
      const [row, entries, chosen, rv] = await Promise.all([
        getAppointment(appointmentId),
        notificationLog(appointmentId),
        // Secondary details must never block the booking itself from showing.
        charityForAppointment(appointmentId).catch(() => null),
        reviewStateFor(appointmentId).catch(() => null),
      ]);
      setA(row);
      setCharity(chosen);
      setReview(rv);
      setLoc({
        location_type: row.location_type,
        service_address: row.service_address ?? '',
        service_postal_code: row.service_postal_code ?? '',
        service_city: row.service_city ?? '',
        address_instructions: row.address_instructions ?? '',
      });
      setNotes(row.admin_notes ?? '');
      setLog(entries);
      setNewDate(dateKeyInZone(row.start_time, tz));
      setNewTime(formatTime(row.start_time, tz));
    } catch (e) {
      setLoadError(adminMessage(e));
    }
  };

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (id) {
      setA(null);
      setMoving(false);
      setEditingLocation(false);
      setReviewLink(null);
      setOverride(false);
      void load(id);
      if (!d.open) d.showModal();
    } else if (d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onChanged();
      if (id) await load(id);
    } catch (e) {
      toast('error', adminMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const changeStatus = (status: 'confirmed' | 'cancelled' | 'completed') =>
    run(async () => {
      if (!a) return;
      if (status === 'cancelled') {
        const ok = await confirm({
          title: 'Avboka bokningen?',
          body: (
            <>
              {a.booking_reference} – {a.customer_name}, {formatDateLong(a.start_time, tz)} kl. {formatTime(a.start_time, tz)}. Tiden blir ledig för andra.
              {notify ? ' Kunden får ett avbokningsmejl.' : ' Inget mejl skickas.'}
            </>
          ),
          confirmLabel: 'Avboka',
          danger: true,
        });
        if (!ok) return;
      }
      await setStatus(a.id, status);
      const label = status === 'confirmed' ? 'Bokningen är bekräftad.' : status === 'cancelled' ? 'Bokningen är avbokad.' : 'Markerad som utförd.';
      if (notify && (status === 'confirmed' || status === 'cancelled')) {
        const res = await notifyCustomer(a.id, status);
        toast(res === 'sent' ? 'success' : 'info', `${label} ${emailToast(res)}`);
      } else toast('success', label);
    });

  const doReschedule = () =>
    run(async () => {
      if (!a || !newDate || !newTime) return;
      const startIso = zonedTimeToUtc(newDate, newTime, tz);
      const ok = await confirm({
        title: 'Flytta bokningen?',
        body: `Ny tid: ${formatDateLong(startIso, tz)} kl. ${formatTime(startIso, tz)}.${notify ? ' Kunden får ett mejl om den nya tiden.' : ''}`,
        confirmLabel: 'Flytta',
      });
      if (!ok) return;
      const res = await reschedule(a.id, startIso, override);
      setMoving(false);
      if (notify) {
        const mail = await notifyCustomer(a.id, 'rescheduled', res.previous_start_time);
        toast(mail === 'sent' ? 'success' : 'info', `Bokningen är flyttad. ${emailToast(mail)}`);
      } else toast('success', 'Bokningen är flyttad.');
    });

  const saveLocation = () =>
    run(async () => {
      if (!a || !loc) return;
      if (loc.location_type !== 'workshop') {
        const first = Object.values(validateAddress(loc))[0];
        if (first) throw new AdminError('invalid_input', first);
      }
      await updateAppointmentLocation(a.id, loc);
      setEditingLocation(false);
      toast('success', 'Platsen är uppdaterad. Kontakta kunden om ändringen.');
    });

  const inviteReview = () =>
    run(async () => {
      if (!a) return;
      const res = await sendReviewInvite(a.id);
      setReviewLink(res.link);
      if (res.email === 'sent') toast('success', 'Recensionsinbjudan är skickad.');
      else toast('info', `${emailToast(res.email)} Kopiera länken nedan och skicka den på annat sätt.`);
    });

  const copyReviewLink = () =>
    run(async () => {
      if (!a) return;
      const link = await issueReviewLink(a.id);
      setReviewLink(link);
      try {
        await navigator.clipboard.writeText(link);
        toast('success', 'En ny personlig länk är kopierad. Tidigare länkar slutar gälla.');
      } catch {
        toast('info', 'Länken visas nedan – kopiera den manuellt.');
      }
    });

  const saveNotes = () =>
    run(async () => {
      if (!a) return;
      await updateAdminNotes(a.id, notes.trim());
      toast('success', 'Anteckningen är sparad.');
    });

  const anonymize = () =>
    run(async () => {
      if (!a) return;
      const ok = await confirm({
        title: 'Anonymisera personuppgifter?',
        body: 'Namn, kontaktuppgifter, adress och anteckningar tas bort permanent. Själva bokningen (tid och tjänst) finns kvar. Detta kan inte ångras.',
        confirmLabel: 'Anonymisera',
        danger: true,
      });
      if (!ok) return;
      await anonymizeAppointment(a.id);
      toast('success', 'Personuppgifterna är borttagna.');
    });

  const active = a && (a.status === 'pending' || a.status === 'confirmed');
  const anonymized = Boolean(a?.anonymized_at);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-full max-w-xl border-l border-white/10 bg-ink-900 p-0 text-white backdrop:bg-black/60"
      aria-label="Bokningsdetaljer"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
          <p className="font-display text-2xl font-semibold tracking-wide">{a?.booking_reference ?? 'Bokning'}</p>
          <button type="button" onClick={onClose} aria-label="Stäng" className="flex h-10 w-10 items-center justify-center border border-white/15 hover:border-white">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loadError && <Alert tone="error">{loadError}</Alert>}
          {!a && !loadError && (
            <div className="flex justify-center py-20">
              <Spinner label="Laddar bokning" />
            </div>
          )}
          {a && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={a.status} />
                <span className="text-xs text-silver-500">
                  {a.source === 'admin' ? 'Skapad av admin' : 'Bokad online'} {formatDateTimeShort(a.created_at, tz)}
                </span>
              </div>
              <p className="font-display mt-4 text-3xl font-semibold">{a.service_name}</p>
              <p className="mt-1 text-silver-300">
                {formatDateLong(a.start_time, tz)} · {formatTime(a.start_time, tz)}–{formatTime(a.end_time, tz)}
              </p>

              <dl className="mt-6 grid grid-cols-[130px_1fr] gap-x-4 gap-y-3 border-t border-white/[0.07] pt-6 text-sm">
                <dt className="text-silver-500">Kund</dt>
                <dd>{a.customer_name}</dd>
                <dt className="text-silver-500">E-post</dt>
                <dd className="break-all">{anonymized ? '–' : <a className="underline" href={`mailto:${a.customer_email}`}>{a.customer_email}</a>}</dd>
                <dt className="text-silver-500">Telefon</dt>
                <dd>{anonymized ? '–' : <a className="underline" href={telHref(a.customer_phone)}>{a.customer_phone}</a>}</dd>
                <dt className="text-silver-500">Plats</dt>
                <dd>
                  <span className="block font-semibold">{LOCATION_LABEL[a.location_type]}</span>
                  {a.location_type !== 'workshop' &&
                    ([a.service_address, [a.service_postal_code, a.service_city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–')}
                  {a.address_instructions && <span className="mt-1 block text-silver-400 whitespace-pre-line">{a.address_instructions}</span>}
                  {a.travel_minutes > 0 && <span className="mt-1 block text-xs text-silver-500">{a.travel_minutes} min restid reserverad före och efter</span>}
                </dd>
                {a.location_fee !== null && Number(a.location_fee) > 0 && (
                  <>
                    <dt className="text-silver-500">{a.location_type === 'pickup' ? 'Hämtningsavgift' : 'Framkörning'}</dt>
                    <dd>+{formatAmount(Number(a.location_fee))}</dd>
                  </>
                )}
                {charity && (
                  <>
                    <dt className="text-silver-500">Valt ändamål</dt>
                    <dd>{charity}</dd>
                  </>
                )}
                {(a.vehicle_information || a.registration_number) && (
                  <>
                    <dt className="text-silver-500">Bil</dt>
                    <dd>{[a.vehicle_information, a.registration_number].filter(Boolean).join(' · ')}</dd>
                  </>
                )}
                {a.addons?.length > 0 && (
                  <>
                    <dt className="text-silver-500">Tillägg</dt>
                    <dd>
                      <ul className="space-y-0.5">
                        {a.addons.map((x) => (
                          <li key={x.id} className="flex justify-between gap-4">
                            <span>{x.name}</span>
                            <span className="text-silver-400 tabular-nums">+{formatAmount(x.price)}</span>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </>
                )}
                <dt className="text-silver-500">Pris</dt>
                <dd>{formatTotal(a.price_snapshot, a.price_type_snapshot, Number(a.addons_total ?? 0) + Number(a.location_fee ?? 0)) ?? 'Enligt offert'}</dd>
                {a.customer_notes && (
                  <>
                    <dt className="text-silver-500">Kundens meddelande</dt>
                    <dd className="whitespace-pre-line">{a.customer_notes}</dd>
                  </>
                )}
              </dl>

              {!anonymized && (
                <>
                  <label className="mt-6 flex items-center gap-3 text-sm text-silver-300">
                    <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-silver-200" />
                    <Mail className="h-4 w-4" aria-hidden /> Meddela kunden via e-post vid ändringar
                  </label>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {a.status === 'pending' && (
                      <button type="button" className="btn btn-metal btn-sm" disabled={busy} onClick={() => void changeStatus('confirmed')}>
                        <Check className="h-4 w-4" aria-hidden /> Bekräfta
                      </button>
                    )}
                    {active && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setMoving((v) => !v)}>
                        <CalendarClock className="h-4 w-4" aria-hidden /> Flytta
                      </button>
                    )}
                    {a.status === 'confirmed' && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void changeStatus('completed')}>
                        <CheckCheck className="h-4 w-4" aria-hidden /> Markera utförd
                      </button>
                    )}
                    {active && (
                      <button type="button" className="btn btn-ghost btn-sm !border-[#ff8a80]/40 !text-[#ffd5d0]" disabled={busy} onClick={() => void changeStatus('cancelled')}>
                        <XCircle className="h-4 w-4" aria-hidden /> Avboka
                      </button>
                    )}
                    {active && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditingLocation((v) => !v)}>
                        <MapPin className="h-4 w-4" aria-hidden /> Ändra plats
                      </button>
                    )}
                    {a.status === 'cancelled' && new Date(a.start_time) > new Date() && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void changeStatus('confirmed')}>
                        Återaktivera
                      </button>
                    )}
                  </div>

                  {moving && (
                    <div className="mt-5 border border-white/10 bg-ink-850 p-4">
                      <p className="text-sm font-semibold">Ny tid (svensk tid)</p>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <input type="date" aria-label="Nytt datum" className="field-input" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                        <input type="time" aria-label="Ny starttid" step={300} className="field-input" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
                      </div>
                      <label className="mt-3 flex items-center gap-2 text-xs text-silver-300">
                        <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="accent-silver-200" />
                        Tillåt utanför öppettider och tidsraster (krockar stoppas alltid)
                      </label>
                      <button type="button" className="btn btn-metal btn-sm mt-4" disabled={busy || !newDate || !newTime} onClick={() => void doReschedule()}>
                        {busy ? <Spinner className="h-4 w-4" /> : null} Spara ny tid
                      </button>
                    </div>
                  )}

                  {editingLocation && loc && (
                    <div className="mt-5 grid gap-3 border border-white/10 bg-ink-850 p-4">
                      <p className="text-sm font-semibold">Plats</p>
                      <div className="flex flex-wrap gap-4 text-sm">
                        {(['workshop', 'pickup', 'customer_address'] as const).map((t) => (
                          <label key={t} className="flex items-center gap-2">
                            <input type="radio" name="drawer-loc" className="accent-silver-200" checked={loc.location_type === t} onChange={() => setLoc({ ...loc, location_type: t })} />
                            {LOCATION_LABEL[t]}
                          </label>
                        ))}
                      </div>
                      {loc.location_type !== 'workshop' && (
                        <>
                          <input aria-label="Gatuadress" placeholder="Gatuadress" className="field-input" maxLength={120} value={loc.service_address} onChange={(e) => setLoc({ ...loc, service_address: e.target.value })} />
                          <div className="grid grid-cols-[120px_1fr] gap-3">
                            <input aria-label="Postnummer" placeholder="123 45" inputMode="numeric" className="field-input" maxLength={6} value={loc.service_postal_code} onChange={(e) => setLoc({ ...loc, service_postal_code: e.target.value })} />
                            <input aria-label="Ort" placeholder="Ort" className="field-input" maxLength={60} value={loc.service_city} onChange={(e) => setLoc({ ...loc, service_city: e.target.value })} />
                          </div>
                          <textarea aria-label="Instruktioner" placeholder="Instruktioner" rows={2} className="field-input" maxLength={500} value={loc.address_instructions} onChange={(e) => setLoc({ ...loc, address_instructions: e.target.value })} />
                        </>
                      )}
                      <p className="text-xs text-silver-500">Restiden räknas om. Ändringen stoppas om den krockar med en annan bokning. Inget mejl skickas automatiskt.</p>
                      <button type="button" className="btn btn-metal btn-sm w-fit" disabled={busy} onClick={() => void saveLocation()}>
                        Spara plats
                      </button>
                    </div>
                  )}

                  {a.status === 'completed' && (
                    <div className="mt-8 border border-white/10 bg-ink-850 p-4">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <MessageSquareQuote className="h-4 w-4" aria-hidden /> Recension
                      </p>
                      {review?.review ? (
                        <p className="mt-2 text-sm text-silver-300">
                          Kunden har lämnat en recension ({review.review.rating}/5) – {REVIEW_STATUS[review.review.status]}.
                        </p>
                      ) : (
                        <>
                          <p className="mt-2 text-sm text-silver-400">
                            {review?.invitedAt
                              ? `Inbjudan skapad ${formatDateTimeShort(review.invitedAt, tz)}. En ny inbjudan ersätter den tidigare länken.`
                              : 'Be kunden om en recension. Länken är personlig och kan användas en gång.'}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void inviteReview()}>
                              <Mail className="h-4 w-4" aria-hidden /> Skicka inbjudan
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void copyReviewLink()}>
                              <Copy className="h-4 w-4" aria-hidden /> Kopiera länk
                            </button>
                          </div>
                          {reviewLink && <input readOnly aria-label="Recensionslänk" className="field-input mt-3 text-xs" value={reviewLink} onFocus={(e) => e.target.select()} />}
                        </>
                      )}
                    </div>
                  )}

                  <div className="mt-8">
                    <label htmlFor="admin-notes" className="field-label">
                      Intern anteckning
                    </label>
                    <textarea id="admin-notes" rows={3} maxLength={2000} className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
                    <button type="button" className="btn btn-ghost btn-sm mt-2" disabled={busy || notes === (a.admin_notes ?? '')} onClick={() => void saveNotes()}>
                      Spara anteckning
                    </button>
                  </div>
                </>
              )}

              <div className="mt-8">
                <p className="field-label">E-posthistorik</p>
                {log.length === 0 ? (
                  <p className="text-sm text-silver-500">Inga utskick registrerade.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {log.map((l) => (
                      <li key={l.id} className="flex flex-wrap justify-between gap-2 border-b border-white/[0.05] pb-2">
                        <span>{KIND_LABEL[l.kind] ?? l.kind}</span>
                        <span className={l.status === 'sent' ? 'text-emerald-200' : l.status === 'failed' ? 'text-[#ff8a80]' : 'text-silver-500'}>
                          {EMAIL_LABEL[l.status] ?? l.status} · {formatDateTimeShort(l.created_at, tz)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {!anonymized && !active && (
                <button type="button" className="mt-10 inline-flex items-center gap-2 text-xs text-silver-500 underline hover:text-[#ff8a80]" onClick={() => void anonymize()}>
                  <ShieldOff className="h-3.5 w-3.5" aria-hidden /> Anonymisera personuppgifter (GDPR)
                </button>
              )}
              {anonymized && <Alert tone="info" className="mt-8">Personuppgifterna för denna bokning är anonymiserade.</Alert>}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
