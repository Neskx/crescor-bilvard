import { forwardRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { cx } from '../../lib/format';

export const StepTitle = forwardRef<HTMLHeadingElement, { children: ReactNode; sub?: ReactNode }>(function StepTitle(
  { children, sub },
  ref,
) {
  return (
    <div className="mb-8">
      <h3 ref={ref} tabIndex={-1} className="font-display text-3xl font-semibold text-white outline-none sm:text-4xl">
        {children}
      </h3>
      {sub && <p className="mt-2 text-sm text-silver-400">{sub}</p>}
    </div>
  );
});

export function StepFooter({
  onBack,
  onNext,
  nextLabel = 'Fortsätt',
  nextDisabled,
  children,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="mt-10 flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-6 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? (
        <button type="button" onClick={onBack} className="btn btn-ghost">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Tillbaka
        </button>
      ) : (
        <span />
      )}
      {children}
      {onNext && (
        <button type="button" onClick={onNext} disabled={nextDisabled} className="btn btn-metal">
          {nextLabel} <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Large selectable card with radio semantics. */
export function OptionCard({
  selected,
  onSelect,
  title,
  children,
  meta,
  disabled,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  children?: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
  /** Optional minimalist icon shown before the title. */
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        'group relative flex w-full items-start gap-4 rounded-[2px] border p-5 text-left transition-all duration-300 sm:p-6',
        selected
          ? 'metal-ring border-transparent bg-white/[0.06]'
          : 'border-white/[0.09] bg-ink-900 hover:border-white/25 hover:bg-white/[0.03]',
        disabled && 'cursor-not-allowed opacity-50 hover:border-white/[0.09] hover:bg-ink-900',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected ? 'border-white bg-white text-ink-950' : 'border-silver-500',
        )}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2.5 text-base font-semibold text-white">
          {icon && (
            <span aria-hidden className="text-silver-300">
              {icon}
            </span>
          )}
          {title}
        </span>
        {children && <span className="mt-1.5 block text-sm leading-relaxed text-silver-400">{children}</span>}
        {meta && <span className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs tracking-wide text-silver-300">{meta}</span>}
      </span>
    </button>
  );
}
