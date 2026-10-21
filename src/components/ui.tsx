import { useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { cx } from '../lib/format';

/** Image with lazy loading and a graceful dark fallback if the file fails to load. */
export function Img({ className, alt, ...props }: ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !props.src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cx('bg-[radial-gradient(ellipse_at_30%_20%,#2a2a2a,#0e0e0e_70%)]', className)}
      />
    );
  }
  return <img loading="lazy" decoding="async" alt={alt} onError={() => setFailed(true)} className={className} {...props} />;
}

export function Spinner({ className, label = 'Laddar' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2 aria-hidden className={cx('animate-spin', className ?? 'h-5 w-5')} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

type AlertTone = 'error' | 'info' | 'success' | 'warning';

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
  live = true,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  live?: boolean;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  const colors: Record<AlertTone, string> = {
    error: 'border-[#ff8a80]/40 bg-[#ff8a80]/[0.06] text-[#ffd5d0]',
    warning: 'border-silver-400/40 bg-white/[0.04] text-silver-100',
    info: 'border-silver-500/40 bg-white/[0.03] text-silver-200',
    success: 'border-[#c8e6c9]/40 bg-[#c8e6c9]/[0.06] text-[#e3f2e4]',
  };
  return (
    <div
      role={live ? (tone === 'error' ? 'alert' : 'status') : undefined}
      className={cx('flex gap-3 border px-4 py-3.5 text-sm leading-relaxed', colors[tone], className)}
    >
      <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-white">{title}</p>}
        {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'left',
  light = false,
  id,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: 'left' | 'center';
  light?: boolean;
  id?: string;
}) {
  return (
    <div className={cx('reveal max-w-3xl', align === 'center' && 'mx-auto text-center')}>
      <p className={cx('eyebrow', light && '!text-silver-600')}>
        {eyebrow}
      </p>
      <h2
        id={id}
        className={cx(
          'font-display mt-5 text-[2.6rem] leading-[0.95] font-semibold sm:text-6xl lg:text-7xl',
          light ? 'text-ink-950' : 'text-white',
        )}
      >
        {title}
      </h2>
      {lead && (
        <p className={cx('mt-6 text-base leading-relaxed sm:text-lg', light ? 'text-ink-600' : 'text-silver-400')}>{lead}</p>
      )}
    </div>
  );
}

export function Field({
  id,
  label,
  error,
  hint,
  optional,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {optional && <span className="field-optional ml-2 font-normal tracking-normal normal-case">(valfritt)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for an input inside <Field>. */
export function fieldAria(id: string, error?: string, hint?: string) {
  return {
    id,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  };
}
