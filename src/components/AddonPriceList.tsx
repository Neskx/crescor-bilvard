import { Plus } from 'lucide-react';
import { formatAmount } from '../lib/format';
import type { Addon } from '../types';

/** Price list of the optional add-ons (tillägg). Renders nothing without add-ons. */
export function AddonPriceList({ addons, titleId, className }: { addons: Addon[]; titleId: string; className?: string }) {
  if (addons.length === 0) return null;
  return (
    <div className={`border border-white/[0.07] bg-ink-900 p-6 sm:p-8 ${className ?? ''}`}>
      <p className="eyebrow">Välj till</p>
      <h3 id={titleId} className="font-display mt-2 text-3xl font-semibold text-white sm:text-4xl">
        Tillägg
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-silver-400">Lägg till det din bil behöver när du bokar.</p>
      <ul aria-labelledby={titleId} className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07]">
        {addons.map((a) => (
          <li key={a.id} className="flex items-start gap-3 py-4">
            <Plus className="mt-1 h-3.5 w-3.5 shrink-0 text-silver-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-semibold text-white">{a.name}</span>
                <span className="shrink-0 text-sm font-semibold text-silver-200 tabular-nums">
                  <span className="sr-only">tillägg </span>+{formatAmount(a.price)}
                </span>
              </div>
              {a.description && <p className="mt-1 text-sm leading-relaxed text-silver-400">{a.description}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
