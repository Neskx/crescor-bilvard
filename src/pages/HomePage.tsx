import { useEffect } from 'react';
import { SiteLayout } from '../components/SiteLayout';
import { Hero } from '../sections/Hero';
import { Services } from '../sections/Services';
import { WhyUs } from '../sections/WhyUs';
import { Gallery } from '../sections/Gallery';
import { About } from '../sections/About';
import { Contact } from '../sections/Contact';
import { Charity } from '../sections/Charity';
import { Partners } from '../sections/Partners';
import { Reviews } from '../sections/Reviews';
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
          // Prices only when configured. No ratings are ever added to structured data.
          ...(v.price !== null && v.price_type !== 'on_request'
            ? { price: Number(v.price), priceCurrency: 'SEK', ...(v.price_type === 'from' ? { priceSpecification: { '@type': 'PriceSpecification', minPrice: Number(v.price), priceCurrency: 'SEK' } } : {}) }
            : {}),
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
    title: 'Crescor Bilvård – Biltvätt och rekond: Enkel Tvätt, Mini Rekond och Premium Rekond',
    description:
      'Professionell bilvård i tre paket – Enkel Tvätt, Mini Rekond och Premium Rekond. Lämna bilen hos oss, låt oss hämta den eller boka tvätt på plats. Boka din tid enkelt online.',
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
      <Charity />
      <Partners />
      <Reviews />
      <Contact />
    </SiteLayout>
  );
}
