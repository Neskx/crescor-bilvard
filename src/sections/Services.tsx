import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { SectionHeading } from '../components/ui';
import { AddonPriceList } from '../components/AddonPriceList';
import { PackageCard } from '../components/PackageCard';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { useReveal } from '../hooks/useReveal';
import { cx } from '../lib/format';

export function Services() {
  const { config, live, status } = usePublicConfig();
  const ref = useReveal<HTMLElement>();
  const bookable = live && config.settings.booking_enabled;
  const count = config.services.length;

  return (
    <section ref={ref} id="tjanster" aria-labelledby="tjanster-title" className="relative bg-ink-950 py-24 sm:py-32">
      <div className="container-lux">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="tjanster-title"
            eyebrow="Våra paket"
            title={
              <>
                Bilvård efter <br />
                <span className="text-metal">dina behov.</span>
              </>
            }
          />
          <p className="reveal max-w-md text-base leading-relaxed text-silver-400">
            Tre tydliga paket – från en smidig tvätt till en grundlig rekond. Välj det som passar din bil och komplettera
            gärna med tillägg när du bokar.
          </p>
        </div>

        {status === 'loading' ? (
          <div className="mt-14 grid gap-5 md:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-[640px]" />
            ))}
          </div>
        ) : count === 0 ? (
          <p className="mt-14 text-silver-400">Tjänsteutbudet uppdateras. Kontakta oss gärna för mer information.</p>
        ) : (
          <div className={cx('mt-14 grid items-stretch gap-5', count >= 3 ? 'lg:grid-cols-3' : count === 2 ? 'md:grid-cols-2' : 'max-w-xl')}>
            {config.services.map((s) => (
              <PackageCard key={s.id} service={s} bookable={bookable} />
            ))}
          </div>
        )}

        {status !== 'loading' && config.addons.length > 0 && (
          <AddonPriceList addons={config.addons} titleId="tillagg-title" className="reveal mt-5" />
        )}

        <div className="mt-10 flex justify-center">
          <Link to="/tjanster" className="btn btn-ghost">
            Paket och tillägg i detalj <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
