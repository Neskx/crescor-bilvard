import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import { cx } from '../lib/format';

/**
 * Floating booking CTA on small screens. Appears once the page hero has
 * scrolled away and hides while a booking section is on screen.
 */
export function MobileBookingBar() {
  const { pathname } = useLocation();
  const [pastHero, setPastHero] = useState(false);
  const [bookingVisible, setBookingVisible] = useState(false);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const hero = document.getElementById('hem') ?? document.querySelector('[data-hero]');
    const booking = document.getElementById('boka');
    const observers: IntersectionObserver[] = [];
    setPastHero(false);
    setBookingVisible(false);
    if (hero) {
      const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting), { threshold: 0.05 });
      io.observe(hero);
      observers.push(io);
    }
    if (booking) {
      const io = new IntersectionObserver(([e]) => setBookingVisible(e.isIntersecting), { threshold: 0 });
      io.observe(booking);
      observers.push(io);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [pathname]);

  const show = pastHero && !bookingVisible;
  const target = pathname === '/' ? '/#boka' : '/boka';
  return (
    <div
      aria-hidden={!show}
      className={cx(
        'fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl transition-transform duration-500 md:hidden',
        show ? 'translate-y-0' : 'pointer-events-none translate-y-full',
      )}
    >
      <Link to={target} tabIndex={show ? 0 : -1} className="btn btn-metal w-full">
        <CalendarCheck className="h-4 w-4" aria-hidden />
        Boka bilvård
      </Link>
    </div>
  );
}
