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

/**
 * Partner logos supplied by the business, bundled in /public/partners.
 * `verified` = the name ↔ logo match is certain. Unverified logos are only
 * offered in /admin for the business to confirm; they are never auto-assigned.
 */
export const PARTNER_LOGOS: { path: string; label: string; background: 'light' | 'dark'; verified: boolean }[] = [
  { path: '/partners/greentopia.webp', label: 'Greentopia', background: 'light', verified: true },
  { path: '/partners/boxpark.webp', label: 'BoxPark', background: 'dark', verified: true },
  { path: '/partners/korpera.webp', label: 'Korpera', background: 'dark', verified: true },
  { path: '/partners/reklamx.webp', label: 'REKLAMX', background: 'light', verified: true },
  { path: '/partners/jk.webp', label: 'JK (grön) – ägare ej bekräftad', background: 'light', verified: false },
  { path: '/partners/metallotech.webp', label: 'Metallotech', background: 'light', verified: true },
];

export function serviceImage(key: string | null | undefined) {
  return SERVICE_IMAGES[key ?? ''] ?? SERVICE_IMAGES.default;
}

/**
 * Shown only if the database cannot be reached, so the marketing site still
 * renders. Mirrors supabase/migrations/*_phase2_packages_locations.sql. Never bookable.
 */
export const FALLBACK_SERVICES: Service[] = [
  {
    id: 'fallback-enkel-tvatt',
    slug: 'enkel-tvatt',
    name: 'Enkel Tvätt',
    description: 'En smidig och noggrann tvätt för dig som vill fräscha upp bilen och ge den ett välvårdat intryck.',
    duration_minutes: 120,
    duration_text: '1,5–2 timmar',
    price: 650,
    price_type: 'fixed',
    image_key: 'utvandig',
    tagline: 'Bas',
    features: ['Smidig och noggrann tvätt', 'Fräschar upp bilens intryck', 'Exakt innehåll bekräftas vid bokningen'],
    is_highlighted: false,
  },
  {
    id: 'fallback-mini-rekond',
    slug: 'mini-rekond',
    name: 'Mini Rekond',
    description:
      'En mer omfattande bilvård med extra fokus på detaljerna. Vi rengör fälgar, dammsuger kupén och arbetar noggrant med bilens invändiga ytor.',
    duration_minutes: 210,
    duration_text: '3–3,5 timmar',
    price: 1200,
    price_type: 'fixed',
    image_key: 'invandig',
    tagline: 'Mer detaljer',
    features: ['Handrengöring av fälgar', 'Dammsugning av kupén', 'Detaljrengöring med pensel', 'Noggrannare rengöring av invändiga ytor'],
    is_highlighted: false,
  },
  {
    id: 'fallback-premium-rekond',
    slug: 'premium-rekond',
    name: 'Premium Rekond',
    description:
      'För dig som vill ge bilen extra omsorg. En grundlig rekond med textilrengöring, noggrant detaljarbete och fokus på ett så välvårdat resultat som möjligt.',
    duration_minutes: 300,
    duration_text: '4,5–5 timmar',
    price: 1800,
    price_type: 'fixed',
    image_key: 'helrekond',
    tagline: 'Mest omfattande',
    features: ['Allt som ingår i Mini Rekond', 'Textilrengöring av klädsel', 'Grundligare detaljarbete', 'Extra fokus på finish och renhet', 'Omfattande invändig behandling'],
    is_highlighted: true,
  },
];

/** Old service URLs that now belong to a renamed service. */
export const LEGACY_SERVICE_SLUGS: Record<string, string> = { biltvatt: 'enkel-tvatt' };

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
