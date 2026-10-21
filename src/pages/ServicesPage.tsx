import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Clock } from 'lucide-react';
import { SiteLayout } from '../components/SiteLayout';
import { PageHero } from '../components/PageHero';
import { CtaBand, ProcessSteps } from '../components/Blocks';
import { Img } from '../components/ui';
import { AddonPriceList } from '../components/AddonPriceList';
import { usePageMeta } from '../hooks/usePageMeta';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { useReveal } from '../hooks/useReveal';
import { serviceImage } from '../config/site';
import { formatDuration } from '../lib/datetime';
import { cx, formatPrice } from '../lib/format';

export function ServicesPage() {
  usePageMeta({
    title: 'Våra tjänster – biltvätt och tillägg',
    description:
      'Biltvätt med valbara tillägg: borttagning av djurhår, keramiskt sprayvax, fläckborttagning, vattenavvisande vindruta, luktbehandling med mera. Se priser och boka online hos Crescor Bilvård.',
    path: '/tjanster',
  });
  const { config, status, live } = usePublicConfig();
  const ref = useReveal<HTMLElement>();
  const bookable = live && config.settings.booking_enabled;

  return (
    <SiteLayout>
      <PageHero
        eyebrow="Våra tjänster"
        title={
          <>
            Bilvård, <span className="text-metal">på riktigt.</span>
          </>
        }
        lead="En tjänst – anpassad efter din bil. Välj de tillägg du behöver när du bokar, så tar vi hand om resten."
        image="/images/service-helrekond.webp"
        crumbs={[{ label: 'Våra tjänster' }]}
      />

      <section ref={ref} aria-label="Tjänster" className="bg-ink-950 py-20 sm:py-28">
        <div className="container-lux space-y-6 sm:space-y-10">
          {status === 'loading' &&
            Array.from({ length: 3 }).map((_, i) => <div key={i} aria-hidden className="skeleton h-[380px]" />)}

          {status !== 'loading' &&
            config.services.map((s, i) => {
              const img = serviceImage(s.image_key);
              const price = formatPrice(s.price, s.price_type);
              const flip = i % 2 === 1;
              return (
                <article
                  key={s.id}
                  className="reveal group grid overflow-hidden border border-white/[0.07] bg-ink-900 transition-colors duration-500 hover:border-white/20 lg:grid-cols-2"
                >
                  <div className={cx('relative min-h-[260px] overflow-hidden sm:min-h-[340px]', flip && 'lg:order-2')}>
                    <Img
                      src={img.src}
                      alt={img.alt}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.6s] ease-[var(--ease-lux)] group-hover:scale-[1.04]"
                    />
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-900/80 via-transparent to-transparent lg:bg-none" />
                    {config.services.length > 1 && (
                      <span className="font-display absolute bottom-4 left-6 text-7xl leading-none font-semibold text-white/15 sm:text-8xl">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col justify-center p-7 sm:p-12">
                    <h2 className="font-display text-4xl leading-none font-semibold text-white sm:text-5xl">{s.name}</h2>
                    <p className="mt-5 max-w-lg text-base leading-relaxed text-silver-300">{s.description}</p>
                    {(s.duration_minutes > 0 || live) && (
                      <dl className="mt-8 grid max-w-md grid-cols-2 gap-px overflow-hidden border border-white/[0.07] bg-white/[0.07]">
                        <div className="bg-ink-900 p-4">
                          <dt className="eyebrow">Tid</dt>
                          <dd className="mt-1.5 flex items-center gap-1.5 text-sm text-white">
                            <Clock className="h-3.5 w-3.5 text-silver-500" aria-hidden />
                            {s.duration_minutes > 0 ? `ca ${formatDuration(s.duration_minutes)}` : 'Enligt överenskommelse'}
                          </dd>
                        </div>
                        <div className="bg-ink-900 p-4">
                          <dt className="eyebrow">Pris</dt>
                          <dd className="mt-1.5 text-sm text-white">{price ?? 'Enligt offert'}</dd>
                        </div>
                      </dl>
                    )}
                    <div className="mt-8 flex flex-wrap gap-3">
                      {bookable ? (
                        <Link to={`/boka?tjanst=${encodeURIComponent(s.slug)}`} className="btn btn-metal btn-sm">
                          Boka {s.name.toLowerCase()} <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                      ) : (
                        <Link to="/kontakt" className="btn btn-metal btn-sm">
                          Kontakta oss
                        </Link>
                      )}
                      <Link to={`/tjanster/${encodeURIComponent(s.slug)}`} className="btn btn-ghost btn-sm">
                        Läs mer <ArrowUpRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}

          {status !== 'loading' && config.addons.length > 0 && (
            <AddonPriceList addons={config.addons} titleId="tillagg-title" className="reveal" />
          )}
        </div>
      </section>

      <ProcessSteps />
      <CtaBand />
    </SiteLayout>
  );
}
