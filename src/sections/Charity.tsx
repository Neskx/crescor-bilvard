import { ArrowUpRight, HeartHandshake } from 'lucide-react';
import { SectionHeading } from '../components/ui';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { useReveal } from '../hooks/useReveal';
import { formatAmount } from '../lib/format';
import { CHARITY_POLICY_TEXT } from '../booking/steps/StepCharity';

const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/**
 * The charity initiative. Shows only verified information: the causes the
 * business has activated, and donation totals that are marked as completed.
 * No percentages, estimates or impact figures.
 */
export function Charity() {
  const { config, live } = usePublicConfig();
  const ref = useReveal<HTMLElement>();
  if (!live || !config.settings.charity_enabled) return null;
  const { charities, donations } = config;

  return (
    <section ref={ref} id="valgorenhet" aria-labelledby="valgorenhet-title" className="relative overflow-hidden bg-ink-900 py-24 sm:py-32">
      <div aria-hidden className="hairline absolute inset-x-0 top-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.06),transparent)]"
      />
      <div className="container-lux relative grid gap-14 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionHeading
            id="valgorenhet-title"
            eyebrow="Välgörenhet"
            title={
              <>
                Renare bil. <br />
                <span className="text-metal">Större omtanke.</span>
              </>
            }
            lead="På Crescor Bilvård vill vi göra skillnad även utanför bilvården. Därför väljer vi att stödja välgörande ändamål med en del av vår vinst. När du bokar hos oss får du möjlighet att välja vilket ändamål du vill att vi ska stödja."
          />
          <p className="reveal mt-6 max-w-md text-sm leading-relaxed text-silver-500">{CHARITY_POLICY_TEXT}</p>
        </div>

        <div className="lg:col-span-7">
          {charities.length > 0 && (
            <>
              <p className="eyebrow reveal">Ändamål du kan välja</p>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {charities.map((c) => (
                  <li key={c.id} className="reveal flex flex-col border border-white/[0.08] bg-ink-850 p-6 transition-colors duration-500 hover:border-white/20">
                    <div className="flex items-center gap-3">
                      {c.logo_url ? (
                        <img src={c.logo_url} alt="" loading="lazy" className="h-9 w-auto max-w-[96px] rounded-[2px] bg-white object-contain p-1" />
                      ) : (
                        <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15">
                          <HeartHandshake className="h-4 w-4 text-silver-300" strokeWidth={1.5} />
                        </span>
                      )}
                      <h3 className="font-display text-2xl leading-tight font-semibold text-white">{c.name}</h3>
                    </div>
                    {c.description && <p className="mt-3 flex-1 text-sm leading-relaxed text-silver-400">{c.description}</p>}
                    {c.website_url && (
                      <a
                        href={c.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center gap-1.5 self-start text-xs font-semibold tracking-[0.14em] text-silver-300 uppercase hover:text-white"
                      >
                        {host(c.website_url)} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                        <span className="sr-only">(öppnas i ny flik)</span>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {donations.length > 0 && (
            <div className="reveal mt-8 border border-white/[0.08] bg-ink-950/60 p-6">
              <p className="eyebrow">Genomförda gåvor</p>
              <ul className="mt-4 divide-y divide-white/[0.07]">
                {donations.map((d) => (
                  <li key={d.charity_name} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                    <span className="text-silver-200">{d.charity_name}</span>
                    <span className="font-semibold text-white tabular-nums">{formatAmount(d.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-silver-500">Visar endast gåvor som har betalats ut.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
