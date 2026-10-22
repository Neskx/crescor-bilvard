import { ApiError } from '../services/api';

/** Customer-facing Swedish messages for API error codes. */
const MESSAGES: Record<string, string> = {
  not_configured: 'Bokningssystemet är inte konfigurerat ännu. Kontakta oss direkt för att boka.',
  offline: 'Du verkar vara offline. Kontrollera din internetanslutning och försök igen – dina uppgifter finns kvar.',
  timeout: 'Det tog för lång tid att få svar från servern. Kontrollera anslutningen och försök igen.',
  network: 'Vi kunde inte nå servern. Kontrollera din internetanslutning och försök igen.',
  server_error: 'Ett tekniskt fel uppstod hos oss. Försök igen om en liten stund.',
  slot_unavailable: 'Den valda tiden är tyvärr inte längre tillgänglig. Välj en annan tid.',
  time_in_past: 'Den valda tiden har redan passerat. Välj en annan tid.',
  too_soon: 'Den valda tiden ligger för nära i tid för att kunna bokas online. Välj en senare tid.',
  too_far: 'Den valda tiden ligger för långt fram i tiden. Välj en tidigare tid.',
  outside_business_hours: 'Öppettiderna har ändrats och den valda tiden går inte längre att boka. Välj en ny tid.',
  service_unavailable: 'Den valda tjänsten går tyvärr inte att boka just nu. Välj en annan tjänst.',
  addon_unavailable: 'Ett av de tillägg du valt går inte längre att boka. Kontrollera dina val.',
  location_unavailable: 'Det valda alternativet för plats är inte längre tillgängligt. Välj ett annat.',
  postal_code_unsupported: 'Vi erbjuder tyvärr inte det valda alternativet i ditt postnummerområde. Välj ett annat alternativ eller kontakta oss.',
  charity_unavailable: 'Det ändamål du valde går inte längre att välja. Välj ett annat ändamål – dina övriga uppgifter finns kvar.',
  invalid_token: 'Länken är ogiltig. Kontrollera att du har kopierat hela länken från mejlet.',
  expired_token: 'Länken har gått ut. Kontakta oss gärna om du vill lämna en recension.',
  already_submitted: 'Du har redan lämnat en recension för det här besöket. Tack!',
  booking_disabled: 'Onlinebokningen är tillfälligt stängd. Kontakta oss gärna direkt.',
  rate_limited: 'Vi har tagit emot många förfrågningar från dig på kort tid. Vänta en stund och försök igen, eller kontakta oss direkt.',
  captcha_failed: 'Säkerhetskontrollen kunde inte verifieras. Försök igen.',
  privacy_not_accepted: 'Du behöver godkänna integritetsinformationen innan du skickar.',
  invalid_input: 'Några uppgifter behöver kompletteras. Kontrollera de markerade fälten.',
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? MESSAGES[error.kind] ?? MESSAGES.server_error;
  }
  return MESSAGES.server_error;
}
