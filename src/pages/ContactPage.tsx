import { SiteLayout } from '../components/SiteLayout';
import { PageHero } from '../components/PageHero';
import { Contact } from '../sections/Contact';
import { usePageMeta } from '../hooks/usePageMeta';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { useReveal } from '../hooks/useReveal';
import { Link } from 'react-router-dom';
import { groupBusinessHours } from '../lib/hours';

/** Bookable hours, straight from the business_hours table (only when configured). */
function BookableHours() {
  const ref = useReveal<HTMLElement>();
  const { config, live } = usePublicConfig();
  const hours = config.business_hours;
  if (!live || !config.settings.booking_enabled || !hours.some((h) => !h.is_closed)) return null;
  return (
    <section ref={ref} aria-labelledby="tider-title" className="bg-ink-950 py-20 sm:py-24">
      <div className="container-lux grid gap-10 lg:grid-cols-12">
        <div className="reveal lg:col-span-5">
          <p className="eyebrow">Bokningsbara tider</p>
          <h2 id="tider-title" className="font-display mt-5 text-5xl leading-[0.95] font-semibold text-white">
            När du kan <span className="text-metal">boka oss.</span>
          </h2>
          <p className="mt-5 max-w-md text-silver-400">
            Tiderna visar när arbeten kan bokas online. Helgdagar och semestrar kan avvika – se lediga tider i kalendern.
          </p>
          <Link to="/boka" className="btn btn-metal mt-8">
            Se lediga tider
          </Link>
        </div>
        <ul className="reveal self-center divide-y divide-white/[0.07] border-y border-white/[0.07] lg:col-span-6 lg:col-start-7">
          {groupBusinessHours(hours).map((g) => (
            <li key={g.days} className="flex items-center justify-between gap-6 py-5">
              <span className="text-white">{g.days}</span>
              <span className={g.closed ? 'text-silver-500' : 'font-semibold text-white tabular-nums'}>{g.hours}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ContactPage() {
  usePageMeta({
    title: 'Kontakt',
    description: 'Kontakta Crescor Bilvård med frågor om biltvätt och tillägg, eller boka din tid direkt online.',
    path: '/kontakt',
  });
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Kontakt"
        title={
          <>
            Vi hörs <span className="text-metal">snart.</span>
          </>
        }
        lead="Har du en fråga om en behandling eller vill du ha ett upplägg för just din bil? Hör av dig så återkommer vi."
        image="/images/service-utvandig.webp"
        crumbs={[{ label: 'Kontakt' }]}
      />
      <Contact />
      <BookableHours />
    </SiteLayout>
  );
}
