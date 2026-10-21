import type { RefObject } from 'react';
import { Check, Clock } from 'lucide-react';
import { OptionCard, StepFooter, StepTitle } from './common';
import { formatDuration } from '../../lib/datetime';
import { cx, formatAmount, formatPrice, formatTotal } from '../../lib/format';
import type { Addon, Service } from '../../types';

function AddonCard({ addon, checked, onToggle }: { addon: Addon; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cx(
        'flex w-full items-start gap-4 rounded-[2px] border p-4 text-left transition-all duration-300 sm:p-5',
        checked
          ? 'metal-ring border-transparent bg-white/[0.06]'
          : 'border-white/[0.09] bg-ink-900 hover:border-white/25 hover:bg-white/[0.03]',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border transition-colors',
          checked ? 'border-white bg-white text-ink-950' : 'border-silver-500',
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[0.95rem] font-semibold text-white">{addon.name}</span>
          <span className="shrink-0 text-sm font-semibold text-silver-200 tabular-nums">+{formatAmount(addon.price)}</span>
        </span>
        {addon.description && <span className="mt-1 block text-sm leading-relaxed text-silver-400">{addon.description}</span>}
      </span>
    </button>
  );
}

export function StepService({
  services,
  addons,
  selectedId,
  selectedAddonIds,
  onSelect,
  onToggleAddon,
  onNext,
  titleRef,
}: {
  services: Service[];
  addons: Addon[];
  selectedId: string | null;
  selectedAddonIds: string[];
  onSelect: (id: string) => void;
  onToggleAddon: (id: string) => void;
  onNext: () => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const single = services.length === 1;
  const service = services.find((s) => s.id === selectedId);
  const addonsTotal = addons.filter((a) => selectedAddonIds.includes(a.id)).reduce((sum, a) => sum + a.price, 0);
  // Only a priced service gives a meaningful grand total.
  const total = service && service.price_type !== 'on_request' ? formatTotal(service.price, service.price_type, addonsTotal) : null;

  return (
    <div>
      <StepTitle
        ref={titleRef}
        sub={
          addons.length
            ? 'Välj tjänst och lägg till de extra behandlingar du vill ha. Tilläggen är valfria.'
            : 'Välj den behandling du vill boka. Tid och eventuellt pris visas för varje tjänst.'
        }
      >
        {single ? 'Din tjänst' : 'Vilken tjänst vill du boka?'}
      </StepTitle>
      <div role="radiogroup" aria-label="Tjänster" className={cx('grid gap-3', !single && 'md:grid-cols-2')}>
        {services.map((s) => {
          const price = formatPrice(s.price, s.price_type);
          return (
            <OptionCard
              key={s.id}
              selected={selectedId === s.id}
              onSelect={() => onSelect(s.id)}
              title={s.name}
              meta={
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-silver-500" aria-hidden />
                    ca {formatDuration(s.duration_minutes)}
                  </span>
                  <span className="font-semibold text-white">{price ?? 'Pris enligt offert'}</span>
                </>
              }
            >
              {s.description}
            </OptionCard>
          );
        })}
      </div>

      {addons.length > 0 && (
        <div className="mt-10">
          <h4 id="addons-title" className="font-display text-2xl font-semibold text-white">
            Tillägg <span className="text-base font-normal text-silver-400">(valfritt)</span>
          </h4>
          <div role="group" aria-labelledby="addons-title" className="mt-4 grid gap-3 md:grid-cols-2">
            {addons.map((a) => (
              <AddonCard key={a.id} addon={a} checked={selectedAddonIds.includes(a.id)} onToggle={() => onToggleAddon(a.id)} />
            ))}
          </div>
          <div aria-live="polite" className="mt-5 flex flex-wrap items-baseline justify-between gap-2 border border-white/[0.09] bg-ink-900 px-5 py-4">
            <span className="eyebrow">Tillägg totalt</span>
            <span className="font-display text-2xl font-semibold text-white tabular-nums">{formatAmount(addonsTotal)}</span>
            {total && addonsTotal > 0 && <span className="w-full text-sm text-silver-400">Totalt: {total}</span>}
          </div>
        </div>
      )}

      <StepFooter onNext={onNext} nextDisabled={!selectedId} />
    </div>
  );
}
