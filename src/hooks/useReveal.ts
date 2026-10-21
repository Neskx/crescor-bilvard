import { useCallback, useEffect, useRef } from 'react';

/**
 * Adds `is-visible` to the element (and any `.reveal` descendants) when it
 * scrolls into view.
 *
 * Returns a callback ref, so it also works for elements that mount later (e.g.
 * sections that render only once live data has loaded). Content added inside
 * the element afterwards is picked up by a MutationObserver. Reduced motion is
 * handled in CSS.
 */
export function useReveal<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null);

  const ref = useCallback((root: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!root) return;

    const pending = (): HTMLElement[] =>
      [...(root.classList.contains('reveal') ? [root as HTMLElement] : []), ...root.querySelectorAll<HTMLElement>('.reveal')].filter(
        (t) => !t.classList.contains('is-visible'),
      );

    if (!('IntersectionObserver' in window)) {
      pending().forEach((t) => t.classList.add('is-visible'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    const observeAll = () => pending().forEach((t) => io.observe(t));
    observeAll();
    const mo = new MutationObserver(observeAll);
    mo.observe(root, { childList: true, subtree: true });

    cleanup.current = () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  useEffect(() => () => cleanup.current?.(), []);

  return ref;
}
