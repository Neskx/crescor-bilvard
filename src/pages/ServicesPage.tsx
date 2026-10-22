import { SiteLayout } from '../components/SiteLayout';
import { PageHero } from '../components/PageHero';
import { CtaBand, ProcessSteps } from '../components/Blocks';
import { AddonPriceList } from '../components/AddonPriceList';
import { PackageCard } from '../components/PackageCard';
import { usePageMeta } from '../hooks/usePageMeta';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { useReveal } from '../hooks/useReveal';
import { cx } from '../lib/format';

export function ServicesPage() {
  usePageMeta({
    title: 'Våra tjänster – Enkel Tvätt, Mini Rekond och Premium Rekond',
    description:
      'Jämför Crescor Bilvårds paket: Enkel Tvätt (650 kr), Mini Rekond (1 200 kr) och Premium Rekond (1 800 kr). Se vad som ingår, beräknad tid och boka online.',
    path: '/tjanster',
  });
  const { config, status, live } = usePublicConfig();
  const ref = useReveal<HTMLElement>();
  const bookable = live && config.settings.booking_enabled;
  const count = config.services.length;

  return (
    <SiteLayout>
      <PageHero
        eyebrow="Våra paket"
        title={
          <>
            Bilvård, <span className="text-metal">på riktigt.</span>
          </>
        }
        lead="Tre paket – från en smidig tvätt till en grundlig rekond. Jämför vad som ingår och välj det som passar din bil."
        image="/images/service-helrekond.webp"
        crumbs={[{ label: 'Våra tjänster' }]}
      />

      <section ref={ref} aria-label="Paket" className="bg-ink-950 py-20 sm:py-28">
        <div className="container-lux">
          {status === 'loading' ? (
            <div className="grid gap-5 md:grid-cols-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-[640px]" />
              ))}
            </div>
          ) : (
            <div className={cx('grid items-stretch gap-5', count >= 3 ? 'lg:grid-cols-3' : count === 2 ? 'md:grid-cols-2' : 'max-w-xl')}>
              {config.services.map((s) => (
                <PackageCard key={s.id} service={s} bookable={bookable} headingLevel="h2" />
              ))}
            </div>
          )}

          <p className="reveal mt-8 max-w-3xl text-sm leading-relaxed text-silver-500">
            Tiderna är uppskattningar och kan variera med bilens storlek och skick. Vi hämtar gärna bilen eller tvättar på plats
            där det erbjuds – du väljer alternativ när du bokar.
          </p>

          {status !== 'loading' && config.addons.length > 0 && (
            <AddonPriceList addons={config.addons} titleId="tillagg-title" className="reveal mt-10" />
          )}
        </div>
      </section>

      <ProcessSteps />
      <CtaBand />
    </SiteLayout>
  );
}
