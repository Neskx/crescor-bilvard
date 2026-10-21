import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Clock } from 'lucide-react';
import { Img, SectionHeading } from '../components/ui';
import { AddonPriceList } from '../components/AddonPriceList';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { useReveal } from '../hooks/useReveal';
import { serviceImage } from '../config/site';
import { formatDuration } from '../lib/datetime';
import { formatPrice } from '../lib/format';
import { requestServiceBooking } from '../booking/bookingEvents';
import type { Service } from '../types';

function ServiceCard({ service, index, bookable, numbered }: { service: Service; index: number; bookable: boolean; numbered: boolean }) {
  const img = serviceImage(service.image_key);
  const price = formatPrice(service.price, service.price_type);
  const navigate = useNavigate();
  const real = !service.id.startsWith('fallback-');
  return (
    <article className="reveal group relative flex h-full w-full flex-col overflow-hidden border border-white/[0.07] bg-ink-850 transition-colors duration-500 hover:border-white/20">
      <div className="relative aspect-[16/10] overflow-hidden">
        <Img
          src={img.src}
          alt={img.alt}
          className="h-full w-full object-cover transition-transform duration-[1.4s] ease-[var(--ease-lux)] group-hover:scale-[1.04]"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/10 to-transparent" />
        {/* light sweep */}
        <div
          aria-hidden
          className="absolute inset-0 -translate-x-full bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.12)_50%,transparent_60%)] transition-transform duration-[1.2s] group-hover:translate-x-full"
        />
        {numbered && (
          <span className="font-display absolute top-4 left-5 text-sm font-semibold tracking-[0.2em] text-silver-300">
            {String(index + 1).padStart(2, '0')}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-6 pt-1 pb-6">
        <h3 className="font-display text-4xl font-semibold text-white">
          {real ? (
            <Link to={`/tjanster/${encodeURIComponent(service.slug)}`} className="hover:underline hover:decoration-1 hover:underline-offset-4">
              {service.name}
            </Link>
          ) : (
            service.name
          )}
        </h3>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-silver-400">{service.description}</p>
        {(price || service.duration_minutes > 0) && (
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs tracking-wide text-silver-300">
            {service.duration_minutes > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-silver-500" aria-hidden />
                ca {formatDuration(service.duration_minutes)}
              </span>
            )}
            {price && <span className="font-semibold text-white">{price}</span>}
          </div>
        )}
        <div className="hairline mt-5 mb-4 opacity-60" />
        {bookable ? (
          <button
            type="button"
            onClick={() => {
              if (!requestServiceBooking(service.id)) navigate(`/boka?tjanst=${encodeURIComponent(service.slug)}`);
            }}
            className="inline-flex items-center justify-between text-left text-xs font-semibold tracking-[0.2em] text-white uppercase"
          >
            <span>
              Boka tjänsten<span className="sr-only">: {service.name}</span>
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 transition-all duration-500 group-hover:border-white group-hover:bg-white group-hover:text-ink-950">
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </span>
          </button>
        ) : (
          <Link to="/kontakt" className="text-xs font-semibold tracking-[0.2em] text-silver-300 uppercase hover:text-white">
            Kontakta oss för bokning
          </Link>
        )}
      </div>
    </article>
  );
}

export function Services() {
  const { config, live, status } = usePublicConfig();
  const ref = useReveal<HTMLElement>();
  const bookable = live && config.settings.booking_enabled;

  return (
    <section ref={ref} id="tjanster" aria-labelledby="tjanster-title" className="relative bg-ink-950 py-24 sm:py-32">
      <div className="container-lux">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="tjanster-title"
            eyebrow="Våra tjänster"
            title={
              <>
                Bilvård efter <br />
                <span className="text-metal">dina behov.</span>
              </>
            }
          />
          <p className="reveal max-w-md text-base leading-relaxed text-silver-400">
            Välj vår tjänst och anpassa den med de tillägg din bil behöver – från djurhår och fläckar till keramiskt
            sprayvax och en vattenavvisande vindruta.
          </p>
        </div>

        {status === 'loading' ? (
          <div className="mt-14 grid gap-5 lg:grid-cols-12" aria-hidden>
            <div className="skeleton h-[520px] lg:col-span-7" />
            <div className="skeleton h-[520px] lg:col-span-5" />
          </div>
        ) : config.services.length === 0 ? (
          <p className="mt-14 text-silver-400">Tjänsteutbudet uppdateras. Kontakta oss gärna för mer information.</p>
        ) : (
          <div className="mt-14 grid items-start gap-5 lg:grid-cols-12">
            <div className="grid gap-5 lg:col-span-7">
              {config.services.map((s, i) => (
                <ServiceCard key={s.id} service={s} index={i} bookable={bookable} numbered={config.services.length > 1} />
              ))}
            </div>
            <AddonPriceList addons={config.addons} titleId="tillagg-title" className="reveal lg:col-span-5" />
          </div>
        )}
        <div className="mt-10 flex justify-center">
          <Link to="/tjanster" className="btn btn-ghost">
            Tjänst och tillägg i detalj <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
