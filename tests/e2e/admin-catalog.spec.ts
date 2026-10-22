import { expect, test, type Page } from '@playwright/test';
import {
  adminLogin,
  bookUpToSummary,
  booking,
  cleanupServicesAndAddons,
  confirmDialog,
  createAddon,
  createService,
  editRow,
  ensureAdmin,
  expectToast,
  goAdmin,
  kr,
  row,
  saveForm,
  slugOf,
  submitBooking,
  uniqueName,
  openBooking,
} from './adminHelpers';
import { uniqueEmail } from './helpers';

// Services, prices and add-ons: every change made in the admin must show up on the public site,
// and bookings that already exist must keep the price they were made with.

test.describe.configure({ mode: 'serial' });

/** Ticks or unticks an add-on in the booking flow (the draft survives reloads, so don't assume its state). */
async function setAddon(page: Page, name: string, on: boolean) {
  const box = booking(page).getByRole('checkbox', { name: new RegExp(name) });
  if ((await box.getAttribute('aria-checked')) !== String(on)) await box.click();
  await expect(box).toHaveAttribute('aria-checked', String(on));
}

test.describe('Admin – services & prices', () => {
  test.setTimeout(120_000);
  test.afterEach(async ({ page }) => cleanupServicesAndAddons(page));

  test('create, validate, re-price, deactivate and delete a service — the public site follows every change', async ({ page }) => {
    const name = uniqueName('Paket');
    await adminLogin(page);
    await goAdmin(page, 'Tjänster & priser');
    await expect(page.getByRole('heading', { name: 'Tjänster & priser' })).toBeVisible();

    // ---- Validation ----
    await page.getByRole('button', { name: 'Ny tjänst' }).click();
    await saveForm(page);
    await expect(page.getByText('Ange ett namn.')).toBeVisible();
    await page.locator('#sv-name').fill(name);
    await page.locator('#sv-ptype').selectOption('fixed');
    await saveForm(page);
    await expect(page.getByText(/Ange ett giltigt pris/)).toBeVisible();
    await page.locator('#sv-price').fill('799');
    await page.locator('#sv-dur').fill('5');
    await saveForm(page);
    await expect(page.getByText('Tiden måste vara mellan 15 och 720 minuter.')).toBeVisible();
    await page.locator('#sv-dur').fill('90');
    await page.locator('#sv-features').fill(Array.from({ length: 16 }, (_, i) => `Punkt ${i + 1}`).join('\n'));
    await saveForm(page);
    await expect(page.getByText(/Högst 15 punkter/)).toBeVisible();

    // ---- Create ----
    await page.locator('#sv-features').fill('Utvändig E2E-tvätt\nInvändig E2E-dammsugning');
    await page.locator('#sv-tagline').fill('E2E-bas');
    await page.locator('#sv-durtext').fill('2–3 timmar');
    await saveForm(page);
    await expectToast(page, 'Tjänsten är sparad.');
    await expect(row(page, name)).toContainText(kr(799));

    // A second service with the same name is refused
    await page.getByRole('button', { name: 'Ny tjänst' }).click();
    await page.locator('#sv-name').fill(name);
    await saveForm(page);
    await expect(page.getByText('Det finns redan en tjänst med samma namn/slug.')).toBeVisible();
    await page.getByRole('button', { name: 'Avbryt' }).click();

    // ---- Public: detail page, package list and booking all show 799 kr ----
    await page.goto(`/tjanster/${slugOf(name)}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
    await expect(page.getByText(kr(799)).first()).toBeVisible();
    await expect(page.getByText('Utvändig E2E-tvätt')).toBeVisible();

    await page.goto('/');
    const card = page.locator('#tjanster article', { hasText: name });
    await expect(card).toContainText(kr(799));
    await expect(card).toContainText('ca 2–3 timmar');
    await expect(card).toContainText('E2E-bas');
    await expect(card).toContainText('Invändig E2E-dammsugning');
    await expect(page.locator('#tjanster').getByRole('button', { name: /Boka denna tjänst/ })).toHaveCount(4);
    await page.goto('/#boka');
    await expect(booking(page).getByRole('radio', { name: new RegExp(`^${name}`) })).toContainText(kr(799));

    // ---- Re-price: fixed → "from" ----
    await page.goto('/admin/tjanster');
    await editRow(page, name);
    await page.locator('#sv-price').fill('899');
    await page.locator('#sv-ptype').selectOption('from');
    await saveForm(page);
    await expectToast(page, 'Tjänsten är sparad.');
    await expect(row(page, name)).toContainText(/Från 899\skr/);
    await page.goto(`/tjanster/${slugOf(name)}`);
    await expect(page.getByText(/Från 899\skr/).first()).toBeVisible();
    await expect(page.getByText(kr(799))).toHaveCount(0);

    // ---- Re-price: on request (the amount is locked and dropped) ----
    await page.goto('/admin/tjanster');
    await editRow(page, name);
    await page.locator('#sv-ptype').selectOption('on_request');
    await expect(page.locator('#sv-price')).toBeDisabled();
    await saveForm(page);
    await expectToast(page, 'Tjänsten är sparad.');
    await expect(row(page, name)).toContainText('Pris enligt offert');
    await page.goto('/');
    await expect(page.locator('#tjanster article', { hasText: name })).toContainText('Pris enligt offert');

    // ---- Re-price: back to a fixed price ----
    await page.goto('/admin/tjanster');
    await editRow(page, name);
    await page.locator('#sv-ptype').selectOption('fixed');
    await page.locator('#sv-price').fill('1250');
    await saveForm(page);
    await expect(row(page, name)).toContainText(kr(1250));
    await page.goto('/');
    await expect(page.locator('#tjanster article', { hasText: name })).toContainText(kr(1250));

    // ---- Deactivate: gone from the site, still in the admin ----
    await page.goto('/admin/tjanster');
    await editRow(page, name);
    await page.getByRole('switch', { name: /^Aktiv/ }).uncheck({ force: true });
    await saveForm(page);
    await expectToast(page, 'Tjänsten är sparad.');
    await expect(row(page, name)).toContainText('INAKTIV');
    await page.goto('/');
    await expect(page.locator('#tjanster').getByRole('button', { name: /Boka denna tjänst/ })).toHaveCount(3);
    await expect(page.locator('#tjanster article', { hasText: name })).toHaveCount(0);
    await page.goto('/#boka');
    await expect(booking(page).getByRole('radio', { name: /^Enkel Tvätt/ })).toBeVisible();
    await expect(booking(page).getByRole('radio', { name: new RegExp(`^${name}`) })).toHaveCount(0);

    // ---- Reactivate ----
    await page.goto('/admin/tjanster');
    await editRow(page, name);
    await page.getByRole('switch', { name: /^Aktiv/ }).check({ force: true });
    await saveForm(page);
    await expect(row(page, name)).not.toContainText('INAKTIV');

    // ---- Delete: cancelling keeps it, confirming removes it ----
    await page.getByRole('button', { name: `Ta bort ${name}` }).click();
    await confirmDialog(page, 'Avbryt');
    await expect(row(page, name)).toBeVisible();
    await page.getByRole('button', { name: `Ta bort ${name}` }).click();
    await confirmDialog(page, 'Ta bort');
    await expectToast(page, 'Tjänsten är borttagen.');
    await expect(row(page, name)).toHaveCount(0);
    await page.goto('/');
    await expect(page.locator('#tjanster article', { hasText: name })).toHaveCount(0);
  });

  test('highlighting a service and changing its sort order are reflected on the site', async ({ page }) => {
    const name = uniqueName('Ordning');
    await adminLogin(page);
    await createService(page, { name, price: 300 });

    // Sort order 1 → first package on the home page
    await editRow(page, name);
    await page.locator('#sv-sort').fill('1');
    await page.getByRole('switch', { name: /^Framhävd/ }).check({ force: true });
    await saveForm(page);
    await expectToast(page, 'Tjänsten är sparad.');
    await page.goto('/');
    await expect(page.locator('#tjanster article').first()).toContainText(name);

    // Sort order 9999 → last
    await page.goto('/admin/tjanster');
    await editRow(page, name);
    await page.locator('#sv-sort').fill('9999');
    await saveForm(page);
    await expectToast(page, 'Tjänsten är sparad.');
    await page.goto('/');
    await expect(page.locator('#tjanster article').last()).toContainText(name);
  });
});

test.describe('Admin – add-ons (tillägg)', () => {
  test.setTimeout(180_000);
  test.afterEach(async ({ page }) => cleanupServicesAndAddons(page));

  test('add-on validation, prices, ordering, removing — and the booking total follows', async ({ page }) => {
    const service = uniqueName('Tillaggspaket');
    const a = uniqueName('Vax');
    const b = uniqueName('Doft');
    await adminLogin(page);
    await createService(page, { name: service, price: 999 });

    // ---- Validation ----
    await goAdmin(page, 'Tjänster & priser');
    await page.getByRole('button', { name: 'Nytt tillägg' }).click();
    await saveForm(page);
    await expect(page.getByText('Ange ett namn.')).toBeVisible();
    await page.locator('#ad-name').fill(a);
    await page.locator('#ad-price').fill('-5');
    await saveForm(page);
    await expect(page.getByText('Ange ett giltigt pris.')).toBeVisible();
    await page.getByRole('button', { name: 'Avbryt' }).click();

    // ---- Add ----
    await createAddon(page, { name: a, price: 150, description: 'Ett E2E-tillägg', sort: 5000 });
    await createAddon(page, { name: b, price: 250, sort: 5100 });
    await expect(row(page, a)).toContainText(`+150 kr`);
    await expect(row(page, b)).toContainText(`+250 kr`);

    // Duplicate names are refused
    await page.getByRole('button', { name: 'Nytt tillägg' }).click();
    await page.locator('#ad-name').fill(a);
    await saveForm(page);
    await expect(page.getByText('Det finns redan ett tillägg med samma namn/slug.')).toBeVisible();
    await page.getByRole('button', { name: 'Avbryt' }).click();

    // ---- Public price list (services page) ----
    await page.goto('/tjanster');
    const list = page.getByRole('list', { name: 'Tillägg' });
    await expect(list.getByRole('listitem').filter({ hasText: a })).toContainText(kr(150));
    await expect(list.getByRole('listitem').filter({ hasText: b })).toContainText(kr(250));
    await expect(list.getByText('Ett E2E-tillägg')).toBeVisible();

    // ---- Booking: totals follow the selection ----
    const bk = booking(page);
    const addonTotal = bk.getByText('Tillägg totalt').locator('xpath=..');
    await page.goto('/#boka');
    await bk.getByRole('radio', { name: new RegExp(`^${service}`) }).click();
    const checkboxes = bk.getByRole('group', { name: /Tillägg/ }).getByRole('checkbox');
    // Lower sort order first (the shop's own add-ons come before these)
    const names = await checkboxes.allInnerTexts();
    expect(names.findIndex((n) => n.includes(a))).toBeGreaterThanOrEqual(0);
    expect(names.findIndex((n) => n.includes(a))).toBeLessThan(names.findIndex((n) => n.includes(b)));
    await expect(addonTotal).toContainText(kr(0));

    await bk.getByRole('checkbox', { name: new RegExp(a) }).click();
    await expect(addonTotal).toContainText(kr(150));
    await expect(addonTotal).toContainText(/Totalt:\s1\s149\skr/);
    await bk.getByRole('checkbox', { name: new RegExp(b) }).click();
    await expect(addonTotal).toContainText(kr(400));
    await expect(addonTotal).toContainText(/Totalt:\s1\s399\skr/);
    await bk.getByRole('checkbox', { name: new RegExp(a) }).click(); // remove the first again
    await expect(addonTotal).toContainText(kr(250));
    await expect(addonTotal).toContainText(/Totalt:\s1\s249\skr/);

    // ---- Change a price ----
    await page.goto('/admin/tjanster');
    await editRow(page, a);
    await page.locator('#ad-price').fill('175');
    await saveForm(page);
    await expectToast(page, 'Tillägget är sparat.');
    await expect(row(page, a)).toContainText('+175 kr');
    await page.goto('/#boka');
    await bk.getByRole('radio', { name: new RegExp(`^${service}`) }).click();
    await expect(bk.getByRole('checkbox', { name: new RegExp(a) })).toContainText(kr(175));
    await setAddon(page, a, true);
    await setAddon(page, b, true);
    await expect(addonTotal).toContainText(kr(425));
    await expect(addonTotal).toContainText(/Totalt:\s1\s424\skr/);

    // ---- Re-order: give b the lowest sort number ----
    await page.goto('/admin/tjanster');
    await editRow(page, b);
    await page.locator('#ad-sort').fill('-100');
    await saveForm(page);
    await expectToast(page, 'Tillägget är sparat.');
    await page.goto('/tjanster');
    await expect(page.getByRole('list', { name: 'Tillägg' }).getByRole('listitem').first()).toContainText(b);

    // ---- Deactivate b while a customer has it selected: the choice is dropped with a notice ----
    await page.goto('/#boka');
    await bk.getByRole('radio', { name: new RegExp(`^${service}`) }).click();
    await setAddon(page, b, true);
    await page.goto('/admin/tjanster');
    await editRow(page, b);
    await page.getByRole('switch', { name: /^Aktiv/ }).uncheck({ force: true });
    await saveForm(page);
    await expectToast(page, 'Tillägget är sparat.');
    await expect(row(page, b)).toContainText('INAKTIV');
    await page.goto('/#boka');
    await expect(bk.getByText(/valda tillägg erbjuds inte längre/)).toBeVisible();
    await expect(bk.getByRole('checkbox', { name: new RegExp(b) })).toHaveCount(0);
    await expect(bk.getByRole('checkbox', { name: new RegExp(a) })).toBeVisible();
    await page.goto('/tjanster');
    await expect(page.getByRole('list', { name: 'Tillägg' }).getByText(b)).toHaveCount(0);

    // ---- Delete: cancel keeps, confirm removes ----
    await page.goto('/admin/tjanster');
    await page.getByRole('button', { name: `Ta bort ${a}` }).click();
    await confirmDialog(page, 'Avbryt');
    await expect(row(page, a)).toBeVisible();
    for (const name of [a, b]) {
      await page.getByRole('button', { name: `Ta bort ${name}` }).click();
      await confirmDialog(page, 'Ta bort');
      await expectToast(page, 'Tillägget är borttaget.');
      await expect(row(page, name)).toHaveCount(0);
    }
    await page.goto('/#boka');
    await bk.getByRole('radio', { name: new RegExp(`^${service}`) }).click();
    await expect(bk.getByRole('checkbox', { name: new RegExp(a) })).toHaveCount(0);
    await expect(bk.getByRole('checkbox', { name: new RegExp(b) })).toHaveCount(0);
    // The shop's own add-ons are untouched
    await expect(bk.getByRole('checkbox').first()).toBeVisible();
  });

  test('an existing booking keeps the add-ons and prices it was made with when the catalogue changes', async ({ page }) => {
    const a = uniqueName('Glans');
    const b = uniqueName('Lack');
    await adminLogin(page);
    await createAddon(page, { name: a, price: 100 });
    await createAddon(page, { name: b, price: 200 });

    // Customer books "Enkel Tvätt" (650 kr) with both add-ons → 950 kr
    await bookUpToSummary(page, { service: 'Enkel Tvätt', addons: [a, b], email: uniqueEmail('snapshot'), weeksAhead: 6 });
    const bk = booking(page);
    await expect(bk.getByText(a)).toBeVisible();
    await expect(bk.getByText(b)).toBeVisible();
    await expect(bk.getByText('Pris', { exact: true }).locator('xpath=following-sibling::dd[1]')).toContainText(kr(950));
    const ref = await submitBooking(page);

    // Admin shows the add-ons and the 950 kr total
    await ensureAdmin(page);
    let drawer = await openBooking(page, ref);
    await expect(drawer).toContainText(a);
    await expect(drawer).toContainText(b);
    await expect(drawer.getByText('Pris', { exact: true }).locator('xpath=following-sibling::dd[1]')).toContainText(kr(950));
    await drawer.getByRole('button', { name: 'Stäng' }).click();

    // The catalogue then changes: price up, one add-on removed
    await goAdmin(page, 'Tjänster & priser');
    await editRow(page, a);
    await page.locator('#ad-price').fill('999');
    await saveForm(page);
    await expectToast(page, 'Tillägget är sparat.');
    await page.getByRole('button', { name: `Ta bort ${b}` }).click();
    await confirmDialog(page, 'Ta bort');
    await expectToast(page, 'Tillägget är borttaget.');

    // The booking is untouched
    drawer = await openBooking(page, ref);
    await expect(drawer).toContainText(a);
    await expect(drawer).toContainText(b);
    await expect(drawer).toContainText('+100 kr');
    await expect(drawer).toContainText('+200 kr');
    await expect(drawer.getByText('Pris', { exact: true }).locator('xpath=following-sibling::dd[1]')).toContainText(kr(950));
    await drawer.getByRole('button', { name: 'Avboka' }).click();
    await confirmDialog(page, 'Avboka');
    await expect(drawer.getByText('Avbokad', { exact: true })).toBeVisible();
  });
});
