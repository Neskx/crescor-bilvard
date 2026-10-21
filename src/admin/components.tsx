import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cx } from '../lib/format';
import type { AppointmentStatus } from '../types';

// ---- Toasts --------------------------------------------------------------------

type Toast = { id: number; tone: 'success' | 'error' | 'info'; text: string };
const ToastCtx = createContext<(tone: Toast['tone'], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 9000 : 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed right-4 bottom-4 z-[80] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'flex items-start gap-3 border px-4 py-3 text-sm shadow-2xl backdrop-blur',
              t.tone === 'error' ? 'border-[#ff8a80]/40 bg-[#2a1413]/95 text-[#ffd5d0]' : 'border-white/15 bg-ink-800/95 text-white',
            )}
          >
            {t.tone === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
            <p className="flex-1">{t.text}</p>
            <button type="button" aria-label="Stäng" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---- Confirm dialog --------------------------------------------------------------

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});
  const ref = useRef<HTMLDialogElement>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (opts && ref.current && !ref.current.open) ref.current.showModal();
  }, [opts]);

  const close = (v: boolean) => {
    resolver.current(v);
    ref.current?.close();
    setOpts(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <dialog
        ref={ref}
        onCancel={(e) => {
          e.preventDefault();
          close(false);
        }}
        className="m-auto w-[min(460px,calc(100vw-2rem))] border border-white/15 bg-ink-850 p-0 text-white backdrop:bg-black/70"
      >
        {opts && (
          <div className="p-6">
            <h2 className="font-display text-2xl font-semibold">{opts.title}</h2>
            {opts.body && <div className="mt-3 text-sm leading-relaxed text-silver-300">{opts.body}</div>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => close(false)} autoFocus>
                Avbryt
              </button>
              <button
                type="button"
                className={cx('btn btn-sm', opts.danger ? 'border border-[#ff8a80]/60 bg-[#ff8a80]/15 text-[#ffd5d0] hover:bg-[#ff8a80]/25' : 'btn-metal')}
                onClick={() => close(true)}
              >
                {opts.confirmLabel ?? 'Bekräfta'}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

// ---- Small pieces -------------------------------------------------------------------

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: 'Väntar på bekräftelse',
  confirmed: 'Bekräftad',
  cancelled: 'Avbokad',
  completed: 'Utförd',
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const styles: Record<AppointmentStatus, string> = {
    pending: 'border-amber-200/50 bg-amber-200/10 text-amber-100',
    confirmed: 'border-white/40 bg-white/10 text-white',
    cancelled: 'border-white/10 bg-transparent text-silver-500 line-through',
    completed: 'border-emerald-200/40 bg-emerald-200/10 text-emerald-100',
  };
  return (
    <span className={cx('inline-flex items-center border px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide whitespace-nowrap', styles[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-4xl font-semibold text-white">{title}</h1>
        {sub && <p className="mt-1 text-sm text-silver-400">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed border-white/10 px-6 py-14 text-center">
      <p className="font-display text-2xl font-semibold text-white">{title}</p>
      {children && <div className="mt-2 text-sm text-silver-400">{children}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 border-b border-white/[0.06] py-4">
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        {description && <span className="mt-1 block text-xs leading-relaxed text-silver-400">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full border border-white/20 bg-ink-700 transition-colors peer-checked:bg-silver-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-silver-200" />
        <span className="absolute top-1 left-1 h-4 w-4 rounded-full bg-silver-400 transition-transform peer-checked:translate-x-5 peer-checked:bg-ink-950" />
      </span>
    </label>
  );
}
