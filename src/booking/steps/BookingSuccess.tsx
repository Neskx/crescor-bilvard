import { useEffect, useRef } from 'react';
import { CalendarPlus, Check } from 'lucide-react';
import { Alert } from '../../components/ui';
import { buildIcs, downloadIcs } from '../ics';
import { formatDateLong, formatTime } from '../../lib/datetime';
import { formatAmount } from '../../lib/format';
import type { BookingResult, PublicSettings } from '../../types';

export interface SuccessInfo extends BookingResult {
  customer_email: string;
  location: string;
}

export function BookingSuccess({ result, settings, onNew }: { result: SuccessInfo; settings: PublicSettings; onNew: () => void }) {
  const tz = settings.timezone;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const confirmed = result.status === 'confirmed';

  const addToCalendar = () =>
    downloadIcs(
      `bokning-${result.booking_reference}.ics`,
      buildIcs({
        reference: result.booking_reference,
        title: `${result.service_name} – ${settings.company_name}`,
        start: result.start_time,
        end: result.end_time,
        location: result.location,
        description: `Bokningsnummer: ${result.booking_reference}`,
      }),
    );

  return (
    <div className="py-4 text-center sm:py-8">
      <span className="metal-ring mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/[0.05]">
        <Check className="h-9 w-9 text-white" strokeWidth={1.5} aria-hidden />
      </span>
      <h3 ref={heading} tabIndex={-1} className="font-display mt-8 text-4xl font-semibold text-white outline-none sm:text-5xl">
        {confirmed ? 'Din bokning är bekräftad' : 'Tack! Din tid är reserverad'}
      </h3>
      <p className="mx-auto mt-4 max-w-lg text-silver-300">
        {confirmed
          ? 'Vi ser fram emot att ta hand om din bil.'
          : 'Vi har tagit emot din bokningsförfrågan och reserverat tiden. Vi bekräftar bokningen så snart vi har gått igenom den.'}
      </p>

      <div className="mx-auto mt-10 max-w-md border border-white/[0.09] bg-ink-900 p-6 text-left">
        <p className="eyebrow">Bokningsnummer</p>
        <p className="font-display mt-1 text-4xl font-semibold tracking-[0.12em] text-metal select-all">{result.booking_reference}</p>
        <div className="hairline my-5" />
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-silver-400">Tjänst</dt>
            <dd className="text-right text-white">{result.service_name}</dd>
          </div>
          {result.addons && result.addons.length > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-silver-400">Tillägg</dt>
              <dd className="text-right text-white">
                {result.addons.map((a) => a.name).join(', ')}
                <span className="block text-silver-400">+{formatAmount(result.addons_total ?? 0)}</span>
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-silver-400">Datum</dt>
            <dd className="text-right text-white">{formatDateLong(result.start_time, tz)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-silver-400">Tid</dt>
            <dd className="text-right text-white">
              {formatTime(result.start_time, tz)}–{formatTime(result.end_time, tz)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-silver-400">Plats</dt>
            <dd className="text-right text-white">{result.location}</dd>
          </div>
        </dl>
      </div>

      <div className="mx-auto mt-6 max-w-md text-left">
        {result.email === 'sent' && (
          <Alert tone="success">En bekräftelse har skickats till {result.customer_email}. Hittar du den inte? Titta i skräpposten.</Alert>
        )}
        {result.email === 'failed' && (
          <Alert tone="warning" title="Bokningen är registrerad">
            Vi kunde dock inte skicka bekräftelsemejlet just nu, så det kan dröja eller utebli. Spara ditt bokningsnummer –
            bokningen gäller ändå.
          </Alert>
        )}
        {result.email === 'not_configured' && (
          <Alert tone="info">Spara ditt bokningsnummer. Vi kontaktar dig om något behöver stämmas av inför besöket.</Alert>
        )}
      </div>

      <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" onClick={addToCalendar} className="btn btn-metal">
          <CalendarPlus className="h-4 w-4" aria-hidden /> Lägg till i kalendern
        </button>
        <button type="button" onClick={onNew} className="btn btn-ghost">
          Gör en ny bokning
        </button>
      </div>
    </div>
  );
}
