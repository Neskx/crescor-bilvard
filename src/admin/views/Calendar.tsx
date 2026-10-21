import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { adminMessage, appointmentsBetween, listBlocked } from '../adminApi';
import { PageHeader } from '../components';
import { BookingDrawer } from './BookingDrawer';
import { Alert, Spinner } from '../../components/ui';
import {
  DEFAULT_TZ,
  addDays,
  dateKeyInZone,
  dayParts,
  formatTime,
  formatWeekRange,
  isoWeekNumber,
  startOfIsoWeek,
  todayKey,
  weekDays,
  zonedTimeToUtc,
} from '../../lib/datetime';
import { cx } from '../../lib/format';
import type { Appointment, BlockedPeriod } from '../../types';

export function CalendarView({ onChanged }: { onChanged: () => void }) {
  const today = todayKey(DEFAULT_TZ);
  const [week, setWeek] = useState(startOfIsoWeek(today));
  const [items, setItems] = useState<Appointment[]>([]);
  const [blocked, setBlocked] = useState<BlockedPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const days = weekDays(week);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = zonedTimeToUtc(week, '00:00', DEFAULT_TZ);
      const to = zonedTimeToUtc(addDays(week, 7), '00:00', DEFAULT_TZ);
      const [appts, blocks] = await Promise.all([appointmentsBetween(from, to), listBlocked()]);
      setItems(appts);
      setBlocked(blocks.filter((b) => b.start_time < to && b.end_time > from));
    } catch (e) {
      setError(adminMessage(e));
    } finally {
      setLoading(false);
    }
  }, [week]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayStart = (d: string) => zonedTimeToUtc(d, '00:00', DEFAULT_TZ);
  const dayEnd = (d: string) => zonedTimeToUtc(addDays(d, 1), '00:00', DEFAULT_TZ);

  return (
    <div>
      <PageHeader
        title="Kalender"
        sub={`Vecka ${isoWeekNumber(week)} · ${formatWeekRange(week)}`}
        actions={
          <>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Föregående vecka" onClick={() => setWeek(addDays(week, -7))}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeek(startOfIsoWeek(today))}>
              Idag
            </button>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Nästa vecka" onClick={() => setWeek(addDays(week, 7))}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {loading && items.length === 0 && (
        <div className="flex justify-center py-16">
          <Spinner label="Laddar kalender" />
        </div>
      )}
      <div className={cx('grid gap-3 md:grid-cols-7', loading && 'opacity-60')}>
        {days.map((d) => {
          const p = dayParts(d);
          const dayItems = items.filter((a) => dateKeyInZone(a.start_time, DEFAULT_TZ) === d);
          const dayBlocks = blocked.filter((b) => b.start_time < dayEnd(d) && b.end_time > dayStart(d));
          return (
            <section key={d} className={cx('min-h-[140px] border bg-ink-900 p-3', d === today ? 'border-white/40' : 'border-white/[0.07]')}>
              <h2 className="flex items-baseline gap-2 border-b border-white/[0.06] pb-2">
                <span className="text-[0.65rem] font-semibold tracking-[0.2em] text-silver-400 uppercase">{p.weekday}</span>
                <span className="font-display text-xl font-semibold">{p.day}</span>
                <span className="text-xs text-silver-500">{p.month}</span>
              </h2>
              <ul className="mt-2 space-y-2">
                {dayBlocks.map((b) => (
                  <li key={b.id} className="border border-dashed border-white/20 px-2 py-1.5 text-xs text-silver-400">
                    Blockerat{b.reason ? `: ${b.reason}` : ''}
                  </li>
                ))}
                {dayItems.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(a.id)}
                      className={cx(
                        'w-full border-l-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.06]',
                        a.status === 'pending' ? 'border-amber-200 bg-amber-200/[0.06]' : a.status === 'completed' ? 'border-emerald-200/70 bg-white/[0.02]' : 'border-white bg-white/[0.04]',
                      )}
                    >
                      <span className="block font-semibold tabular-nums">
                        {formatTime(a.start_time, DEFAULT_TZ)}–{formatTime(a.end_time, DEFAULT_TZ)}
                      </span>
                      <span className="block truncate">{a.customer_name}</span>
                      <span className="flex items-center gap-1 truncate text-silver-400">
                        {a.location_type === 'customer_address' && <MapPin className="h-3 w-3 shrink-0" aria-hidden />}
                        {a.service_name}
                      </span>
                    </button>
                  </li>
                ))}
                {!dayItems.length && !dayBlocks.length && <li className="text-xs text-silver-600">Inga bokningar</li>}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-silver-500">Gul markering = väntar på bekräftelse. Avbokade bokningar visas inte.</p>
      <BookingDrawer
        id={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          onChanged();
          void load();
        }}
      />
    </div>
  );
}
