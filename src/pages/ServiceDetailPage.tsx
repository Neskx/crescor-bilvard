import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Clock, MapPin, Tag, Truck } from 'lucide-react';
import { SiteLayout } from '../components/SiteLayout';
import { PageHero } from '../components/PageHero';
import { CtaBand, ProcessSteps } from '../components/Blocks';
import { Img, Spinner } from '../components/ui';
import { AddonPriceList } from '../components/AddonPriceList';
import { usePageMeta } from '../hooks/usePageMeta';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { useReveal } from '../hooks/useReveal';
import { serviceImage } from '../config/site';
import { formatDuration } from '../lib/datetime';
import { formatPrice } from '../lib/format';
import { NotFoundContent } from './NotFoundPage';

export function ServiceDetailPage() {
  const { slug = '' } = useParams();
  const { config, status, live } = usePublicConfig();
  const ref = useReveal<HTMLElement>();
  const service = config.services.find((s) => s.slug === slug);
  const s = config.settings;

  usePageMeta({
    title: service ? `${service.name} – boka online` : 'Tjänsten hittades inte',
    description: service
      ? `${service.description} Boka ${service.name.toLowerCase()} online hos Crescor Bilvård.`
      : 'Tjänsten kunde inte hittas.',
    path: `/tjanster/${slug}`,
    noindex: !service && status !== 'loading',
  });

  if (status === 'loading') {
    return (
      <SiteLayout>
        <div className="flex min-h-[70vh] items-center justify-center bg-ink-950 pt-24 text-silver-400">
          <Spinner label="Laddar tjänsten" />
        </div>
      </SiteLayout>
    );
  }

  if (!service) {
    return (
      <SiteLayout>
        <NotFoundContent title="Tjänsten finns inte." text="Den här tjänsten erbjuds inte längre eller så är länken felaktig." />
      </SiteLayout>
    );
  }

  const img = serviceImage(service.image_key);
  const price = formatPrice(service.price, service.price_type);
  const bookable = live && s.booking_enabled;
  const others = config.services.filter((x) => x.id !== service.id).slice(0, 3);

  return (
    <SiteLayout>
      <PageHero
        eyebrow="Tjänst"
        title={service.name}
        lead={service.description}
        image={img.src}
        crumbs={[{ label: 'Våra tjänster', to: '/tjanster' }, { label: service.name }]}
      >
        <Link to={bookable ? `/boka?tjanst=${encodeURIComponent(service.slug)}` : '/kontakt'} className="btn btn-metal">
          {bookable ? 'Boka tid' : 'Kontakta oss'} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </PageHero>

      <section ref={ref} aria-label="Fakta om tjänsten" className="bg-ink-950 py-20 sm:py-24">
        <div className="container-lux grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="reveal relative aspect-[4/3] overflow-hidden border border-white/[0.07] lg:col-span-7">
            <Img src={img.src} alt={img.alt} className="h-full w-full object-cover" />
          </div>
          <div className="reveal lg:col-span-5">
            <h2 className="font-display text-4xl font-semibold text-white">Bra att veta</h2>
            <dl className="mt-8 divide-y divide-white/[0.07] border-y border-white/[0.07]">
              <div className="py-5">
                <dt className="eyebrow flex items-center gap-3">
                  <Clock className="h-4 w-4 text-silver-400" strokeWidth={1.5} aria-hidden /> Beräknad tid
                </dt>
                <dd className="mt-2 pl-7 text-white">ca {formatDuration(service.duration_minutes)}</dd>
              </div>
              <div className="py-5">
                <dt className="eyebrow flex items-center gap-3">
                  <Tag className="h-4 w-4 text-silver-400" strokeWidth={1.5} aria-hidden /> Pris
                </dt>
                <dd className="mt-2 pl-7 text-white">{price ?? 'Enligt offert – vi ger besked utifrån bilens skick.'}</dd>
              </div>
              {(s.workshop_available || s.mobile_available) && (
                <div className="py-5">
                  <dt className="eyebrow flex items-center gap-3">
                    {s.mobile_available ? (
                      <Truck className="h-4 w-4 text-silver-400" strokeWidth={1.5} aria-hidden />
                    ) : (
                      <MapPin className="h-4 w-4 text-silver-400" strokeWidth={1.5} aria-hidden />
                    )}
                    Plats
                  </dt>
                  <dd className="mt-2 space-y-1 pl-7 text-white">
                    {s.workshop_available && <p>Hos oss{s.company_address ? ` – ${s.company_address}` : ''}</p>}
                    {s.mobile_available && <p>På din adress{s.service_area_text ? ` (${s.service_area_text})` : ''}</p>}
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-6 text-sm leading-relaxed text-silver-400">
              Tiden är en uppskattning och kan variera med bilens storlek och skick. Berätta gärna om särskilda önskemål när du
              bokar.
            </p>
            <Link
              to={bookable ? `/boka?tjanst=${encodeURIComponent(service.slug)}` : '/kontakt'}
              className="btn btn-metal mt-8 w-full sm:w-auto"
            >
              {bookable ? `Boka ${service.name.toLowerCase()}` : 'Kontakta oss'} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {config.addons.length > 0 && (
        <section aria-label="Tillägg" className="bg-ink-950 pb-20 sm:pb-24">
          <div className="container-lux">
            <AddonPriceList addons={config.addons} titleId="tillagg-title" />
          </div>
        </section>
      )}

      <ProcessSteps />

      {others.length > 0 && (
        <section aria-labelledby="fler-title" className="bg-ink-950 py-24">
          <div className="container-lux">
            <h2 id="fler-title" className="font-display text-4xl font-semibold text-white sm:text-5xl">
              Fler tjänster
            </h2>
            <ul className="mt-10 grid gap-5 md:grid-cols-3">
              {others.map((o) => {
                const oi = serviceImage(o.image_key);
                return (
                  <li key={o.id}>
                    <Link
                      to={`/tjanster/${encodeURIComponent(o.slug)}`}
                      className="group block overflow-hidden border border-white/[0.07] bg-ink-900 transition-colors hover:border-white/25"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden">
                        <Img src={oi.src} alt={oi.alt} className="h-full w-full object-cover transition-transform duration-[1.2s] group-hover:scale-105" />
                      </div>
                      <div className="flex items-center justify-between p-5">
                        <span className="font-display text-2xl font-semibold text-white">{o.name}</span>
                        <ArrowUpRight className="h-5 w-5 text-silver-400 transition-colors group-hover:text-white" aria-hidden />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      <CtaBand />
    </SiteLayout>
  );
}
