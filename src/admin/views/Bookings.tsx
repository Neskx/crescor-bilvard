import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Truck, PlusCircle, Search } from 'lucide-react';
import { adminMessage, listAppointments, type AppointmentQuery } from '../adminApi';
import { EmptyState, PageHeader, StatusBadge } from '../components';
import { BookingDrawer } from './BookingDrawer';
import { Alert, Spinner } from '../../components/ui';
import { DEFAULT_TZ, addDays, formatDateLong, formatTime, zonedTimeToUtc } from '../../lib/datetime';
import { cx } from '../../lib/format';
import type { Appointment, AppointmentStatus, LocationType } from '../../types';

const PAGE_SIZE = 50;

export function BookingsView({ onChanged }: { onChanged: () => void }) {
  const [scope, setScope] = useState<AppointmentQuery['scope']>('upcoming');
  const [status, setStatus] = useState<AppointmentStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [location, setLocation] = useState<LocationType | ''>('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Appointment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(0), [scope, status, location, from, to, debounced]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAppointments({
        scope,
        status,
        location,
        from: from ? zonedTimeToUtc(from, '00:00', DEFAULT_TZ) : undefined,
        to: to ? zonedTimeToUtc(addDays(to, 1), '00:00', DEFAULT_TZ) : undefined,
        search: debounced,
        page,
        pageSize: PAGE_SIZE,
      });
      setRows(res.rows);
      setTotal(res.total);
    } catch (e) {
      setError(adminMessage(e));
    } finally {
      setLoading(false);
    }
  }, [scope, status, location, from, to, debounced, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Group by day for scannability.
  const groups: { day: string; items: Appointment[] }[] = [];
  for (const r of rows) {
    const day = formatDateLong(r.start_time, DEFAULT_TZ);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(r);
    else groups.push({ day, items: [r] });
  }

  return (
    <div>
      <PageHeader
        title="Bokningar"
        sub={loading ? 'Laddar…' : `${total} ${total === 1 ? 'bokning' : 'bokningar'}`}
        actions={
          <Link to="/admin/ny-bokning" className="btn btn-metal btn-sm">
            <PlusCircle className="h-4 w-4" aria-hidden /> Ny bokning
          </Link>
        }
      />

      <div className="flex flex-wrap gap-1 border-b border-white/[0.07]" role="group" aria-label="Urval">
        {(
          [
            ['upcoming', 'Kommande'],
            ['past', 'Tidigare'],
            ['all', 'Alla'],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={scope === v}
            onClick={() => setScope(v)}
            className={cx('-mb-px border-b-2 px-4 py-2.5 text-sm', scope === v ? 'border-white text-white' : 'border-transparent text-silver-400 hover:text-white')}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_190px_170px_150px_150px]">
        <label className="relative">
          <span className="sr-only">Sök</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-silver-500" aria-hidden />
          <input
            type="search"
            className="field-input !pl-10"
            placeholder="Sök bokningsnr, namn, e-post, telefon, regnr"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select aria-label="Status" className="field-input" value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus | '')}>
          <option value="">Alla statusar</option>
          <option value="pending">Väntar på bekräftelse</option>
          <option value="confirmed">Bekräftade</option>
          <option value="completed">Utförda</option>
          <option value="cancelled">Avbokade</option>
        </select>
        <select aria-label="Plats" className="field-input" value={location} onChange={(e) => setLocation(e.target.value as LocationType | '')}>
          <option value="">Alla platser</option>
          <option value="workshop">Lämna bilen</option>
          <option value="pickup">Vi hämtar bilen</option>
          <option value="customer_address">Tvätt på plats</option>
        </select>
        <input type="date" aria-label="Från datum" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" aria-label="Till datum" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="mt-8">
        {error && (
          <Alert tone="error" action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>Försök igen</button>}>
            {error}
          </Alert>
        )}
        {loading && rows.length === 0 && (
          <div className="flex justify-center py-16">
            <Spinner label="Laddar bokningar" />
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <EmptyState title="Inga bokningar">{debounced || status || location || from || to ? 'Inga bokningar matchar filtret.' : 'Nya bokningar visas här.'}</EmptyState>
        )}

        <div className={cx('space-y-8', loading && 'opacity-60')}>
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="eyebrow mb-3">{g.day}</h2>
              <ul className="divide-y divide-white/[0.06] border border-white/[0.07] bg-ink-900">
                {g.items.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setOpenId(r.id)} className="grid w-full gap-2 px-4 py-4 text-left transition-colors hover:bg-white/[0.03] sm:grid-cols-[110px_1fr_auto] sm:items-center sm:gap-6">
                      <span className="font-display text-xl font-semibold tabular-nums">
                        {formatTime(r.start_time, DEFAULT_TZ)}
                        <span className="text-sm font-normal text-silver-500">–{formatTime(r.end_time, DEFAULT_TZ)}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {r.customer_name} <span className="font-normal text-silver-500">· {r.booking_reference}</span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-silver-400">
                          {r.service_name}
                          {r.location_type === 'customer_address' && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" aria-hidden /> På plats · {r.service_city ?? 'Kundens adress'}
                            </span>
                          )}
                          {r.location_type === 'pickup' && (
                            <span className="inline-flex items-center gap-1">
                              <Truck className="h-3.5 w-3.5" aria-hidden /> Hämtning · {r.service_city ?? 'Kundens adress'}
                            </span>
                          )}
                          {r.registration_number && <span>{r.registration_number}</span>}
                        </span>
                      </span>
                      <StatusBadge status={r.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {total > PAGE_SIZE && (
          <div className="mt-6 flex items-center justify-between text-sm text-silver-400">
            <button type="button" className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Föregående
            </button>
            <span>
              Sida {page + 1} av {Math.ceil(total / PAGE_SIZE)}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>
              Nästa
            </button>
          </div>
        )}
      </div>

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
