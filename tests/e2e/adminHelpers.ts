import { expect, type Locator, type Page } from '@playwright/test';
import { adminLogin, chooseWorkshop, fillDetails, firstFreeSlot } from './helpers';

/** Everything the admin tests create is named "E2E …" so a failed run can always be cleaned up. */
export const E2E = 'E2E';
export const uniqueName = (tag: string) => `${E2E} ${tag} ${Date.now().toString().slice(-7)}`;
export const slugOf = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** "1 399 kr" as formatted by sv-SE (the space may be a non-breaking one, \s matches both). */
export const kr = (n: number) => new RegExp(`${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\\s')}\\skr`);

export const adminNav = (page: Page) => page.getByRole('navigation', { name: 'Administration' });

export async function goAdmin(page: Page, link: string) {
  // Prefix match: the Bokningar link carries a "N väntar på bekräftelse" badge in its name.
  // Coming back from the public site (or a reload that is still loading): get into the admin first.
  if (!(await adminNav(page).isVisible())) await ensureAdmin(page);
  const prefix = new RegExp(`^${link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  await adminNav(page).getByRole('link', { name: prefix }).click();
}

export const booking = (page: Page) => page.locator('#boka');

/** A list row ("li") in the admin that contains the given text. */
export const row = (page: Page, text: string): Locator => page.locator('main li', { hasText: text });

/**
 * Waits for a toast with this text, then dismisses it so the next toast with the same text
 * can't be mistaken for it (toasts stay on screen for 5 s and stack up).
 */
export async function expectToast(page: Page, text: string | RegExp) {
  const toast = page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: text }).last();
  await expect(toast).toBeVisible();
  // dispatchEvent: while the booking drawer (a modal <dialog>) is open it covers the toast area.
  await toast.getByRole('button', { name: 'Stäng' }).dispatchEvent('click');
}

export async function confirmDialog(page: Page, label: string) {
  // The confirm dialog is the only <dialog> without an aria-label (the booking drawer is labelled).
  await page.locator('dialog[open]:not([aria-label])').getByRole('button', { name: label, exact: true }).click();
}

/** A future date (YYYY-MM-DD) far enough ahead that repeated runs rarely collide. */
export function randomFutureDate(minDays = 120, spread = 500) {
  const d = new Date(Date.now() + (minDays + Math.floor(Math.random() * spread)) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// ---- Services & add-ons ---------------------------------------------------------------------

export async function createService(
  page: Page,
  s: { name: string; price?: number; type?: 'fixed' | 'from' | 'on_request'; minutes?: number; features?: string[] },
) {
  await goAdmin(page, 'Tjänster & priser');
  await page.getByRole('button', { name: 'Ny tjänst' }).click();
  await page.locator('#sv-name').fill(s.name);
  await page.locator('#sv-desc').fill('Skapad av automatiska tester.');
  if (s.features) await page.locator('#sv-features').fill(s.features.join('\n'));
  await page.locator('#sv-dur').fill(String(s.minutes ?? 90));
  await page.locator('#sv-ptype').selectOption(s.type ?? 'fixed');
  if ((s.type ?? 'fixed') !== 'on_request') await page.locator('#sv-price').fill(String(s.price ?? 500));
  await page.getByRole('button', { name: 'Spara', exact: true }).click();
  await expectToast(page, 'Tjänsten är sparad.');
  await expect(row(page, s.name)).toBeVisible();
}

export async function createAddon(page: Page, a: { name: string; price: number; description?: string; sort?: number }) {
  await goAdmin(page, 'Tjänster & priser');
  await page.getByRole('button', { name: 'Nytt tillägg' }).click();
  await page.locator('#ad-name').fill(a.name);
  if (a.description) await page.locator('#ad-desc').fill(a.description);
  await page.locator('#ad-price').fill(String(a.price));
  if (a.sort !== undefined) await page.locator('#ad-sort').fill(String(a.sort));
  await page.getByRole('button', { name: 'Spara', exact: true }).click();
  await expectToast(page, 'Tillägget är sparat.');
  await expect(row(page, a.name)).toBeVisible();
}

/** Opens the edit form of the row holding `text`. */
export async function editRow(page: Page, text: string) {
  await row(page, text).getByRole('button', { name: 'Redigera' }).click();
}

export async function saveForm(page: Page) {
  await page.getByRole('button', { name: 'Spara', exact: true }).click();
}

/** Logs in unless the browser already has an admin session (used by cleanup hooks). */
export async function ensureAdmin(page: Page) {
  await page.goto('/admin/oversikt');
  const heading = page.getByRole('heading', { name: 'Översikt' });
  const login = page.getByRole('heading', { name: 'Logga in' });
  await expect(heading.or(login)).toBeVisible();
  if (await login.isVisible()) await adminLogin(page);
}

/** Deletes every leftover "E2E …" item on a list page (services/add-ons, partners, causes). */
async function deleteAllE2E(page: Page, route: string, deleteLabel: RegExp) {
  await ensureAdmin(page);
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  for (let i = 0; i < 30; i++) {
    const btn = page.getByRole('button', { name: deleteLabel }).first();
    if (!(await btn.isVisible().catch(() => false))) return;
    await btn.click();
    await confirmDialog(page, 'Ta bort');
    await page.waitForTimeout(400);
  }
}

export async function cleanupServicesAndAddons(page: Page) {
  await deleteAllE2E(page, '/admin/tjanster', /^Ta bort E2E /);
}
export async function cleanupPartners(page: Page) {
  await deleteAllE2E(page, '/admin/partners', /^Ta bort E2E /);
}
export async function cleanupCharities(page: Page) {
  await ensureAdmin(page);
  await page.goto('/admin/valgorenhet');
  await expect(page.getByRole('heading', { name: 'Kundernas val' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Donations first: a cause with gifts cannot be removed.
  for (let i = 0; i < 20; i++) {
    const del = page.getByRole('button', { name: 'Ta bort gåvan' }).first();
    if (!(await del.isVisible().catch(() => false))) break;
    const label = await del.locator('xpath=ancestor::li').innerText();
    if (!label.includes(E2E)) break;
    await del.click();
    await confirmDialog(page, 'Ta bort');
    await page.waitForTimeout(400);
  }
  for (let i = 0; i < 20; i++) {
    const btn = page.getByRole('button', { name: /^Ta bort E2E /i }).first();
    if (!(await btn.isVisible().catch(() => false))) return;
    await btn.click();
    await confirmDialog(page, 'Ta bort');
    await page.waitForTimeout(400);
  }
}

// ---- Customer booking ----------------------------------------------------------------------------

/** Opens the public booking form with no leftover draft (the draft lives in sessionStorage). */
export async function freshBooking(page: Page) {
  // Let the app finish loading (it re-saves the draft while it repairs it against the live
  // configuration), wipe the draft, and only then open the form on a fresh page load.
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('about:blank');
  await page.goto('/#boka');
  await expect(booking(page).getByRole('radiogroup', { name: 'Tjänster' })).toBeVisible();
}

/**
 * Runs the public booking flow up to the summary (workshop, first free slot).
 * Returns once "Sammanfattning" is visible; call `submitBooking` to finish.
 */
export async function bookUpToSummary(
  page: Page,
  o: {
    service: string;
    addons?: string[];
    weeksAhead?: number;
    email: string;
    charity?: string;
    /** Default: the workshop. Pickup / on-site need an address. */
    location?: { type: 'pickup' | 'customer_address'; address: string; postalCode: string; city: string };
  },
) {
  const b = booking(page);
  await freshBooking(page);
  await b.getByRole('radio', { name: new RegExp(`^${o.service}`) }).click();
  for (const a of o.addons ?? []) await b.getByRole('checkbox', { name: new RegExp(a) }).click();
  await b.getByRole('button', { name: 'Fortsätt' }).click();
  if (o.location) {
    await b.getByRole('radio', { name: o.location.type === 'pickup' ? /^Vi hämtar bilen/ : /^Tvätt på plats/ }).click();
    await b.locator('#bk-service_address').fill(o.location.address);
    await b.locator('#bk-service_postal_code').fill(o.location.postalCode);
    await b.locator('#bk-service_city').fill(o.location.city);
    await b.getByRole('button', { name: 'Fortsätt' }).click();
  } else {
    await chooseWorkshop(page);
  }
  await (await firstFreeSlot(page, o.weeksAhead ?? 5)).click();
  await b.getByRole('button', { name: 'Fortsätt' }).click();
  await fillDetails(page, o.email);
  await b.getByRole('button', { name: 'Fortsätt' }).click();
  // The charity step only exists while the programme is on and a cause is active.
  const charityTitle = b.getByRole('heading', { name: 'Välj ett ändamål att stödja' });
  const summaryTitle = b.getByRole('heading', { name: 'Sammanfattning' });
  await expect(charityTitle.or(summaryTitle)).toBeVisible();
  if (await charityTitle.isVisible()) {
    await b.getByRole('radio', { name: new RegExp(`^${o.charity ?? 'Inget särskilt val'}`) }).click();
    await b.getByRole('button', { name: 'Fortsätt' }).click();
  }
  await expect(summaryTitle).toBeVisible();
}

export async function submitBooking(page: Page): Promise<string> {
  const b = booking(page);
  await b.getByRole('checkbox').check();
  await b.getByRole('button', { name: /Bekräfta bokning/ }).click();
  return (await b.getByText(/^CB-[A-Z0-9]{6}$/).innerText()).trim();
}

/** Opens a booking's drawer in the admin by searching for its reference. */
export async function openBooking(page: Page, ref: string, scope: 'Kommande' | 'Alla' = 'Alla') {
  await goAdmin(page, 'Bokningar');
  await page.getByRole('button', { name: scope, exact: true }).click();
  await page.getByPlaceholder(/Sök bokningsnr/).fill(ref);
  await page.getByRole('button', { name: new RegExp(ref) }).click();
  const drawer = page.getByRole('dialog', { name: 'Bokningsdetaljer' });
  await expect(drawer.getByText(ref).first()).toBeVisible();
  // Never email the (fake) customer from tests.
  await drawer.getByLabel(/Meddela kunden via e-post/).uncheck();
  return drawer;
}

export { adminLogin };
