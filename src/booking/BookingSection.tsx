import { CalendarClock } from 'lucide-react';
import { BookingFlow } from './BookingFlow';
import { Alert, SectionHeading, Spinner } from '../components/ui';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { useReveal } from '../hooks/useReveal';
import { errorMessage } from '../lib/messages';
import { telHref } from '../lib/format';

export function BookingSection({ showHeading = true }: { showHeading?: boolean }) {
  const ref = useReveal<HTMLElement>();
  const { status, config, error, reload } = usePublicConfig();
  const s = config.settings;
  const hasLocation = s.workshop_available || s.mobile_available;

  const contactFallback = (
    <p className="mt-3 text-sm text-silver-300">
      {s.company_phone ? (
        <>
          Ring oss på{' '}
          <a href={telHref(s.company_phone)} className="text-white underline">
            {s.company_phone}
          </a>{' '}
          eller{' '}
        </>
      ) : null}
      <a href="#kontakt" className="text-white underline">
        skicka ett meddelande
      </a>{' '}
      så hjälper vi dig att hitta en tid.
    </p>
  );

  let body;
  if (status === 'loading') {
    body = (
      <div className="flex min-h-[320px] items-center justify-center gap-3 text-silver-400">
        <Spinner label="Laddar bokningen" /> <span className="text-sm">Laddar bokningen…</span>
      </div>
    );
  } else if (status === 'not_configured') {
    body = (
      <Alert tone="info" title="Onlinebokningen är inte aktiverad i den här miljön">
        Bokningssystemet saknar konfiguration (Supabase-anslutning).
        {contactFallback}
      </Alert>
    );
  } else if (status === 'error') {
    body = (
      <Alert
        tone="error"
        title="Bokningen kunde inte laddas"
        action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void reload()}>
            Försök igen
          </button>
        }
      >
        {errorMessage(error)}
        {contactFallback}
      </Alert>
    );
  } else if (!s.booking_enabled || config.services.length === 0 || !hasLocation) {
    body = (
      <div className="flex flex-col items-start gap-5 py-6 sm:flex-row sm:items-center">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center border border-white/15">
          <CalendarClock className="h-6 w-6 text-silver-300" strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <p className="font-display text-3xl font-semibold text-white">Onlinebokningen öppnar snart</p>
          {contactFallback}
        </div>
      </div>
    );
  } else {
    body = <BookingFlow config={config} reload={reload} />;
  }

  return (
    <section
      ref={ref}
      id="boka"
      aria-labelledby={showHeading ? 'boka-title' : undefined}
      aria-label={showHeading ? undefined : 'Bokning'}
      className={showHeading ? 'relative bg-ink-900 py-24 sm:py-32' : 'relative bg-ink-900 py-14 sm:py-20'}
    >
      <div aria-hidden className="hairline absolute inset-x-0 top-0" />
      <div className="container-lux">
        {showHeading && (
          <SectionHeading
            id="boka-title"
            eyebrow="Boka tid"
            title={
              <>
                Boka din tid <br className="sm:hidden" />
                <span className="text-metal">online.</span>
              </>
            }
            lead="Välj tjänst, plats och en tid som passar dig. Lediga tider visas i realtid – tiden reserveras så snart du skickar bokningen."
          />
        )}
        <div className={showHeading ? 'reveal panel mt-12 p-5 sm:p-8 lg:p-12' : 'reveal panel p-5 sm:p-8 lg:p-12'}>{body}</div>
      </div>
    </section>
  );
}
