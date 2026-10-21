import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchSlots } from '../services/api';
import { addDays } from '../lib/datetime';
import type { Slot } from '../types';

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; slots: Slot[] }>();

const keyOf = (serviceId: string, weekStart: string) => `${serviceId}|${weekStart}`;

export function invalidateSlots(): void {
  cache.clear();
}

export async function loadWeek(serviceId: string, weekStart: string, force = false): Promise<Slot[]> {
  const key = keyOf(serviceId, weekStart);
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.slots;
  const slots = await fetchSlots(serviceId, weekStart, addDays(weekStart, 6));
  cache.set(key, { at: Date.now(), slots });
  return slots;
}

type State =
  | { status: 'idle' | 'loading'; slots: Slot[]; error: null }
  | { status: 'ready'; slots: Slot[]; error: null }
  | { status: 'error'; slots: Slot[]; error: ApiError };

/**
 * Availability for one service and week. Refreshes automatically when the tab
 * becomes visible again, so customers returning to the page see current data.
 */
export function useSlots(serviceId: string | null, weekStart: string | null) {
  const [state, setState] = useState<State>({ status: 'idle', slots: [], error: null });
  const req = useRef(0);

  const load = useCallback(
    async (force = false) => {
      if (!serviceId || !weekStart) return;
      const id = ++req.current;
      setState((s) => ({ status: 'loading', slots: s.slots, error: null }));
      try {
        const slots = await loadWeek(serviceId, weekStart, force);
        if (id === req.current) setState({ status: 'ready', slots, error: null });
      } catch (e) {
        if (id === req.current) {
          setState({ status: 'error', slots: [], error: e instanceof ApiError ? e : new ApiError('network', 'network') });
        }
      }
    },
    [serviceId, weekStart],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && serviceId && weekStart) {
        const hit = cache.get(keyOf(serviceId, weekStart));
        if (!hit || Date.now() - hit.at > TTL_MS) void load(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load, serviceId, weekStart]);

  return { ...state, refresh: () => load(true) };
}
