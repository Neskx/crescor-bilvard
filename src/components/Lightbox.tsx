import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import type { GalleryItem } from '../config/site';

interface Props {
  items: GalleryItem[];
  index: number | null;
  demo: boolean;
  onClose: () => void;
  onIndex: (i: number) => void;
}

/** Fullscreen viewer built on the native <dialog> (focus trap + Esc for free). */
export function Lightbox({ items, index, demo, onClose, onIndex }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = index !== null;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Arrow keys on the slider adjust the comparison; elsewhere they page.
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') onIndex(((index ?? 0) + 1) % items.length);
      if (e.key === 'ArrowLeft') onIndex(((index ?? 0) - 1 + items.length) % items.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, items.length, onIndex]);

  const item = index !== null ? items[index] : null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={item ? `Före och efter: ${item.title}` : 'Bildvisning'}
      className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/90 backdrop:backdrop-blur-sm"
    >
      {item && (
        <div className="flex h-full flex-col items-center justify-center p-4 sm:p-10" onClick={(e) => e.target === e.currentTarget && onClose()}>
          <div className="flex w-full max-w-6xl items-center justify-between pb-4 text-white">
            <p className="font-display text-2xl font-semibold">
              {item.title}
              <span className="ml-3 font-sans text-xs tracking-[0.2em] text-silver-400">
                {index! + 1} / {items.length}
              </span>
            </p>
            <button type="button" onClick={onClose} aria-label="Stäng bildvisningen" className="flex h-11 w-11 items-center justify-center border border-white/20 hover:border-white">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <BeforeAfterSlider
            key={item.id}
            before={item.before}
            after={item.after}
            alt={item.alt}
            simulateBefore={demo && item.before === item.after}
            className="aspect-[4/3] max-h-[72vh] w-full max-w-6xl sm:aspect-[16/9]"
          />
          {demo && <p className="mt-3 text-xs text-silver-400">Demonstrationsbild – illustrerar funktionen, inte ett verkligt kundarbete.</p>}
          {items.length > 1 && (
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => onIndex((index! - 1 + items.length) % items.length)}
                aria-label="Föregående bild"
                className="flex h-11 w-11 items-center justify-center border border-white/20 text-white hover:border-white"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onIndex((index! + 1) % items.length)}
                aria-label="Nästa bild"
                className="flex h-11 w-11 items-center justify-center border border-white/20 text-white hover:border-white"
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
