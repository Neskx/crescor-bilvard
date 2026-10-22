// Location options shared by the booking flow and the admin dashboard.
//   workshop          Lämna bilen
//   pickup            Vi hämtar bilen
//   customer_address  Tvätt på plats

import type { LocationType, PublicSettings, Service } from '../types';

export const LOCATION_LABEL: Record<LocationType, string> = {
  workshop: 'Lämna bilen',
  pickup: 'Vi hämtar bilen',
  customer_address: 'Tvätt på plats',
};

export const DEFAULT_PICKUP_INFO =
  'Vi kontaktar dig på telefonnumret du anger i nästa steg för att bekräfta när bilen hämtas och när den lämnas tillbaka. Den tid du väljer i kalendern är när arbetet påbörjas.';

/** Fee for a location, or null when none is configured. */
export function locationFee(settings: PublicSettings, t: LocationType | null): number | null {
  const fee = t === 'pickup' ? settings.pickup_fee : t === 'customer_address' ? settings.mobile_fee : null;
  return fee === null || fee === undefined ? null : Number(fee);
}

/** Whether the location is switched on for online booking, and offered for the service. */
export function locationAvailable(settings: PublicSettings, service: Service | null, t: LocationType): { enabled: boolean; allowed: boolean } {
  const enabled = t === 'workshop' ? settings.workshop_available : t === 'pickup' ? Boolean(settings.pickup_available) : settings.mobile_available;
  const allowed = t === 'workshop' ? service?.allow_workshop !== false : t === 'pickup' ? service?.allow_pickup !== false : service?.allow_mobile !== false;
  return { enabled, allowed };
}
