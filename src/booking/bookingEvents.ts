// Lets any "Boka" button pre-select a service in the booking flow.

const EVENT = 'crescor:select-service';

/**
 * If a booking flow is on the current page, pre-selects the service and scrolls
 * to it, returning true. Returns false when there is no booking section here —
 * the caller should then navigate to /boka?tjanst=<slug>.
 */
export function requestServiceBooking(serviceId: string): boolean {
  const section = document.getElementById('boka');
  if (!section) return false;
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: serviceId }));
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

export function onServiceBookingRequest(handler: (serviceId: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
