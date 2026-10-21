import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { SITE } from '../config/site';

export interface Crumb {
  label: string;
  to?: string;
}

/** Compact cinematic header for subpages, with breadcrumbs (+ structured data). */
export function PageHero({
  eyebrow,
  title,
  lead,
  image,
  crumbs,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  image: string;
  crumbs: Crumb[];
  children?: ReactNode;
}) {
  const all: Crumb[] = [{ label: 'Hem', to: '/' }, ...crumbs];
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.to ? { item: `${SITE.url}${c.to}` } : {}),
    })),
  };

  return (
    <section data-hero className="grain relative isolate overflow-hidden bg-ink-950 pt-36 pb-16 sm:pt-44 sm:pb-24">
      <div aria-hidden className="absolute inset-0 -z-10">
        <img
          src={image}
          alt=""
          decoding="async"
          fetchPriority="high"
          onError={(e) => (e.currentTarget.style.display = 'none')}
          className="h-full w-full animate-[hero-zoom_14s_var(--ease-lux)_both] object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-ink-950/40" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/90 via-ink-950/50 to-transparent" />
      </div>

      <div className="container-lux">
        <nav aria-label="Brödsmulor" className="animate-fade-up">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-silver-400">
            {all.map((c, i) => (
              <li key={c.label} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight aria-hidden className="h-3 w-3 text-silver-600" />}
                {c.to && i < all.length - 1 ? (
                  <Link to={c.to} className="hover:text-white">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-silver-200">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <p className="eyebrow animate-fade-up mt-10 !text-silver-300 [animation-delay:80ms]">{eyebrow}</p>
        <h1 className="font-display animate-fade-up mt-5 max-w-4xl text-[3rem] leading-[0.9] font-semibold text-white [animation-delay:160ms] sm:text-7xl lg:text-8xl">
          {title}
        </h1>
        {lead && (
          <p className="animate-fade-up mt-7 max-w-2xl text-base leading-relaxed text-silver-200 [animation-delay:240ms] sm:text-lg">{lead}</p>
        )}
        {children && <div className="animate-fade-up mt-9 [animation-delay:320ms]">{children}</div>}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </section>
  );
}
