import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchSlots } from '../services/api';
import { addDays } from '../lib/datetime';
import type { LocationType, Slot } from '../types';

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; slots: Slot[] }>();

// Availability depends on the location: pickup and on-site bookings reserve travel time.
const keyOf = (serviceId: string, location: LocationType | null, weekStart: string) => `${serviceId}|${location ?? '-'}|${weekStart}`;

export function invalidateSlots(): void {
  cache.clear();
}

export async function loadWeek(serviceId: string, weekStart: string, location: LocationType | null = null, force = false): Promise<Slot[]> {
  const key = keyOf(serviceId, location, weekStart);
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.slots;
  const slots = await fetchSlots(serviceId, weekStart, addDays(weekStart, 6), location);
  cache.set(key, { at: Date.now(), slots });
  return slots;
}

type State =
  | { status: 'idle' | 'loading'; slots: Slot[]; error: null }
  | { status: 'ready'; slots: Slot[]; error: null }
  | { status: 'error'; slots: Slot[]; error: ApiError };

/**
 * Availability for one service, location and week. Refreshes automatically when
 * the tab becomes visible again, so customers returning to the page see current data.
 */
export function useSlots(serviceId: string | null, weekStart: string | null, location: LocationType | null = null) {
  const [state, setState] = useState<State>({ status: 'idle', slots: [], error: null });
  const req = useRef(0);

  const load = useCallback(
    async (force = false) => {
      if (!serviceId || !weekStart) return;
      const id = ++req.current;
      setState((s) => ({ status: 'loading', slots: s.slots, error: null }));
      try {
        const slots = await loadWeek(serviceId, weekStart, location, force);
        if (id === req.current) setState({ status: 'ready', slots, error: null });
      } catch (e) {
        if (id === req.current) {
          setState({ status: 'error', slots: [], error: e instanceof ApiError ? e : new ApiError('network', 'network') });
        }
      }
    },
    [serviceId, weekStart, location],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && serviceId && weekStart) {
        const hit = cache.get(keyOf(serviceId, location, weekStart));
        if (!hit || Date.now() - hit.at > TTL_MS) void load(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load, serviceId, weekStart, location]);

  return { ...state, refresh: () => load(true) };
}
