import { Img, SectionHeading } from '../components/ui';
import { useReveal } from '../hooks/useReveal';
import { usePublicConfig } from '../hooks/usePublicConfig';

/*
 * Copy for the "Om oss" section. Written without unverified claims (no years in
 * business, no certifications, no customer counts). The business can extend it
 * with real facts — e.g. who founded the company and when — in ABOUT_EXTRA.
 */
const ABOUT_EXTRA: string | null = null;

export function About() {
  const ref = useReveal<HTMLElement>();
  const { config } = usePublicConfig();
  const area = config.settings.service_area_text;

  return (
    <section ref={ref} id="om-oss" aria-labelledby="om-title" className="relative overflow-hidden bg-ink-900 py-24 sm:py-32">
      <div className="container-lux grid items-center gap-14 lg:grid-cols-12 lg:gap-20">
        <div className="reveal relative lg:col-span-5">
          <div className="relative aspect-[4/5] overflow-hidden border border-white/[0.07]">
            <Img src="/images/about.webp" alt="Svart SUV täckt av tvättskum i en tvätthall" className="h-full w-full object-cover" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-900/70 to-transparent" />
          </div>
        </div>

        <div className="lg:col-span-7">
          <SectionHeading
            id="om-title"
            eyebrow="Om Crescor Bilvård"
            title={
              <>
                Omsorg om bilen. <br />
                <span className="text-metal">Respekt för din tid.</span>
              </>
            }
          />
          <div className="reveal mt-8 max-w-2xl space-y-5 text-base leading-relaxed text-silver-300 sm:text-lg">
            <p>
              Crescor Bilvård bygger på en enkel idé: att bilvård ska utföras med samma precision och omsorg som bilen
              en gång byggdes med. Vi arbetar metodiskt, steg för steg, och lämnar inget åt slumpen.
            </p>
            <p>
              Vi vet att din tid är värdefull. Därför ska det vara lika enkelt att boka som det är att lämna över
              nycklarna – med tydlig information om vad som ingår och en tid som passar dig.
            </p>
            {ABOUT_EXTRA && <p>{ABOUT_EXTRA}</p>}
            {area && <p className="text-silver-400">Vi utgår från och arbetar i: {area}.</p>}
          </div>

          <dl className="reveal mt-12 grid max-w-2xl grid-cols-1 gap-px overflow-hidden border border-white/[0.07] bg-white/[0.07] sm:grid-cols-3">
            {[
              ['Metod', 'Steg för steg, utan genvägar'],
              ['Material', 'Produkter valda efter ytan'],
              ['Kommunikation', 'Tydliga besked från start'],
            ].map(([t, d]) => (
              <div key={t} className="bg-ink-900 p-6">
                <dt className="eyebrow">{t}</dt>
                <dd className="mt-2 text-sm text-white">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
