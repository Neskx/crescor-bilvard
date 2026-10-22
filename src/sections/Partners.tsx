import { useState, type CSSProperties } from 'react';
import { SectionHeading } from '../components/ui';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { useReveal } from '../hooks/useReveal';
import { cx } from '../lib/format';
import type { Partner } from '../types';

const TILE_WIDTH = 264; // tile + gap, px — used to size the loop
const MIN_GROUP_WIDTH = 1600; // each half of the strip must be wider than a large screen

/**
 * One logo in a translucent tile. Logos are never stretched (object-contain) or
 * recoloured; the tile tone is chosen per logo so each stays legible. Without a
 * logo — or if it fails to load — the partner's name is shown instead.
 * Clones (repeats that keep the strip seamless) are hidden from assistive tech.
 */
function PartnerTile({ partner, clone }: { partner: Partner; clone: boolean }) {
  const [failed, setFailed] = useState(false);
  const light = partner.logo_background === 'light';
  const showLogo = partner.logo_url && !failed;

  const inner = (
    <div
      className={cx(
        'group/tile relative flex h-24 w-[232px] items-center justify-center overflow-hidden rounded-[2px] border px-7 py-5 backdrop-blur-sm transition-[background-color,border-color,transform] duration-500 ease-[var(--ease-lux)] hover:-translate-y-0.5 sm:h-28 sm:w-[248px]',
        light
          ? 'border-white/40 bg-gradient-to-br from-white/90 via-silver-50/80 to-silver-300/70 shadow-[0_18px_40px_-28px_rgba(255,255,255,0.5)] hover:from-white hover:via-white/95 hover:to-silver-200/90'
          : 'border-white/[0.12] bg-black/70 hover:border-white/25 hover:bg-black/85',
      )}
    >
      {/* metallic top edge */}
      <span aria-hidden className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-silver-300/70 to-transparent" />
      {showLogo ? (
        <img
          src={partner.logo_url!}
          alt={clone ? '' : partner.name}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="max-h-full max-w-full object-contain opacity-80 transition-opacity duration-500 group-hover/tile:opacity-100"
        />
      ) : (
        <span className={cx('font-display text-center text-2xl leading-tight font-semibold tracking-wide uppercase', light ? 'text-ink-800' : 'text-silver-200')}>
          {partner.name}
        </span>
      )}
    </div>
  );

  return (
    <li className={cx('shrink-0', clone && 'marquee-clone')} aria-hidden={clone || undefined}>
      {partner.website_url ? (
        <a
          href={partner.website_url}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={clone ? -1 : undefined}
          className="block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-silver-200"
        >
          {inner}
          {!clone && <span className="sr-only"> – webbplats (öppnas i ny flik)</span>}
        </a>
      ) : (
        inner
      )}
    </li>
  );
}

export function Partners() {
  const { config, live } = usePublicConfig();
  const ref = useReveal<HTMLElement>();
  if (!live || config.partners.length === 0) return null;

  const partners = config.partners;
  // Repeat the list so one half of the strip always overflows the viewport.
  const reps = Math.max(1, Math.ceil(MIN_GROUP_WIDTH / (partners.length * TILE_WIDTH)));
  const group = Array.from({ length: reps }, () => partners).flat();
  const style = { '--marquee-duration': `${group.length * 4.5}s` } as CSSProperties;

  return (
    <section ref={ref} id="samarbetspartners" aria-labelledby="partners-title" className="relative overflow-hidden bg-ink-950 py-24 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-[360px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.05),transparent)]"
      />
      <div className="container-lux relative">
        <SectionHeading
          id="partners-title"
          eyebrow="Samarbeten"
          align="center"
          title={<span className="text-metal">Våra samarbetspartners</span>}
          lead="Vi värdesätter starka samarbeten och långsiktiga relationer med andra verksamheter."
        />
      </div>

      <div className="reveal marquee relative mt-14" style={style}>
        <div className="marquee-track flex w-max">
          <ul aria-label="Samarbetspartners" className="flex shrink-0 gap-4 pr-4">
            {group.map((p, i) => (
              <PartnerTile key={`${p.id}-${i}`} partner={p} clone={i >= partners.length} />
            ))}
          </ul>
          {/* Identical second half for a seamless loop. */}
          <ul aria-hidden className="marquee-clone flex shrink-0 gap-4 pr-4">
            {group.map((p, i) => (
              <PartnerTile key={`clone-${p.id}-${i}`} partner={p} clone />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
