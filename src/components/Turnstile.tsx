import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { SITE } from '../config/site';

// Cloudflare Turnstile (privacy-friendly CAPTCHA). Only rendered when
// VITE_TURNSTILE_SITE_KEY is set; the server enforces it only when
// TURNSTILE_SECRET_KEY is set. Configure both or neither.

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('turnstile load failed'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export const turnstileEnabled = Boolean(SITE.turnstileSiteKey);

export interface TurnstileHandle {
  reset: () => void;
}

export const Turnstile = forwardRef<TurnstileHandle, { onToken: (token: string | null) => void; theme?: 'dark' | 'light' }>(
  function Turnstile({ onToken, theme = 'dark' }, ref) {
    const el = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const cb = useRef(onToken);
    useLayoutEffect(() => {
      cb.current = onToken;
    });

    useImperativeHandle(ref, () => ({
      reset: () => {
        cb.current(null);
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
      },
    }));

    useEffect(() => {
      if (!turnstileEnabled) return;
      let cancelled = false;
      loadScript()
        .then(() => {
          if (cancelled || !el.current || !window.turnstile) return;
          widgetId.current = window.turnstile.render(el.current, {
            sitekey: SITE.turnstileSiteKey,
            theme,
            language: 'sv',
            callback: (t: string) => cb.current(t),
            'expired-callback': () => cb.current(null),
            'error-callback': () => cb.current(null),
          });
        })
        .catch(() => cb.current(null));
      return () => {
        cancelled = true;
        if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      };
    }, [theme]);

    if (!turnstileEnabled) return null;
    return <div ref={el} className="min-h-[65px]" />;
  },
);
