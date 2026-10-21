import { useId, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { Img } from './ui';
import { cx } from '../lib/format';

interface Props {
  before: string;
  after: string;
  alt: string;
  /** Demo mode only: derive a dull "before" from the after-image. */
  simulateBefore?: boolean;
  className?: string;
}

/**
 * Accessible before/after comparison. The handle is a native range input, so it
 * works with mouse, touch and keyboard (arrow keys, Home/End) out of the box.
 */
export function BeforeAfterSlider({ before, after, alt, simulateBefore, className }: Props) {
  const [pos, setPos] = useState(50);
  const id = useId();

  return (
    <div className={cx('group relative overflow-hidden select-none', className)}>
      <Img src={after} alt={`Efter: ${alt}`} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <Img
          src={before}
          alt={`Före: ${alt}`}
          className={cx(
            'absolute inset-0 h-full w-full object-cover',
            simulateBefore && '[filter:brightness(0.62)_contrast(0.78)_saturate(0)_blur(0.6px)]',
          )}
        />
      </div>

      <span className="pointer-events-none absolute top-4 left-4 bg-ink-950/75 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.24em] text-white uppercase backdrop-blur">
        Före
      </span>
      <span className="pointer-events-none absolute top-4 right-4 bg-white/90 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.24em] text-ink-950 uppercase">
        Efter
      </span>

      {/* Divider + handle */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-white/90" style={{ left: `${pos}%` }}>
        <span className="absolute top-1/2 left-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-ink-950/60 text-white backdrop-blur-md">
          <MoveHorizontal className="h-5 w-5" />
        </span>
      </div>

      <label htmlFor={id} className="sr-only">
        Jämför före och efter
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-valuetext={`${pos} procent före-bild visas`}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0 focus-visible:opacity-0"
      />
      {/* Visible focus ring for keyboard users (input itself is transparent) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 ring-silver-200 ring-offset-0 group-has-[input:focus-visible]:ring-2" />
    </div>
  );
}
