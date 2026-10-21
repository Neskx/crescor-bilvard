import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, CarFront, MailCheck, Sparkles, type LucideIcon } from 'lucide-react';
import { SectionHeading } from './ui';
import { useReveal } from '../hooks/useReveal';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { telHref } from '../lib/format';

const PROCESS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CalendarCheck, title: 'Boka online', text: 'Välj tjänst, plats och en tid som passar dig. Tiden reserveras direkt.' },
  { icon: MailCheck, title: 'Vi bekräftar', text: 'Du får ett bokningsnummer direkt, och vi hör av oss om något behöver stämmas av.' },
  { icon: Sparkles, title: 'Vi utför arbetet', text: 'Arbetet görs metodiskt och anpassat efter bilens skick och dina önskemål.' },
  { icon: CarFront, title: 'Klar att köra', text: 'Du får tillbaka en bil som känns omhändertagen – ända in i detaljerna.' },
];

/** "Så går det till" – the booking-to-delivery journey. */
export function ProcessSteps() {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} aria-labelledby="process-title" className="bg-ink-900 py-24 sm:py-28">
      <div className="container-lux">
        <SectionHeading
          id="process-title"
          eyebrow="Så går det till"
          title={
            <>
              Från bokning till <span className="text-metal">färdig bil.</span>
            </>
          }
        />
        <ol className="mt-14 grid gap-px overflow-hidden border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="reveal group relative bg-ink-900 p-8" style={{ transitionDelay: `${i * 90}ms` }}>
              {/* Decorative watermark number (CSS content, so it is not read as text) */}
              <span
                aria-hidden
                data-n={String(i + 1).padStart(2, '0')}
                className="font-display absolute top-6 right-7 text-6xl font-semibold text-white/[0.04] transition-colors duration-500 group-hover:text-white/[0.09] before:content-[attr(data-n)]"
              />
              <span className="flex h-12 w-12 items-center justify-center border border-white/15 text-white">
                <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
              </span>
              <h3 className="font-display mt-7 text-2xl font-semibold text-white">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-silver-400">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Closing call to action used at the bottom of subpages. */
export function CtaBand({ title = 'Redo att ge bilen det den förtjänar?', text }: { title?: string; text?: string }) {
  const ref = useReveal<HTMLElement>();
  const { config } = usePublicConfig();
  const phone = config.settings.company_phone;
  return (
    <section ref={ref} className="relative isolate overflow-hidden bg-ink-950 py-24 sm:py-28">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_120%,rgba(192,192,192,0.14),transparent_60%)]" />
      <div aria-hidden className="hairline absolute inset-x-0 top-0" />
      <div className="container-lux reveal text-center">
        <h2 className="font-display mx-auto max-w-3xl text-5xl leading-[0.95] font-semibold text-white sm:text-6xl">{title}</h2>
        <p className="mx-auto mt-6 max-w-xl text-silver-400">
          {text ?? 'Se lediga tider och boka direkt online – det tar bara ett par minuter.'}
        </p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/boka" className="btn btn-metal">
            Boka bilvård <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          {phone ? (
            <a href={telHref(phone)} className="btn btn-ghost">
              Ring {phone}
            </a>
          ) : (
            <Link to="/kontakt" className="btn btn-ghost">
              Kontakta oss
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
