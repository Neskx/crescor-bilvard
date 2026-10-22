import { Check } from 'lucide-react';
import type { StepId } from './draft';
import { cx } from '../lib/format';

export function Stepper({
  steps,
  current,
  maxReachable,
  onGo,
}: {
  steps: { id: StepId; label: string }[];
  current: StepId;
  maxReachable: number;
  onGo: (s: StepId) => void;
}) {
  const currentIndex = Math.max(0, steps.findIndex((s) => s.id === current));
  return (
    <nav aria-label="Bokningssteg" className="mb-10">
      {/* Mobile: compact progress */}
      <div className="sm:hidden">
        <p className="text-xs tracking-[0.2em] text-silver-400 uppercase">
          Steg {currentIndex + 1} av {steps.length} · <span className="text-white">{steps[currentIndex].label}</span>
        </p>
        <div className="mt-3 h-px w-full bg-white/10" aria-hidden>
          <div className="h-px bg-gradient-to-r from-silver-400 to-white transition-[width] duration-500" style={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      {/* Desktop: full stepper */}
      <ol className="hidden items-center sm:flex">
        {steps.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const reachable = i <= maxReachable && !active;
          return (
            <li key={s.id} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onGo(s.id)}
                aria-current={active ? 'step' : undefined}
                className={cx('group flex items-center gap-3 text-left', reachable && 'cursor-pointer')}
              >
                <span
                  className={cx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                    active && 'border-white bg-white text-ink-950',
                    done && 'border-silver-300 text-white group-hover:bg-white/10',
                    !active && !done && 'border-white/15 text-silver-500',
                  )}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <span className={cx('text-[0.7rem] font-semibold tracking-[0.2em] uppercase', active ? 'text-white' : done ? 'text-silver-300' : 'text-silver-500')}>
                  {s.label}
                  {done && <span className="sr-only"> (klart)</span>}
                </span>
              </button>
              {i < steps.length - 1 && <span aria-hidden className={cx('mx-4 h-px flex-1', i < currentIndex ? 'bg-silver-400' : 'bg-white/10')} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
