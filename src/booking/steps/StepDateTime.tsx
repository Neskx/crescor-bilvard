import { useEffect, useMemo, useState, type RefObject } from 'react';
import { CalendarSearch, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { StepFooter, StepTitle } from './common';
import { Alert, Spinner } from '../../components/ui';
import { loadWeek, useSlots } from '../useSlots';
import {
  addDays,
  dateKeyInZone,
  dayParts,
  formatDateLong,
  formatDayLong,
  formatDuration,
  formatTime,
  isoWeekNumber,
  isoWeekday,
  startOfIsoWeek,
  todayKey,
  weekDays,
  formatWeekRange,
} from '../../lib/datetime';
import { errorMessage } from '../../lib/messages';
import { cx } from '../../lib/format';
import type { BusinessHour, PublicSettings, Service, Slot } from '../../types';

interface Props {
  service: Service;
  settings: PublicSettings;
  businessHours: BusinessHour[];
  weekStart: string | null;
  slot: { start: string; end: string } | null;
  onWeek: (weekStart: string) => void;
  onSlot: (slot: { start: string; end: string } | null) => void;
  onBack: () => void;
  onNext: () => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
}

export function StepDateTime({ service, settings, businessHours, weekStart, slot, onWeek, onSlot, onBack, onNext, titleRef }: Props) {
  const tz = settings.timezone;
  const today = todayKey(tz);
  const firstWeek = startOfIsoWeek(today);
  const lastWeek = startOfIsoWeek(addDays(today, settings.booking_horizon_days));
  const week = weekStart && weekStart >= firstWeek && weekStart <= lastWeek ? weekStart : firstWeek;

  const { status, slots, error, refresh } = useSlots(service.id, week);
  const [notice, setNotice] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const days = useMemo(() => weekDays(week), [week]);

  useEffect(() => {
    if (week !== weekStart) onWeek(week);
  }, [week, weekStart, onWeek]);

  // Group slots by local day, and collect the union of start times for grid rows.
  const { byDay, times } = useMemo(() => {
    const map = new Map<string, Map<string, Slot>>();
    const timeSet = new Set<string>();
    for (const s of slots) {
      const day = dateKeyInZone(s.start, tz);
      const t = formatTime(s.start, tz);
      timeSet.add(t);
      if (!map.has(day)) map.set(day, new Map());
      map.get(day)!.set(t, s);
    }
    return { byDay: map, times: [...timeSet].sort() };
  }, [slots, tz]);

  const availableCount = slots.filter((s) => s.available).length;

  // If the chosen time was taken in the meantime, drop it and say so.
  useEffect(() => {
    if (status !== 'ready' || !slot) return;
    const inWeek = days.includes(dateKeyInZone(slot.start, tz));
    if (!inWeek) return;
    const match = slots.find((s) => s.start === slot.start);
    if (!match || !match.available) {
      onSlot(null);
      setNotice('Den tid du hade valt är inte längre tillgänglig. Välj en annan tid.');
    }
  }, [status, slots, slot, days, tz, onSlot]);

  // Mobile: which day is expanded.
  const firstAvailableDay = days.find((d) => [...(byDay.get(d)?.values() ?? [])].some((s) => s.available));
  const slotDay = slot ? dateKeyInZone(slot.start, tz) : null;
  const [mobileDay, setMobileDay] = useState<string | null>(null);
  const activeDay = mobileDay && days.includes(mobileDay) ? mobileDay : slotDay && days.includes(slotDay) ? slotDay : firstAvailableDay ?? days[0];

  const closedWeekday = (day: string) => businessHours.find((h) => h.weekday === isoWeekday(day))?.is_closed ?? true;

  const goWeek = (delta: number) => {
    setNotice(null);
    setMobileDay(null);
    onWeek(addDays(week, delta * 7));
  };

  const findNext = async () => {
    setSearching(true);
    setNotice(null);
    try {
      for (let w = addDays(week, 7); w <= lastWeek; w = addDays(w, 7)) {
        const ws = await loadWeek(service.id, w);
        const first = ws.find((s) => s.available);
        if (first) {
          setMobileDay(dateKeyInZone(first.start, tz));
          onWeek(w);
          return;
        }
      }
      setNotice('Det finns inga lediga tider inom bokningsperioden just nu. Kontakta oss gärna direkt.');
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setSearching(false);
    }
  };

  const select = (s: Slot) => {
    if (!s.available) return;
    setNotice(null);
    onSlot({ start: s.start, end: s.end });
  };

  const slotLabel = (day: string, s: Slot) =>
    `${formatDayLong(day)} klockan ${formatTime(s.start, tz)}, ${s.available ? 'ledig' : 'ej ledig'}`;

  return (
    <div>
      <StepTitle
        ref={titleRef}
        sub={
          <>
            {service.name} tar cirka {formatDuration(service.duration_minutes)}. Alla tider anges i svensk tid.
          </>
        }
      >
        Välj dag och tid
      </StepTitle>

      {/* Week navigation */}
      <div className="flex items-center justify-between gap-3 border border-white/[0.08] bg-ink-900 px-2 py-2 sm:px-3">
        <button
          type="button"
          onClick={() => goWeek(-1)}
          disabled={week <= firstWeek}
          aria-label="Föregående vecka"
          className="flex h-11 w-11 items-center justify-center text-white transition-colors hover:bg-white/5 disabled:opacity-25"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="text-center" aria-live="polite">
          <p className="font-display text-lg font-semibold tracking-wide text-white sm:text-xl">Vecka {isoWeekNumber(week)}</p>
          <p className="text-xs text-silver-400">{formatWeekRange(week)}</p>
        </div>
        <button
          type="button"
          onClick={() => goWeek(1)}
          disabled={week >= lastWeek}
          aria-label="Nästa vecka"
          className="flex h-11 w-11 items-center justify-center text-white transition-colors hover:bg-white/5 disabled:opacity-25"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-silver-400">
        <div className="flex items-center gap-5" aria-hidden>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 border border-silver-300" /> Ledig
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 bg-ink-700" /> Ej ledig
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 bg-gradient-to-br from-white to-silver-400" /> Vald
          </span>
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-1.5 hover:text-white" disabled={status === 'loading'}>
          <RefreshCw className={cx('h-3.5 w-3.5', status === 'loading' && 'animate-spin')} aria-hidden /> Uppdatera
        </button>
      </div>

      {notice && (
        <Alert tone="warning" className="mt-4">
          {notice}
        </Alert>
      )}

      <div className="relative mt-4 min-h-[220px]" aria-busy={status === 'loading'}>
        {status === 'loading' && slots.length === 0 && (
          <div className="flex h-[220px] items-center justify-center text-silver-400">
            <Spinner label="Hämtar lediga tider" /> <span className="ml-3 text-sm">Hämtar lediga tider…</span>
          </div>
        )}

        {status === 'error' && (
          <Alert tone="error" title="Kunde inte hämta lediga tider" action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => void refresh()}>Försök igen</button>}>
            {errorMessage(error)}
          </Alert>
        )}

        {(status === 'ready' || (status === 'loading' && slots.length > 0)) && (
          <>
            {/* ---------- Desktop: weekly grid ---------- */}
            <div className={cx('hidden md:block', status === 'loading' && 'opacity-50 transition-opacity')}>
              <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] gap-1.5" role="group" aria-label={`Tider vecka ${isoWeekNumber(week)}`}>
                <div />
                {days.map((d) => {
                  const p = dayParts(d);
                  const isToday = d === today;
                  return (
                    <div key={d} className={cx('pb-2 text-center', d < today && 'opacity-40')}>
                      <p className={cx('text-[0.65rem] font-semibold tracking-[0.2em] uppercase', isToday ? 'text-white' : 'text-silver-400')}>
                        {p.weekday}
                      </p>
                      <p className={cx('font-display text-2xl font-semibold', isToday ? 'text-white' : 'text-silver-200')}>
                        {p.day} <span className="text-sm font-normal text-silver-500">{p.month}</span>
                      </p>
                      {isToday && <span className="mx-auto mt-1 block h-px w-6 bg-white" aria-label="Idag" />}
                    </div>
                  );
                })}

                {times.length === 0 && (
                  <p className="col-span-8 py-12 text-center text-sm text-silver-400">Inga bokningsbara tider den här veckan.</p>
                )}

                {times.map((t) => (
                  <div key={t} className="contents">
                    <div className="flex items-center text-xs text-silver-500 tabular-nums">{t}</div>
                    {days.map((d) => {
                      const s = byDay.get(d)?.get(t);
                      if (!s) {
                        const hasAny = byDay.has(d);
                        return (
                          <div key={d} className="flex h-11 items-center justify-center border border-dashed border-white/[0.04] text-[0.65rem] text-silver-600">
                            {!hasAny && t === times[0] ? (closedWeekday(d) ? 'Stängt' : '–') : ''}
                          </div>
                        );
                      }
                      const selected = slot?.start === s.start;
                      return (
                        <button
                          key={d}
                          type="button"
                          disabled={!s.available}
                          aria-pressed={selected}
                          aria-label={slotLabel(d, s)}
                          onClick={() => select(s)}
                          className={cx(
                            'h-11 text-xs font-semibold tabular-nums transition-all duration-200',
                            selected
                              ? 'bg-gradient-to-br from-white via-silver-200 to-silver-400 text-ink-950 shadow-[0_6px_20px_-8px_rgba(255,255,255,0.6)]'
                              : s.available
                                ? 'border border-silver-300/60 text-white hover:border-white hover:bg-white/10'
                                : 'bg-ink-800 text-silver-600 line-through decoration-silver-600/50',
                          )}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* ---------- Mobile: day chips + time buttons ---------- */}
            <div className="md:hidden">
              <div role="group" aria-label="Välj dag" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {days.map((d) => {
                  const p = dayParts(d);
                  const daySlots = [...(byDay.get(d)?.values() ?? [])];
                  const free = daySlots.filter((s) => s.available).length;
                  const active = d === activeDay;
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={active}
                      aria-label={`${formatDayLong(d)}, ${free ? `${free} lediga tider` : 'inga lediga tider'}`}
                      onClick={() => setMobileDay(d)}
                      className={cx(
                        'flex min-w-[64px] flex-1 flex-col items-center gap-0.5 border py-3 transition-colors',
                        active ? 'border-white bg-white text-ink-950' : 'border-white/10 text-white',
                        !free && !active && 'opacity-40',
                      )}
                    >
                      <span className="text-[0.62rem] font-semibold tracking-[0.18em] uppercase">{p.weekday}</span>
                      <span className="font-display text-2xl leading-none font-semibold">{p.day}</span>
                      <span className={cx('mt-1 h-1 w-1 rounded-full', free ? (active ? 'bg-ink-950' : 'bg-white') : 'bg-transparent')} />
                    </button>
                  );
                })}
              </div>

              <div className="mt-5" aria-live="polite">
                <p className="text-sm font-semibold text-white">{formatDayLong(activeDay)}</p>
                {(() => {
                  const free = [...(byDay.get(activeDay)?.values() ?? [])].filter((s) => s.available);
                  if (free.length === 0) {
                    return (
                      <p className="mt-3 text-sm text-silver-400">
                        {byDay.has(activeDay) || !closedWeekday(activeDay) ? 'Inga lediga tider den här dagen.' : 'Stängt den här dagen.'}
                      </p>
                    );
                  }
                  return (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {free.map((s) => {
                        const selected = slot?.start === s.start;
                        return (
                          <button
                            key={s.start}
                            type="button"
                            aria-pressed={selected}
                            aria-label={slotLabel(activeDay, s)}
                            onClick={() => select(s)}
                            className={cx(
                              'h-14 text-base font-semibold tabular-nums transition-colors',
                              selected ? 'bg-gradient-to-br from-white via-silver-200 to-silver-400 text-ink-950' : 'border border-silver-300/50 text-white active:bg-white/10',
                            )}
                          >
                            {formatTime(s.start, tz)}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {availableCount === 0 && status === 'ready' && (
              <div className="mt-6 flex flex-col items-start gap-3 border border-white/[0.08] bg-ink-900 p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-silver-300">Inga lediga tider den här veckan.</p>
                <button type="button" onClick={() => void findNext()} disabled={searching || week >= lastWeek} className="btn btn-ghost btn-sm">
                  {searching ? <Spinner className="h-4 w-4" label="Söker" /> : <CalendarSearch className="h-4 w-4" aria-hidden />}
                  Hitta nästa lediga tid
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {slot && (
        <div className="metal-ring mt-6 flex flex-col gap-1 bg-white/[0.04] px-5 py-4 sm:flex-row sm:items-center sm:justify-between" aria-live="polite">
          <p className="eyebrow">Vald tid</p>
          <p className="text-base font-semibold text-white">
            {formatDateLong(slot.start, tz)} · {formatTime(slot.start, tz)}–{formatTime(slot.end, tz)}
          </p>
        </div>
      )}

      <StepFooter onBack={onBack} onNext={onNext} nextDisabled={!slot} />
    </div>
  );
}
