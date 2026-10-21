import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, fetchPublicConfig } from '../services/api';
import { FALLBACK_ADDONS, FALLBACK_SERVICES, FALLBACK_SETTINGS } from '../config/site';
import type { PublicConfig } from '../types';

type Status = 'loading' | 'ready' | 'error' | 'not_configured';

interface PublicConfigState {
  status: Status;
  /** Always usable: real data when ready, safe fallbacks otherwise. */
  config: PublicConfig;
  /** True when `config` came from the database. */
  live: boolean;
  error: ApiError | null;
  reload: () => Promise<PublicConfig | null>;
}

const FALLBACK: PublicConfig = { settings: FALLBACK_SETTINGS, services: FALLBACK_SERVICES, addons: FALLBACK_ADDONS, business_hours: [] };

const Ctx = createContext<PublicConfigState | null>(null);

export function PublicConfigProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [config, setConfig] = useState<PublicConfig>(FALLBACK);
  const [error, setError] = useState<ApiError | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const data = await fetchPublicConfig();
      if (id !== requestId.current) return null;
      setConfig(data);
      setStatus('ready');
      setError(null);
      return data;
    } catch (e) {
      if (id !== requestId.current) return null;
      const err = e instanceof ApiError ? e : new ApiError('network', 'network');
      setError(err);
      setStatus(err.kind === 'not_configured' ? 'not_configured' : 'error');
      return null;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({ status, config, live: status === 'ready', error, reload }),
    [status, config, error, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePublicConfig(): PublicConfigState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePublicConfig must be used inside PublicConfigProvider');
  return ctx;
}
