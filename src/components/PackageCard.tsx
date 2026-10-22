import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Clock } from 'lucide-react';
import { Img } from './ui';
import { serviceImage } from '../config/site';
import { formatDuration } from '../lib/datetime';
import { cx, formatPrice } from '../lib/format';
import { requestServiceBooking } from '../booking/bookingEvents';
import type { Service } from '../types';

/**
 * One package in the three-column comparison. The highlighted package gets a
 * metallic outline — no popularity claims are made.
 */
export function PackageCard({ service, bookable, headingLevel = 'h3' }: { service: Service; bookable: boolean; headingLevel?: 'h2' | 'h3' }) {
  const navigate = useNavigate();
  const img = serviceImage(service.image_key);
  const price = formatPrice(service.price, service.price_type);
  const real = !service.id.startsWith('fallback-');
  const duration = service.duration_text || (service.duration_minutes > 0 ? formatDuration(service.duration_minutes) : null);
  const H = headingLevel;
  const features = service.features ?? [];

  return (
    <article
      className={cx(
        'reveal group relative flex h-full flex-col overflow-hidden transition-[transform,border-color] duration-700 ease-[var(--ease-lux)] hover:-translate-y-1',
        service.is_highlighted
          ? 'metal-ring bg-gradient-to-b from-ink-800 to-ink-850 shadow-[0_40px_90px_-50px_rgba(255,255,255,0.35)]'
          : 'border border-white/[0.08] bg-ink-850 hover:border-white/20',
      )}
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <Img
          src={img.src}
          alt={img.alt}
          className="h-full w-full object-cover opacity-80 transition-transform duration-[1.4s] ease-[var(--ease-lux)] group-hover:scale-[1.04]"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/30 to-transparent" />
        {service.tagline && (
          <span
            className={cx(
              'absolute top-4 left-4 border px-2.5 py-1 text-[0.62rem] font-semibold tracking-[0.24em] uppercase backdrop-blur',
              service.is_highlighted ? 'border-white/60 bg-white/90 text-ink-950' : 'border-white/20 bg-ink-950/60 text-silver-200',
            )}
          >
            {service.tagline}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-6 pt-2 pb-7 sm:px-7">
        <H className="font-display text-4xl leading-none font-semibold text-white">
          {real ? (
            <Link to={`/tjanster/${encodeURIComponent(service.slug)}`} className="hover:underline hover:decoration-1 hover:underline-offset-4">
              {service.name}
            </Link>
          ) : (
            service.name
          )}
        </H>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-y border-white/[0.07] py-4">
          <p className={cx('font-display text-4xl leading-none font-semibold tabular-nums', service.is_highlighted ? 'text-metal' : 'text-white')}>
            {price ?? 'Pris enligt offert'}
          </p>
          {duration && (
            <p className="inline-flex items-center gap-1.5 text-xs tracking-wide text-silver-300">
              <Clock className="h-3.5 w-3.5 text-silver-500" aria-hidden />
              <span>
                <span className="sr-only">Beräknad tid: </span>ca {duration}
              </span>
            </p>
          )}
        </div>

        <p className="mt-5 text-sm leading-relaxed text-silver-400">{service.description}</p>

        {features.length > 0 && (
          <ul className="mt-5 space-y-2.5 text-sm" aria-label={`Ingår i ${service.name}`}>
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-silver-200">
                <span aria-hidden className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-silver-400/60">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto pt-7">
          {bookable ? (
            <button
              type="button"
              onClick={() => {
                if (!requestServiceBooking(service.id)) navigate(`/boka?tjanst=${encodeURIComponent(service.slug)}`);
              }}
              className={cx('btn w-full', service.is_highlighted ? 'btn-metal' : 'btn-ghost')}
            >
              Boka denna tjänst<span className="sr-only">: {service.name}</span> <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <Link to="/kontakt" className="btn btn-ghost w-full">
              Kontakta oss för bokning
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
