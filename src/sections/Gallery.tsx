import { useState } from 'react';
import { Expand } from 'lucide-react';
import { Img, SectionHeading } from '../components/ui';
import { BeforeAfterSlider } from '../components/BeforeAfterSlider';
import { Lightbox } from '../components/Lightbox';
import { useReveal } from '../hooks/useReveal';
import { GALLERY, GALLERY_IS_DEMO } from '../config/site';

export function Gallery() {
  const ref = useReveal<HTMLElement>();
  const [open, setOpen] = useState<number | null>(null);
  if (GALLERY.length === 0) return null;
  const [featured, ...rest] = GALLERY;

  return (
    <section ref={ref} aria-labelledby="galleri-title" className="relative bg-ink-950 py-24 sm:py-32">
      <div className="container-lux">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="galleri-title"
            eyebrow="Före & efter"
            title={
              <>
                Resultat som <span className="text-metal">syns.</span>
              </>
            }
            lead="Dra i reglaget för att jämföra. Klicka på en bild för att se den i helskärm."
          />
          {GALLERY_IS_DEMO && (
            <p className="reveal max-w-xs border border-silver-500/40 px-4 py-3 text-xs leading-relaxed text-silver-400">
              <strong className="block tracking-[0.2em] text-silver-200 uppercase">Demonstration</strong>
              Bilderna visar hur galleriet fungerar och är inte verkliga kundarbeten. Egna före- och efterbilder läggs in här.
            </p>
          )}
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          <div className="reveal relative lg:col-span-2">
            <BeforeAfterSlider
              before={featured.before}
              after={featured.after}
              alt={featured.alt}
              simulateBefore={GALLERY_IS_DEMO && featured.before === featured.after}
              className="aspect-[4/3] w-full border border-white/[0.07] sm:aspect-[16/10]"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="font-display text-xl font-semibold text-white">{featured.title}</p>
              <button
                type="button"
                onClick={() => setOpen(0)}
                className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-silver-300 uppercase hover:text-white"
              >
                <Expand className="h-4 w-4" aria-hidden /> Helskärm
              </button>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-5 lg:grid-cols-1">
            {rest.map((item, i) => (
              <li key={item.id} className="reveal">
                <button
                  type="button"
                  onClick={() => setOpen(i + 1)}
                  className="group relative block aspect-[4/3] w-full overflow-hidden border border-white/[0.07] text-left lg:aspect-[16/10]"
                  aria-label={`Visa ${item.title} i helskärm`}
                >
                  <Img src={item.after} alt={item.alt} className="h-full w-full object-cover transition-transform duration-[1.2s] group-hover:scale-105" />
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent to-transparent" />
                  <span className="font-display absolute bottom-3 left-4 text-lg font-semibold text-white">{item.title}</span>
                  <Expand aria-hidden className="absolute top-3 right-3 h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Lightbox items={GALLERY} index={open} demo={GALLERY_IS_DEMO} onClose={() => setOpen(null)} onIndex={setOpen} />
    </section>
  );
}
