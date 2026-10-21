import { useEffect } from 'react';
import { SiteLayout } from '../components/SiteLayout';
import { Hero } from '../sections/Hero';
import { Services } from '../sections/Services';
import { WhyUs } from '../sections/WhyUs';
import { Gallery } from '../sections/Gallery';
import { About } from '../sections/About';
import { Contact } from '../sections/Contact';
import { BookingSection } from '../booking/BookingSection';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { usePageMeta } from '../hooks/usePageMeta';
import { SITE } from '../config/site';

/** Adds verified contact details to the structured data once they are configured. */
function useBusinessStructuredData() {
  const { config, live } = usePublicConfig();
  useEffect(() => {
    if (!live) return;
    const s = config.settings;
    const data: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'AutoWash',
      '@id': `${SITE.url}/#business`,
      name: s.company_name,
      url: `${SITE.url}/`,
      logo: `${SITE.url}/logo/crescor-logo.png`,
    };
    if (s.company_phone) data.telephone = s.company_phone;
    if (s.company_email) data.email = s.company_email;
    if (s.company_address) data.address = s.company_address;
    if (s.service_area_text) data.areaServed = s.service_area_text;
    if (config.services.length) {
      data.hasOfferCatalog = {
        '@type': 'OfferCatalog',
        name: 'Bilvårdstjänster',
        itemListElement: config.services.map((v) => ({
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: v.name, description: v.description, url: `${SITE.url}/tjanster/${v.slug}` },
        })),
      };
    }
    let el = document.getElementById('ld-business-live') as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'ld-business-live';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
  }, [config, live]);
}

export function HomePage() {
  useBusinessStructuredData();
  usePageMeta({
    title: 'Crescor Bilvård – Professionell biltvätt och bilvård',
    description:
      'Crescor Bilvård erbjuder professionell biltvätt med valbara tillägg som keramiskt sprayvax, fläckborttagning, luktbehandling och vattenavvisande vindruta. Boka din tid enkelt online.',
    path: '/',
  });

  return (
    <SiteLayout>
      <Hero />
      <Services />
      <WhyUs />
      <Gallery />
      <BookingSection />
      <About />
      <Contact />
    </SiteLayout>
  );
}
