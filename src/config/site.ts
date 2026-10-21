// Static, build-time site configuration.
//
// Business facts (phone, e-mail, address, opening hours, prices, services) are
// NOT configured here: they live in the database and are edited in /admin, so
// the site never shows invented information.

import type { Addon, PublicSettings, Service } from '../types';

export const SITE = {
  name: 'Crescor Bilvård',
  url: (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '') ?? '',
  turnstileSiteKey: (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '',
};

/** Images per service `image_key`. Unknown keys fall back to `default`. */
export const SERVICE_IMAGES: Record<string, { src: string; alt: string }> = {
  invandig: { src: '/images/service-invandig.webp', alt: 'Ren bilinteriör med svarta skinnsäten och ratt' },
  utvandig: { src: '/images/service-utvandig.webp', alt: 'Svart bil täckt av tvättskum under handtvätt' },
  helrekond: { src: '/images/service-helrekond.webp', alt: 'Mattsvart sportbil i en ljus verkstadslokal' },
  polering: { src: '/images/service-polering.webp', alt: 'Bilvårdare som maskinpolerar lacken på en svart bil' },
  kladsel: { src: '/images/service-kladsel.webp', alt: 'Rengöring av instrumentbräda med pensel' },
  special: { src: '/images/service-special.webp', alt: 'Däck och fälg rengörs med borste' },
  default: { src: '/images/service-helrekond.webp', alt: 'Välvårdad bil' },
};

export function serviceImage(key: string | null | undefined) {
  return SERVICE_IMAGES[key ?? ''] ?? SERVICE_IMAGES.default;
}

/**
 * Shown only if the database cannot be reached, so the marketing site still
 * renders. Mirrors supabase/migrations/*_single_service_and_addons.sql. Never bookable.
 */
export const FALLBACK_SERVICES: Service[] = [
  {
    id: 'fallback-biltvatt',
    slug: 'biltvatt',
    name: 'Biltvätt',
    description:
      'Platshållare – beskrivningen av tjänsten uppdateras inom kort. Välj gärna tillägg för att anpassa behandlingen efter din bil.',
    duration_minutes: 0,
    price: null,
    price_type: 'on_request',
    image_key: 'utvandig',
  },
];

export const FALLBACK_ADDONS: Addon[] = (
  [
    ['djurhar', 'Borttagning av djurhår', 'Noggrann borttagning av djurhår från säten, mattor och klädsel.', 100],
    ['keramiskt-sprayvax', 'Keramiskt sprayvax', 'Ger lacken extra glans och ett skyddande, vattenavvisande lager.', 100],
    ['flackborttagning', 'Fläckborttagning', 'Behandling av enskilda fläckar i klädsel och mattor.', 50],
    ['vattenavvisande-vindruta', 'Vattenavvisande vindruta', 'Behandling som får regnvatten att pärla av för bättre sikt.', 50],
    ['luktbehandling', 'Luktbehandling', 'Neutraliserar dålig lukt i kupén.', 100],
    ['extra-smutsig-bil', 'Extra smutsig bil', 'Tillägg när bilen är extra smutsig och kräver mer arbete.', 150],
  ] as const
).map(([slug, name, description, price]) => ({ id: `fallback-${slug}`, slug, name, description, price }));

export const FALLBACK_SETTINGS: PublicSettings = {
  company_name: 'Crescor Bilvård',
  company_phone: null,
  company_email: null,
  company_address: null,
  opening_hours_text: null,
  service_area_text: null,
  org_number: null,
  timezone: 'Europe/Stockholm',
  booking_enabled: false,
  workshop_available: false,
  mobile_available: false,
  auto_confirm: false,
  booking_notice_hours: 24,
  booking_horizon_days: 60,
};

/**
 * Before/after gallery.
 *
 * IMPORTANT: Only add real customer work here. Until then, `GALLERY_IS_DEMO`
 * keeps every item clearly labelled as demonstration material, so stock photos
 * are never presented as completed jobs. Replace the images (same paths or new
 * ones in /public/images/gallery) and set GALLERY_IS_DEMO = false.
 */
export const GALLERY_IS_DEMO = true;

export interface GalleryItem {
  id: string;
  title: string;
  before: string;
  after: string;
  alt: string;
}

export const GALLERY: GalleryItem[] = [
  { id: 'g1', title: 'Interiör', before: '/images/gallery-demo-1.webp', after: '/images/gallery-demo-1.webp', alt: 'Bilinteriör med ratt och instrumentbräda' },
  { id: 'g2', title: 'Strålkastare & front', before: '/images/gallery-demo-2.webp', after: '/images/gallery-demo-2.webp', alt: 'Arbete på strålkastare och front' },
  { id: 'g3', title: 'Lack & krom', before: '/images/gallery-demo-3.webp', after: '/images/gallery-demo-3.webp', alt: 'Blank lack och kromdetaljer på en klassisk bil' },
];
