import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Check, ClipboardCheck, Droplets, Eye, Search, Sparkles, SprayCan } from 'lucide-react';
import { SectionHeading } from '../components/ui';
import { useReveal } from '../hooks/useReveal';
import { cx } from '../lib/format';

/*
 * "Varför Crescor" as an editorial bento grid. Each point has an illustrative
 * mock-up (decorative, aria-hidden) that visualises what the text promises.
 * The mock-ups contain no figures or claims beyond the copy itself.
 */

function Card({
  index,
  title,
  text,
  tone = 'dark',
  className,
  children,
  bodyClassName,
  cta,
  mockupClassName = 'relative mt-auto',
}: {
  index: string;
  title: string;
  text: string;
  tone?: 'dark' | 'light';
  className?: string;
  bodyClassName?: string;
  cta?: ReactNode;
  /** Layout of the mock-up area (defaults to bottom-aligned). */
  mockupClassName?: string;
  children: ReactNode;
}) {
  const dark = tone === 'dark';
  return (
    <li
      className={cx(
        'reveal group relative isolate flex flex-col overflow-hidden transition-[transform,box-shadow] duration-700 ease-[var(--ease-lux)] hover:-translate-y-1',
        dark
          ? 'bg-ink-950 text-white shadow-[0_40px_80px_-40px_rgba(0,0,0,0.65)]'
          : 'border border-ink-950/10 bg-white text-ink-950 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.35)]',
        className,
      )}
    >
      {/* metallic top edge */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-silver-300 to-transparent opacity-70" />
      {/* soft spotlight on hover */}
      <span
        aria-hidden
        className={cx(
          'pointer-events-none absolute -top-1/3 left-1/2 -z-10 h-[120%] w-[120%] -translate-x-1/2 rounded-full opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-100',
          dark ? 'bg-[radial-gradient(closest-side,rgba(255,255,255,0.07),transparent)]' : 'bg-[radial-gradient(closest-side,rgba(0,0,0,0.04),transparent)]',
        )}
      />
      <div className={cx('relative z-10 p-7 sm:p-9', bodyClassName)}>
        <div className="flex items-baseline gap-4">
          <span className={cx('font-display text-sm font-semibold tracking-[0.25em]', dark ? 'text-silver-500' : 'text-silver-600')}>{index}</span>
          <span aria-hidden className={cx('h-px flex-1', dark ? 'bg-white/10' : 'bg-ink-950/10')} />
        </div>
        <h3 className="font-display mt-5 text-3xl leading-none font-semibold sm:text-4xl">{title}</h3>
        <p className={cx('mt-4 max-w-md text-sm leading-relaxed sm:text-[0.95rem]', dark ? 'text-silver-400' : 'text-ink-600')}>{text}</p>
        {cta && <div className="mt-7">{cta}</div>}
      </div>
      <div aria-hidden className={mockupClassName}>
        {children}
      </div>
    </li>
  );
}

// ---- 01: process timeline + final check ----------------------------------------

const STEPS = [
  { icon: Search, label: 'Bedömning' },
  { icon: SprayCan, label: 'Förtvätt' },
  { icon: Droplets, label: 'Rengöring' },
  { icon: Eye, label: 'Kontroll' },
  { icon: Sparkles, label: 'Finish' },
];

const CHECKS = ['Dörrfalsar och trösklar', 'Ventilationsgaller', 'Fälgarnas insida', 'Rutor utan ränder'];

function ProcessMockup() {
  return (
    <div className="px-7 pb-8 sm:px-9 sm:pb-9">
      <div className="relative">
        {/* track */}
        <div className="absolute top-5 right-[10%] left-[10%] h-px bg-white/10" />
        <div className="absolute top-5 right-[10%] left-[10%] h-px origin-left scale-x-0 bg-gradient-to-r from-silver-500 via-white to-silver-300 transition-transform delay-300 duration-[1800ms] ease-[var(--ease-lux)] group-[.is-visible]:scale-x-100" />
        <ol className="relative grid grid-cols-5">
          {STEPS.map(({ icon: Icon, label }, i) => (
            <li key={label} className="flex flex-col items-center gap-3 text-center">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-ink-900 text-silver-400 transition-all duration-500 group-[.is-visible]:border-white/60 group-[.is-visible]:text-white group-[.is-visible]:shadow-[0_0_24px_-4px_rgba(255,255,255,0.45)]"
                style={{ transitionDelay: `${500 + i * 320}ms` }}
              >
                <Icon className="h-4 w-4" strokeWidth={1.5} />
              </span>
              <span className="text-[0.64rem] font-medium text-silver-400 sm:text-[0.68rem] sm:font-semibold sm:tracking-[0.14em] sm:uppercase">{label}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-8 border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-[0.68rem] font-semibold tracking-[0.22em] text-silver-300 uppercase">
            <ClipboardCheck className="h-4 w-4" strokeWidth={1.5} /> Slutkontroll
          </p>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full origin-left scale-x-0 bg-gradient-to-r from-silver-400 to-white transition-transform delay-[1600ms] duration-[1400ms] ease-[var(--ease-lux)] group-[.is-visible]:scale-x-100" />
          </span>
        </div>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {CHECKS.map((c, i) => (
            <li key={c} className="flex items-center gap-2.5 text-sm text-silver-200">
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full border border-white/25 text-ink-950 transition-colors duration-300 group-[.is-visible]:border-white group-[.is-visible]:bg-white"
                style={{ transitionDelay: `${1800 + i * 250}ms` }}
              >
                <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
              </span>
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---- 02: magnifying loupe ----------------------------------------------------------

const LOUPE_IMG = '/images/gallery-demo-3.webp';

function DetailLoupe() {
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = stage.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(92, Math.max(8, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(90, Math.max(10, ((e.clientY - r.top) / r.height) * 100));
    el.style.setProperty('--lx', `${x}%`);
    el.style.setProperty('--ly', `${y}%`);
  };

  return (
    <div className="px-7 pb-8 sm:px-9 sm:pb-9">
      <div
        ref={stage}
        onPointerEnter={() => setActive(true)}
        onPointerLeave={() => setActive(false)}
        onPointerMove={move}
        className={cx('loupe-stage relative aspect-[4/3] cursor-crosshair overflow-hidden border border-white/10 [touch-action:pan-y]', !active && 'is-idle')}
        style={{ '--lx': '62%', '--ly': '42%' } as CSSProperties}
      >
        <img src={LOUPE_IMG} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/70 via-transparent to-ink-950/20" />
        {/* lens */}
        <div
          className="loupe-lens"
          style={{ backgroundImage: `url(${LOUPE_IMG})` }}
        >
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-ink-950/70 px-1.5 py-0.5 text-[0.55rem] font-semibold tracking-[0.2em] text-white backdrop-blur">
            ×2,6
          </span>
        </div>
        <p className="absolute top-3 left-3 text-[0.6rem] font-semibold tracking-[0.24em] text-white/80 uppercase">
          {active ? 'Utforska' : 'För muspekaren över bilden'}
        </p>
      </div>
      <ul className="mt-5 flex flex-wrap gap-2">
        {['Skarvar', 'Lister', 'Ventiler', 'Fälgar', 'Krom'].map((t) => (
          <li key={t} className="border border-white/15 px-3 py-1 text-[0.65rem] font-semibold tracking-[0.18em] text-silver-300 uppercase">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- 03: tailored plan configurator ----------------------------------------------

const AREAS = [
  { label: 'Interiör', on: true },
  { label: 'Lack', on: true },
  { label: 'Fälgar', on: false },
  { label: 'Klädsel', on: true },
  { label: 'Rutor', on: false },
];

function TailorMockup() {
  return (
    <div className="px-7 pb-8 sm:px-9 sm:pb-9">
      <div className="relative border border-ink-950/10 bg-gradient-to-b from-silver-50 to-white p-5 shadow-[inset_0_1px_0_#fff]">
        <p className="text-[0.66rem] font-semibold tracking-[0.22em] text-silver-600 uppercase">Ditt upplägg</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {AREAS.map((a) => (
            <span
              key={a.label}
              className={cx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold',
                a.on ? 'bg-ink-950 text-white' : 'border border-ink-950/15 text-ink-600',
              )}
            >
              {a.on && <Check className="h-3 w-3" strokeWidth={3} />}
              {a.label}
            </span>
          ))}
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between text-[0.66rem] font-semibold tracking-[0.18em] text-silver-600 uppercase">
            <span>Bilens skick idag</span>
          </div>
          <div className="relative mt-4 h-1.5 rounded-full bg-ink-950/10">
            <div className="absolute inset-y-0 left-0 w-0 rounded-full bg-gradient-to-r from-silver-400 to-ink-950 transition-[width] delay-500 duration-[1600ms] ease-[var(--ease-lux)] group-[.is-visible]:w-[68%]" />
            <div className="absolute top-1/2 left-0 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[linear-gradient(145deg,#ffffff,#a9a9a9_55%,#e5e5e5)] shadow-[0_4px_14px_rgba(0,0,0,0.3)] transition-[left] delay-500 duration-[1600ms] ease-[var(--ease-lux)] group-[.is-visible]:left-[68%]" />
          </div>
          <div className="mt-2 flex justify-between text-[0.7rem] text-ink-600">
            <span>Nästan som ny</span>
            <span>Behöver omsorg</span>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 border-t border-ink-950/10 pt-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-950 text-white">
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
          </span>
          <p className="text-sm leading-snug text-ink-950">
            Ett förslag som gör skillnad – <span className="text-ink-600">inget du inte behöver.</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ---- 04: phone booking mock-up -----------------------------------------------------

const DAYS = [
  ['Mån', '3'],
  ['Tis', '4'],
  ['Ons', '5'],
  ['Tor', '6'],
  ['Fre', '7'],
];
const TIMES: [string, 'free' | 'taken' | 'picked'][] = [
  ['08:00', 'taken'],
  ['08:30', 'free'],
  ['09:00', 'free'],
  ['10:00', 'picked'],
  ['10:30', 'free'],
  ['11:00', 'taken'],
  ['13:00', 'free'],
  ['13:30', 'free'],
  ['14:00', 'free'],
];

function PhoneMockup() {
  return (
    <div className="relative flex h-[340px] justify-center overflow-hidden sm:h-[380px] lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[52%]">
      {/* glow */}
      <div className="absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 translate-y-1/3 rounded-full bg-white/10 blur-3xl" />
      {/* phone */}
      <div className="relative mt-2 h-[470px] w-[236px] rounded-[2.4rem] border border-white/20 bg-gradient-to-b from-[#2a2a2a] to-[#0c0c0c] p-[7px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-[1200ms] ease-[var(--ease-lux)] group-hover:-translate-y-2 lg:mt-10">
        <div className="relative h-full overflow-hidden rounded-[2rem] bg-ink-950">
          <div className="absolute top-2 left-1/2 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
          <div className="px-4 pt-10">
            <p className="font-display text-xl font-semibold text-white">Välj tid</p>
            <p className="text-[0.6rem] tracking-[0.18em] text-silver-500 uppercase">Biltvätt · ca 2 tim</p>
            <div className="mt-4 grid grid-cols-5 gap-1">
              {DAYS.map(([d, n], i) => (
                <div key={d} className={cx('flex flex-col items-center py-1.5', i === 2 ? 'bg-white text-ink-950' : 'border border-white/10 text-white')}>
                  <span className="text-[0.5rem] font-semibold tracking-[0.12em] uppercase">{d}</span>
                  <span className="font-display text-base leading-none font-semibold">{n}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1">
              {TIMES.map(([t, s]) => (
                <span
                  key={t}
                  className={cx(
                    'flex h-8 items-center justify-center text-[0.65rem] font-semibold tabular-nums',
                    s === 'picked' && 'bg-gradient-to-br from-white via-silver-200 to-silver-400 text-ink-950 shadow-[0_0_18px_-4px_rgba(255,255,255,0.7)]',
                    s === 'free' && 'border border-silver-300/50 text-white',
                    s === 'taken' && 'bg-ink-800 text-silver-400 line-through',
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-4 flex h-9 items-center justify-center bg-gradient-to-b from-[#f4f4f4] to-[#bdbdbd] text-[0.6rem] font-semibold tracking-[0.2em] text-ink-950 uppercase">
              Bekräfta bokning
            </div>
          </div>
        </div>
      </div>

      {/* floating confirmation ticket */}
      <div className="phone-ticket absolute top-[56%] left-1/2 w-[200px] -translate-x-[78%] border border-white/15 bg-ink-900/90 p-3.5 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-ink-950">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
          <div>
            <p className="text-[0.55rem] font-semibold tracking-[0.2em] text-silver-400 uppercase">Tid reserverad</p>
            <p className="font-display text-lg leading-none font-semibold tracking-[0.1em] text-metal">CB-7K4M2Q</p>
          </div>
        </div>
        <p className="mt-2.5 border-t border-white/10 pt-2 text-[0.62rem] text-silver-400">Ons 5 · 10:00 – 16:00</p>
      </div>
    </div>
  );
}

// ---- Section --------------------------------------------------------------------------

export function WhyUs() {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} aria-labelledby="varfor-title" className="on-light relative overflow-hidden bg-silver-50 py-24 text-ink-950 sm:py-32">
      {/* oversized outlined word */}
      <p
        aria-hidden
        className="font-display pointer-events-none absolute -top-6 right-5 text-[clamp(6rem,16vw,16rem)] sm:right-10 leading-none font-semibold text-transparent select-none [-webkit-text-stroke:1px_rgba(0,0,0,0.07)]"
      >
        Detalj
      </p>

      <div className="container-lux relative">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="varfor-title"
            light
            eyebrow="Varför Crescor"
            title={
              <>
                Skillnaden sitter <br />i <span className="text-metal-dark">detaljerna.</span>
              </>
            }
          />
          <p className="reveal max-w-md text-base leading-relaxed text-ink-600 sm:text-lg">
            Bilvård handlar om mer än en ren yta. Det handlar om omsorg, tålamod och respekt för både bilen och din tid.
          </p>
        </div>

        <ul className="mt-14 grid gap-5 lg:grid-cols-12">
          <Card
            index="01"
            title="Noggrant utfört arbete"
            text="Vi tar oss den tid arbetet kräver. Varje moment görs metodiskt, med rätt teknik och rätt produkter för ytan."
            className="lg:col-span-7"
            mockupClassName="relative flex flex-1 flex-col justify-center"
          >
            <ProcessMockup />
          </Card>

          <Card
            index="02"
            title="Fokus på detaljer"
            text="Skarvar, lister, ventiler och fälgar – det är i detaljerna skillnaden mellan ren och verkligt välvårdad syns."
            className="lg:col-span-5"
          >
            <DetailLoupe />
          </Card>

          <Card
            index="03"
            title="Anpassad bilvård"
            text="Ingen bil är den andra lik. Vi utgår från bilens skick och dina önskemål och föreslår det som faktiskt gör skillnad."
            tone="light"
            className="lg:col-span-5"
          >
            <TailorMockup />
          </Card>

          <Card
            index="04"
            title="Smidig tidsbokning"
            text="Se lediga tider och boka direkt online, när det passar dig. Du får ett bokningsnummer direkt på skärmen."
            className="lg:col-span-7 lg:min-h-[480px]"
            bodyClassName="lg:max-w-[48%]"
            mockupClassName="mt-auto lg:mt-0"
            cta={
              <a href="#boka" className="btn btn-metal btn-sm">
                Se lediga tider
              </a>
            }
          >
            <PhoneMockup />
          </Card>
        </ul>
      </div>
    </section>
  );
}
