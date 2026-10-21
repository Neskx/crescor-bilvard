import { ArrowDown, ArrowRight } from 'lucide-react';

const KEYWORDS = ['Biltvätt', 'Keramiskt sprayvax', 'Fläckborttagning', 'Luktbehandling'];

export function Hero() {
  return (
    <section id="hem" aria-labelledby="hero-title" className="grain relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-ink-950">
      {/* Background photograph with a dark fallback underneath */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_70%_30%,#2b2b2b,#080808_65%)]">
        <picture>
          <source media="(min-width: 768px)" srcSet="/images/hero-desktop.webp" type="image/webp" />
          <img
            src="/images/hero-mobile.webp"
            alt=""
            fetchPriority="high"
            decoding="async"
            onError={(e) => (e.currentTarget.style.display = 'none')}
            className="h-full w-full animate-[hero-zoom_14s_var(--ease-lux)_both] object-cover object-[60%_40%] md:object-[50%_40%]"
          />
        </picture>
        {/* Legibility gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/55 to-ink-950/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/90 via-ink-950/55 to-transparent md:via-40%" />
      </div>

      <div className="container-lux flex flex-1 flex-col justify-end pt-32 pb-14 sm:pb-20 lg:pb-24">
        <p className="eyebrow animate-fade-up !text-silver-300">
          Crescor Bilvård
        </p>

        <h1
          id="hero-title"
          className="font-display mt-6 max-w-5xl text-[3.4rem] leading-[0.88] font-semibold text-white [animation-delay:120ms] animate-fade-up sm:text-8xl lg:text-[8.5rem]"
        >
          <span className="sr-only">Crescor Bilvård – </span>
          Precision <br className="hidden sm:block" />i varje <span className="text-metal">detalj.</span>
        </h1>

        <p className="mt-7 max-w-xl text-base leading-relaxed text-silver-200 [animation-delay:240ms] animate-fade-up sm:text-lg">
          Professionell bilvård för dig som vill ge din bil den uppmärksamhet den förtjänar – anpassad med de tillägg
          din bil behöver.
        </p>

        <div className="mt-10 flex flex-col gap-3 [animation-delay:360ms] animate-fade-up sm:flex-row sm:gap-4">
          <a href="#boka" className="btn btn-metal">
            Boka bilvård <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a href="#tjanster" className="btn btn-ghost">
            Utforska våra tjänster
          </a>
        </div>

        <div className="mt-14 flex items-end justify-between gap-6 border-t border-white/10 pt-6 [animation-delay:480ms] animate-fade-up sm:mt-20">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[0.68rem] font-medium tracking-[0.24em] text-silver-400 uppercase">
            {KEYWORDS.map((k, i) => (
              <li key={k} className="flex items-center gap-6">
                {i > 0 && <span aria-hidden className="hidden h-1 w-1 rotate-45 bg-silver-500 sm:block" />}
                {k}
              </li>
            ))}
          </ul>
          <a
            href="#tjanster"
            aria-label="Scrolla till tjänster"
            className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/20 text-silver-200 transition-colors hover:border-white/60 hover:text-white sm:flex"
          >
            <ArrowDown className="h-4 w-4 animate-bounce [animation-duration:2.4s]" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
