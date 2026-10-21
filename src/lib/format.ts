import type { PriceType } from '../types';

export function formatPrice(price: number | null | undefined, type: PriceType): string | null {
  if (type === 'on_request' || price === null || price === undefined || Number.isNaN(Number(price))) return null;
  const amount = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Number(price));
  return type === 'from' ? `Från ${amount} kr` : `${amount} kr`;
}

/** "100 kr" — a plain amount in Swedish format. */
export function formatAmount(value: number): string {
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Number(value))} kr`;
}

/**
 * Price of a service plus chosen add-ons. Returns null when nothing can be
 * stated (service priced on request and no add-ons).
 */
export function formatTotal(price: number | null | undefined, type: PriceType, addonsTotal: number): string | null {
  const extras = Number(addonsTotal) || 0;
  if (type === 'on_request' || price === null || price === undefined || Number.isNaN(Number(price))) {
    return extras > 0 ? `Tjänsten enligt offert + tillägg ${formatAmount(extras)}` : null;
  }
  return formatPrice(Number(price) + extras, type);
}

/** tel: link target from a human-formatted phone number. */
export function telHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return `tel:${cleaned}`;
}

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
