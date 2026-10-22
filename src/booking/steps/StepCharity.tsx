import type { RefObject } from 'react';
import { ExternalLink, HeartHandshake } from 'lucide-react';
import { OptionCard, StepFooter, StepTitle } from './common';
import type { CharityChoice } from '../draft';
import type { Charity } from '../../types';

/** Shared wording: a preference, never a promise of an amount. */
export const CHARITY_POLICY_TEXT =
  'Ditt val kostar ingenting extra. Crescor Bilvård bestämmer själv hur stor del av vinsten som skänks – det finns ingen fast procentsats eller garanterad summa per bokning. Kundernas val vägleder hur vi fördelar våra gåvor.';

export function StepCharity({
  charities,
  value,
  onChange,
  onBack,
  onNext,
  titleRef,
}: {
  charities: Charity[];
  value: CharityChoice;
  onChange: (v: CharityChoice) => void;
  onBack: () => void;
  onNext: () => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div>
      <StepTitle ref={titleRef} sub="Välj vilket av våra välgörande ändamål du vill stödja genom din bokning.">
        Välj ett ändamål att stödja
      </StepTitle>

      <div role="radiogroup" aria-label="Ändamål" className="grid gap-3 md:grid-cols-2">
        {charities.map((c) => (
          <OptionCard
            key={c.id}
            selected={value === c.id}
            onSelect={() => onChange(c.id)}
            title={c.name}
            icon={
              c.logo_url ? (
                <img src={c.logo_url} alt="" className="h-6 w-auto max-w-[72px] rounded-[2px] bg-white object-contain p-0.5" loading="lazy" />
              ) : (
                <HeartHandshake className="h-[18px] w-[18px]" strokeWidth={1.5} />
              )
            }
            meta={
              c.website_url ? (
                <span className="inline-flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5 text-silver-500" aria-hidden />
                  {c.website_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                </span>
              ) : undefined
            }
          >
            {c.description}
          </OptionCard>
        ))}
        <OptionCard selected={value === 'none'} onSelect={() => onChange('none')} title="Inget särskilt val">
          Du kan boka utan att välja ett ändamål.
        </OptionCard>
      </div>

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-silver-400">{CHARITY_POLICY_TEXT}</p>

      <StepFooter onBack={onBack} onNext={onNext} nextDisabled={value === null} />
    </div>
  );
}
