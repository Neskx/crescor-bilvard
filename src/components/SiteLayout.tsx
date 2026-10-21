import type { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { MobileBookingBar } from './MobileBookingBar';

export function SiteLayout({ children, bookingBar = true }: { children: ReactNode; bookingBar?: boolean }) {
  return (
    <>
      <Navbar />
      <main id="main">{children}</main>
      <Footer />
      {bookingBar && <MobileBookingBar />}
    </>
  );
}
