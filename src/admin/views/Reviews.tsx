import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Check, EyeOff, Flag, RotateCcw, Star, Trash2, X } from 'lucide-react';
import { adminMessage } from '../adminApi';
import { deleteReview, listReviews, updateReview } from '../adminApiPhase2';
import { EmptyState, PageHeader, useConfirm, useToast } from '../components';
import { Alert, Spinner } from '../../components/ui';
import { DEFAULT_TZ, formatDateTimeShort } from '../../lib/datetime';
import { cx } from '../../lib/format';
import type { AdminReview, ReviewStatus } from '../../types';

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: 'Väntar på granskning',
  approved: 'Publicerad',
  rejected: 'Avvisad',
  hidden: 'Dold',
};

type Tab = 'pending' | 'approved' | 'reported' | 'other';
const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'Att granska' },
  { id: 'approved', label: 'Publicerade' },
  { id: 'reported', label: 'Rapporterade' },
  { id: 'other', label: 'Avvisade & dolda' },
];

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`Betyg ${rating} av 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={cx('h-3.5 w-3.5', i <= rating ? 'fill-silver-200 text-silver-200' : 'text-silver-600')} strokeWidth={1.5} />
      ))}
    </span>
  );
}

export function ReviewsView({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<AdminReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pending');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listReviews()
      .then(setRows)
      .catch((e) => setError(adminMessage(e)));
  }, []);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const r = rows ?? [];
    return {
      pending: r.filter((x) => x.status === 'pending').length,
      approved: r.filter((x) => x.status === 'approved').length,
      reported: r.filter((x) => x.reported_at).length,
      other: r.filter((x) => x.status === 'rejected' || x.status === 'hidden').length,
    };
  }, [rows]);

  const visible = (rows ?? []).filter((r) =>
    tab === 'reported' ? Boolean(r.reported_at) : tab === 'other' ? r.status === 'rejected' || r.status === 'hidden' : r.status === tab,
  );
  const published = (rows ?? []).filter((r) => r.status === 'approved');
  const average = published.length ? published.reduce((s, r) => s + r.rating, 0) / published.length : null;

  async function act(r: AdminReview, patch: Parameters<typeof updateReview>[1], message: string) {
    setBusy(r.id);
    try {
      await updateReview(r.id, patch);
      toast('success', message);
      load();
      onChanged?.();
    } catch (e) {
      toast('error', adminMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(r: AdminReview) {
    const ok = await confirm({
      title: 'Ta bort recensionen permanent?',
      body: 'Recensionen raderas och kan inte återställas. Vill du bara sluta visa den räcker det att dölja den.',
      confirmLabel: 'Ta bort',
      danger: true,
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      await deleteReview(r.id);
      toast('success', 'Recensionen är borttagen.');
      load();
      onChanged?.();
    } catch (e) {
      toast('error', adminMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Recensioner"
        sub={
          <>
            Endast kunder med en utförd bokning kan lämna en recension (via en personlig länk från bokningen). Inget visas på
            webbplatsen förrän du publicerar det.
            {average !== null && (
              <span className="mt-1 block text-silver-300">
                {published.length} publicerade · snittbetyg {average.toFixed(1).replace('.', ',')} (endast internt)
              </span>
            )}
          </>
        }
      />

      <div role="tablist" aria-label="Filter" className="no-scrollbar mb-6 flex gap-1 overflow-x-auto border-b border-white/[0.07]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx('shrink-0 px-4 py-2.5 text-sm whitespace-nowrap', tab === t.id ? 'border-b-2 border-white text-white' : 'text-silver-400 hover:text-white')}
          >
            {t.label} {counts[t.id] > 0 && <span className="ml-1 text-xs text-silver-500">({counts[t.id]})</span>}
          </button>
        ))}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {rows === null && !error && <Spinner label="Laddar recensioner" />}
      {rows !== null && visible.length === 0 && (
        <EmptyState title="Inga recensioner här">
          {tab === 'pending' ? 'Skicka en recensionsinbjudan från en utförd bokning under Bokningar.' : null}
        </EmptyState>
      )}

      <ul className="space-y-3">
        {visible.map((r) => (
          <li key={r.id} className="border border-white/[0.07] bg-ink-900 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Stars rating={r.rating} />
                <span className="font-semibold">{r.display_name}</span>
                {r.verified && (
                  <span className="inline-flex items-center gap-1 text-xs text-silver-400">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verifierad bokning
                  </span>
                )}
              </div>
              <span className="text-xs text-silver-500">
                {STATUS_LABEL[r.status]} · {formatDateTimeShort(r.created_at, DEFAULT_TZ)}
              </span>
            </div>
            {r.service_name && <p className="mt-1 text-xs text-silver-500">{r.service_name}</p>}
            {/* Rendered as text: React escapes any markup. */}
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-silver-200">{r.body}</p>
            {r.reported_at && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-100">
                <Flag className="h-3.5 w-3.5" aria-hidden /> Rapporterad av en besökare {formatDateTimeShort(r.reported_at, DEFAULT_TZ)}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {r.status !== 'approved' && (
                <button type="button" className="btn btn-metal btn-sm" disabled={busy === r.id} onClick={() => void act(r, { status: 'approved' }, 'Recensionen är publicerad.')}>
                  <Check className="h-4 w-4" aria-hidden /> Publicera
                </button>
              )}
              {r.status === 'approved' && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => void act(r, { status: 'hidden' }, 'Recensionen är dold.')}>
                  <EyeOff className="h-4 w-4" aria-hidden /> Dölj
                </button>
              )}
              {r.status === 'pending' && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => void act(r, { status: 'rejected' }, 'Recensionen är avvisad.')}>
                  <X className="h-4 w-4" aria-hidden /> Avvisa
                </button>
              )}
              {(r.status === 'rejected' || r.status === 'hidden') && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => void act(r, { status: 'pending' }, 'Recensionen ligger åter för granskning.')}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> Till granskning
                </button>
              )}
              {r.reported_at && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => void act(r, { reported_at: null }, 'Rapporteringen är rensad.')}>
                  Rensa rapport
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" aria-label={`Ta bort recensionen från ${r.display_name}`} disabled={busy === r.id} onClick={() => void remove(r)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
