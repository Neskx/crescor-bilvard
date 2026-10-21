import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Logo } from './logo/Logo';
import { cx } from '../lib/format';

export const NAV_LINKS = [
  { to: '/', label: 'Hem' },
  { to: '/tjanster', label: 'Våra tjänster' },
  { to: '/boka', label: 'Boka tid' },
  { to: '/om-oss', label: 'Om oss' },
  { to: '/kontakt', label: 'Kontakt' },
];

export function Navbar() {
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  // Mobile menu: lock scroll, close on Escape, trap focus, restore focus on close.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const toggle = toggleRef.current;
    const focusables = () =>
      Array.from(menuRef.current?.querySelectorAll<HTMLElement>('a, button') ?? []).filter((el) => !el.hasAttribute('disabled'));
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key === 'Tab') {
        const items = [toggle, ...focusables()].filter(Boolean) as HTMLElement[];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      toggle?.focus();
    };
  }, [open]);

  return (
    <>
      <header
        className={cx(
          'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500',
          scrolled || open
            ? 'border-b border-white/[0.07] bg-ink-950/85 backdrop-blur-xl'
            : 'border-b border-transparent bg-gradient-to-b from-black/60 to-transparent',
        )}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:bg-white focus:px-4 focus:py-2 focus:text-ink-950"
        >
          Hoppa till innehållet
        </a>
        <nav aria-label="Huvudmeny" className="container-lux flex h-[72px] items-center justify-between gap-6">
          <Link to="/" aria-label="Crescor Bilvård – till startsidan" className="shrink-0">
            <Logo priority className="h-11 w-auto sm:h-12" />
          </Link>

          <ul className="hidden items-center gap-9 lg:flex">
            {NAV_LINKS.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  end={l.to === '/'}
                  className={({ isActive }) =>
                    cx(
                      'group relative py-2 text-[0.72rem] font-medium tracking-[0.22em] uppercase transition-colors hover:text-white',
                      isActive ? 'text-white' : 'text-silver-300',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {l.label}
                      <span
                        aria-hidden
                        className={cx(
                          'absolute inset-x-0 -bottom-0.5 h-px origin-left bg-gradient-to-r from-white to-silver-500 transition-transform duration-500 group-hover:scale-x-100',
                          isActive ? 'scale-x-100' : 'scale-x-0',
                        )}
                      />
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <Link to={onHome ? '/#boka' : '/boka'} className="btn btn-metal btn-sm hidden sm:inline-flex">
              Boka bilvård
            </Link>
            <button
              ref={toggleRef}
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center border border-white/15 text-white lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? 'Stäng menyn' : 'Öppna menyn'}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile menu — rendered outside <header>: its backdrop-filter would
          otherwise become the containing block for this fixed element. */}
      <div id="mobile-menu" ref={menuRef} hidden={!open} className="fixed inset-x-0 top-[72px] bottom-0 z-50 overflow-y-auto bg-ink-950 lg:hidden">
        <div className="container-lux flex min-h-full flex-col pt-6 pb-10">
          <ul className="flex flex-col">
            {NAV_LINKS.map((l, i) => (
              <li key={l.to} className="border-b border-white/[0.07]">
                <NavLink
                  to={l.to}
                  end={l.to === '/'}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cx('font-display flex items-baseline gap-5 py-5 text-4xl font-semibold', isActive ? 'text-white' : 'text-silver-200')
                  }
                >
                  <span className="font-sans text-xs tracking-[0.2em] text-silver-500">0{i + 1}</span>
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <Link to="/boka" onClick={() => setOpen(false)} className="btn btn-metal mt-10 w-full">
            Boka bilvård
          </Link>
          <Logo className="mx-auto mt-auto h-auto w-48 pt-12 opacity-60" title="" />
        </div>
      </div>
    </>
  );
}
