import { useState } from 'react';
import { BadgeCheck, Flag, MessageSquareQuote, Star } from 'lucide-react';
import { SectionHeading } from '../components/ui';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { useReveal } from '../hooks/useReveal';
import { reportReview } from '../services/api';
import { cx } from '../lib/format';
import type { PublicReview } from '../types';

const monthYear = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric', timeZone: 'Europe/Stockholm' }).format(new Date(iso)) : null;

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`Betyg ${rating} av 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={cx('h-4 w-4', i <= rating ? 'fill-silver-200 text-silver-200' : 'text-silver-600')} strokeWidth={1.5} />
      ))}
    </span>
  );
}

function ReviewCard({ review }: { review: PublicReview }) {
  const [reported, setReported] = useState(false);
  return (
    <li className="reveal flex w-[85vw] max-w-[420px] shrink-0 snap-start flex-col border border-white/[0.08] bg-ink-850 p-7 sm:w-auto sm:max-w-none">
      <div className="flex items-center justify-between gap-4">
        <Stars rating={review.rating} />
        {review.verified && (
          <span className="inline-flex items-center gap-1 text-[0.65rem] font-semibold tracking-[0.16em] text-silver-400 uppercase">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verifierad bokning
          </span>
        )}
      </div>
      <blockquote className="mt-5 flex-1 text-[0.95rem] leading-relaxed whitespace-pre-line text-silver-200">“{review.body}”</blockquote>
      <div className="mt-6 flex items-end justify-between gap-4 border-t border-white/[0.07] pt-4">
        <div>
          <p className="font-semibold text-white">{review.display_name}</p>
          <p className="text-xs text-silver-500">{[review.service_name, monthYear(review.published_at)].filter(Boolean).join(' · ')}</p>
        </div>
        <button
          type="button"
          disabled={reported}
          onClick={() => {
            setReported(true);
            void reportReview(review.id);
          }}
          className="inline-flex items-center gap-1 text-[0.7rem] text-silver-500 hover:text-white disabled:hover:text-silver-500"
          aria-label={reported ? 'Recensionen är rapporterad' : `Rapportera recensionen från ${review.display_name}`}
        >
          <Flag className="h-3 w-3" aria-hidden /> {reported ? 'Rapporterad' : 'Rapportera'}
        </button>
      </div>
    </li>
  );
}

/** Customer reviews — only reviews from real bookings, approved by the business. */
export function Reviews() {
  const { config, live } = usePublicConfig();
  const ref = useReveal<HTMLElement>();
  if (!live) return null;
  const { reviews } = config;

  return (
    <section ref={ref} id="recensioner" aria-labelledby="recensioner-title" className="relative bg-ink-900 py-24 sm:py-32">
      <div aria-hidden className="hairline absolute inset-x-0 top-0" />
      <div className="container-lux">
        <SectionHeading
          id="recensioner-title"
          eyebrow="Recensioner"
          title={
            <>
              Vad våra <span className="text-metal">kunder säger</span>
            </>
          }
          lead="Din upplevelse är viktig för oss. Ta del av vad våra kunder tycker om Crescor Bilvård."
        />

        {reviews.length === 0 ? (
          <div className="reveal mt-12 flex flex-col items-start gap-5 border border-dashed border-white/10 p-8 sm:flex-row sm:items-center">
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center border border-white/15">
              <MessageSquareQuote className="h-6 w-6 text-silver-300" strokeWidth={1.5} />
            </span>
            <div>
              <p className="font-display text-2xl font-semibold text-white">Våra första omdömen är på väg</p>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-silver-400">
                Efter ditt besök får du möjlighet att berätta hur du upplevde det. Vi publicerar endast recensioner från kunder som har
                bokat hos oss.
              </p>
            </div>
          </div>
        ) : (
          <ul
            aria-label="Kundrecensioner"
            className="no-scrollbar -mx-4 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3"
          >
            {reviews.slice(0, 9).map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
