import { useEffect, useState } from 'react';
import { adminMessage, listHours, saveHours } from '../adminApi';
import { PageHeader, useToast } from '../components';
import { Alert, Spinner } from '../../components/ui';
import type { BusinessHour } from '../../types';

const DAY_NAMES = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];

export function HoursView() {
  const toast = useToast();
  const [hours, setHours] = useState<BusinessHour[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listHours()
      .then(setHours)
      .catch((e) => setError(adminMessage(e)));
  }, []);

  const update = (weekday: number, patch: Partial<BusinessHour>) =>
    setHours((h) => h?.map((x) => (x.weekday === weekday ? { ...x, ...patch } : x)) ?? null);

  const invalid = hours?.filter((h) => !h.is_closed && h.opening_time >= h.closing_time) ?? [];

  async function save() {
    if (!hours || invalid.length) return;
    setBusy(true);
    try {
      await saveHours(hours);
      toast('success', 'Öppettiderna är sparade. Lediga tider uppdateras direkt på webbplatsen.');
    } catch (e) {
      toast('error', adminMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Öppettider" sub="Styr vilka tider som går att boka online. Befintliga bokningar påverkas inte." />
      {error && <Alert tone="error">{error}</Alert>}
      {!hours && !error && <Spinner label="Laddar öppettider" />}
      {hours && (
        <>
          <ul className="divide-y divide-white/[0.06] border border-white/[0.07] bg-ink-900">
            {hours.map((h) => (
              <li key={h.weekday} className="grid grid-cols-[110px_1fr] items-center gap-3 px-4 py-3 sm:grid-cols-[130px_120px_1fr]">
                <span className="font-semibold">{DAY_NAMES[h.weekday - 1]}</span>
                <label className="flex items-center gap-2 text-sm text-silver-300">
                  <input type="checkbox" checked={!h.is_closed} onChange={(e) => update(h.weekday, { is_closed: !e.target.checked })} className="h-4 w-4 accent-silver-200" />
                  Öppet
                </label>
                <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                  <input
                    type="time"
                    step={900}
                    aria-label={`${DAY_NAMES[h.weekday - 1]} öppnar`}
                    disabled={h.is_closed}
                    className="field-input !min-h-[42px] !py-2"
                    value={h.opening_time}
                    onChange={(e) => update(h.weekday, { opening_time: e.target.value })}
                  />
                  <span className="text-silver-500">–</span>
                  <input
                    type="time"
                    step={900}
                    aria-label={`${DAY_NAMES[h.weekday - 1]} stänger`}
                    disabled={h.is_closed}
                    className="field-input !min-h-[42px] !py-2"
                    value={h.closing_time}
                    onChange={(e) => update(h.weekday, { closing_time: e.target.value })}
                  />
                </div>
              </li>
            ))}
          </ul>
          {invalid.length > 0 && (
            <Alert tone="error" className="mt-4">
              Stängningstiden måste vara senare än öppningstiden ({invalid.map((h) => DAY_NAMES[h.weekday - 1]).join(', ')}).
            </Alert>
          )}
          <p className="mt-4 text-xs text-silver-500">
            En bokning måste rymmas helt inom öppettiden. Tips: uppdatera även texten för öppettider under Inställningar, som visas på webbplatsen.
          </p>
          <button type="button" className="btn btn-metal mt-6" disabled={busy || invalid.length > 0} onClick={() => void save()}>
            {busy && <Spinner className="h-4 w-4" />} Spara öppettider
          </button>
        </>
      )}
    </div>
  );
}
