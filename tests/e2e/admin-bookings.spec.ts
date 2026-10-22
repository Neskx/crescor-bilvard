import { expect, test, type Page } from '@playwright/test';
import {
  adminLogin,
  adminNav,
  cleanupServicesAndAddons,
  confirmDialog,
  createAddon,
  ensureAdmin,
  expectToast,
  goAdmin,
  kr,
  openBooking,
  uniqueName,
} from './adminHelpers';
import { uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

const dd = (drawer: ReturnType<Page['locator']>, label: string) => drawer.getByText(label, { exact: true }).locator('xpath=following-sibling::dd[1]');

/** A date 2–8 weeks ahead and an off-grid early-morning time, so repeated runs rarely collide. */
function oddSlot() {
  const d = new Date(Date.now() + (14 + Math.floor(Math.random() * 42)) * 86_400_000);
  const time = `0${5 + Math.floor(Math.random() * 3)}:${String(Math.floor(Math.random() * 12) * 5).padStart(2, '0')}`;
  return { date: d.toISOString().slice(0, 10), time };
}

test.describe('Admin – bookings, calendar and the booking drawer', () => {
  test.setTimeout(180_000);
  test.afterEach(async ({ page }) => cleanupServicesAndAddons(page));

  test('admin creates a booking with add-ons, then filters, edits, moves, cancels, completes and anonymises it', async ({ page }) => {
    const a = uniqueName('Hundhar');
    const b = uniqueName('Doftträd');
    const customer = uniqueName('Kund');
    const email = uniqueEmail('adminbooking');
    const slot = oddSlot();

    await adminLogin(page);
    await createAddon(page, { name: a, price: 90 });
    await createAddon(page, { name: b, price: 60 });

    // ---- Ny bokning: validation ----
    await goAdmin(page, 'Ny bokning');
    await expect(page.getByRole('heading', { name: 'Ny bokning', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Skapa bokning' }).click();
    await expect(page.getByText('Välj tjänst.')).toBeVisible();
    await expect(page.getByText('Välj tid.')).toBeVisible();

    // ---- Ny bokning: create ----
    const serviceValue = await page.locator('#nb-service_id option', { hasText: 'Enkel Tvätt' }).getAttribute('value');
    await page.locator('#nb-service_id').selectOption(serviceValue!);
    // Add-ons show their price; ticking them is part of the booking
    await expect(page.getByRole('checkbox', { name: new RegExp(`${a}.*\\+90`) })).toBeVisible();
    await page.getByRole('checkbox', { name: new RegExp(a) }).check();
    await page.getByRole('checkbox', { name: new RegExp(b) }).check();
    await page.locator('#nb-date').fill(slot.date);
    await page.locator('#nb-time').fill(slot.time);
    await page.getByLabel(/Tillåt utanför öppettider/).check();
    await page.locator('#nb-customer_name').fill(customer);
    await page.locator('#nb-customer_email').fill(email);
    await page.locator('#nb-customer_phone').fill('070-123 45 67');
    await page.locator('#nb-vehicle_information').fill('Volvo V70');
    await page.locator('#nb-registration_number').fill('abc123');
    await page.getByLabel(/Skicka bokningsbekräftelse/).uncheck();
    await page.getByRole('button', { name: 'Skapa bokning' }).click();
    const created = page.getByRole('status').filter({ hasText: /är skapad/ }).last();
    await expect(created).toBeVisible();
    const ref = (await created.innerText()).match(/CB-[A-Z0-9]{6}/)![0];
    await created.getByRole('button', { name: 'Stäng' }).dispatchEvent('click');
    // The form is reset for the next booking but add-ons are cleared
    await expect(page.locator('#nb-customer_name')).toHaveValue('');
    await expect(page.getByRole('checkbox', { name: new RegExp(a) })).not.toBeChecked();

    // ---- Bokningar: search and filters ----
    await goAdmin(page, 'Bokningar');
    await page.getByRole('button', { name: 'Alla', exact: true }).click();
    await page.getByPlaceholder(/Sök bokningsnr/).fill(ref);
    const item = page.getByRole('button', { name: new RegExp(ref) });
    await expect(item).toBeVisible();
    await expect(item).toContainText(customer);
    await expect(item).toContainText('Bekräftad');

    await page.getByLabel('Status', { exact: true }).selectOption('cancelled');
    await expect(item).toHaveCount(0);
    await page.getByLabel('Status', { exact: true }).selectOption('confirmed');
    await expect(item).toBeVisible();
    await page.getByLabel('Status', { exact: true }).selectOption('');

    await page.getByLabel('Plats', { exact: true }).selectOption('customer_address');
    await expect(item).toHaveCount(0);
    await page.getByLabel('Plats', { exact: true }).selectOption('workshop');
    await expect(item).toBeVisible();
    await page.getByLabel('Plats', { exact: true }).selectOption('');

    await page.getByLabel('Från datum').fill(slot.date);
    await page.getByLabel('Till datum').fill(slot.date);
    await expect(item).toBeVisible();
    await page.getByLabel('Till datum').fill('2020-01-01');
    await expect(item).toHaveCount(0);
    await page.getByLabel('Från datum').fill('');
    await page.getByLabel('Till datum').fill('');

    await page.getByPlaceholder(/Sök bokningsnr/).fill(customer);
    await expect(item).toBeVisible();
    await page.getByPlaceholder(/Sök bokningsnr/).fill('finns-inte-' + Date.now());
    await expect(page.getByText('Inga bokningar matchar filtret.')).toBeVisible();

    // ---- Drawer: details, price and add-ons ----
    const drawer = await openBooking(page, ref);
    await expect(drawer).toContainText('Skapad av admin');
    await expect(drawer).toContainText(customer);
    await expect(drawer).toContainText('Volvo V70');
    await expect(drawer).toContainText('Lämna bilen');
    await expect(drawer).toContainText(a);
    await expect(drawer).toContainText('+90 kr');
    await expect(drawer).toContainText(b);
    await expect(drawer).toContainText('+60 kr');
    await expect(dd(drawer, 'Pris')).toContainText(kr(800)); // 650 + 90 + 60

    // ---- Internal note ----
    const save = drawer.getByRole('button', { name: 'Spara anteckning' });
    await expect(save).toBeDisabled();
    await drawer.locator('#admin-notes').fill('E2E-anteckning: ring före leverans');
    await save.click();
    await expectToast(page, 'Anteckningen är sparad.');

    // ---- Change location → vi hämtar bilen (address is required) ----
    await drawer.getByRole('button', { name: 'Ändra plats' }).click();
    await drawer.getByRole('radio', { name: 'Vi hämtar bilen' }).check();
    await drawer.getByRole('button', { name: 'Spara plats' }).click();
    // Saving a pickup without an address is refused (error toast), nothing changes
    await expect(page.getByRole('alert').last()).toBeVisible();
    await page.getByRole('alert').last().getByRole('button', { name: 'Stäng' }).dispatchEvent('click');
    await drawer.getByLabel('Gatuadress').fill('Testgatan 1');
    await drawer.getByLabel('Postnummer').fill('21143');
    await drawer.getByLabel('Ort').fill('Malmö');
    await drawer.getByLabel('Instruktioner').fill('Nyckeln ligger i brevlådan');
    await drawer.getByRole('button', { name: 'Spara plats' }).click();
    await expectToast(page, 'Platsen är uppdaterad.');
    await expect(drawer).toContainText('Vi hämtar bilen');
    await expect(drawer).toContainText('Testgatan 1, 21143 Malmö');
    await expect(drawer).toContainText('Nyckeln ligger i brevlådan');

    // ---- Reschedule (off-grid time needs the override) ----
    await drawer.getByRole('button', { name: 'Flytta' }).click();
    await drawer.getByLabel('Ny starttid').fill('07:55');
    await drawer.getByLabel(/Tillåt utanför öppettider och tidsraster/).check();
    await drawer.getByRole('button', { name: 'Spara ny tid' }).click();
    await confirmDialog(page, 'Flytta');
    await expectToast(page, 'Bokningen är flyttad.');
    await expect(drawer).toContainText('07:55');

    // ---- Calendar shows it; the drawer opens from there ----
    await drawer.getByRole('button', { name: 'Stäng' }).click();
    await goAdmin(page, 'Kalender');
    await expect(page.getByRole('heading', { name: 'Kalender', level: 1 })).toBeVisible();
    const calendarItem = page.getByRole('button', { name: new RegExp(customer) });
    for (let i = 0; i < 10 && !(await calendarItem.isVisible()); i++) {
      await page.getByRole('button', { name: 'Nästa vecka' }).click();
      await page.waitForTimeout(500);
    }
    await expect(calendarItem).toBeVisible();
    await expect(calendarItem).toContainText('07:55');
    await page.getByRole('button', { name: 'Idag' }).click(); // back to this week
    await expect(calendarItem).toHaveCount(0);
    for (let i = 0; i < 10 && !(await calendarItem.isVisible()); i++) {
      await page.getByRole('button', { name: 'Nästa vecka' }).click();
      await page.waitForTimeout(500);
    }
    await calendarItem.click();
    const calDrawer = page.getByRole('dialog', { name: 'Bokningsdetaljer' });
    await expect(calDrawer).toContainText(ref);
    await calDrawer.getByLabel(/Meddela kunden via e-post/).uncheck();

    // ---- Cancel → reactivate → complete ----
    await calDrawer.getByRole('button', { name: 'Avboka' }).click();
    await expect(page.getByText(/Inget mejl skickas/)).toBeVisible();
    await confirmDialog(page, 'Avboka');
    await expect(calDrawer.getByText('Avbokad', { exact: true })).toBeVisible();
    await calDrawer.getByRole('button', { name: 'Återaktivera' }).click();
    await expect(calDrawer.getByText('Bekräftad', { exact: true })).toBeVisible();
    await calDrawer.getByRole('button', { name: 'Markera utförd' }).click();
    await expect(calDrawer.getByText('Utförd', { exact: true })).toBeVisible();
    await expect(calDrawer.getByRole('button', { name: 'Skicka inbjudan' })).toBeVisible();
    await expect(calDrawer.getByRole('button', { name: 'Avboka' })).toHaveCount(0);

    // ---- Anonymise (GDPR) ----
    await calDrawer.getByRole('button', { name: /Anonymisera personuppgifter/ }).click();
    await confirmDialog(page, 'Anonymisera');
    await expectToast(page, 'Personuppgifterna är borttagna.');
    await expect(calDrawer).toContainText('anonymiserade');
    await expect(calDrawer).not.toContainText(email);
    await expect(calDrawer).not.toContainText('Testgatan 1');
  });

  test('a booking that clashes with an existing one is refused', async ({ page }) => {
    const slot = oddSlot();
    await adminLogin(page);
    const make = async (name: string) => {
      await goAdmin(page, 'Ny bokning');
      const value = await page.locator('#nb-service_id option', { hasText: 'Enkel Tvätt' }).getAttribute('value');
      await page.locator('#nb-service_id').selectOption(value!);
      await page.locator('#nb-date').fill(slot.date);
      await page.locator('#nb-time').fill(slot.time);
      await page.getByLabel(/Tillåt utanför öppettider/).check();
      await page.locator('#nb-customer_name').fill(name);
      await page.locator('#nb-customer_email').fill(uniqueEmail('clash'));
      await page.locator('#nb-customer_phone').fill('070-123 45 67');
      await page.getByLabel(/Skicka bokningsbekräftelse/).uncheck();
      await page.getByRole('button', { name: 'Skapa bokning' }).click();
    };
    await make(uniqueName('Forst'));
    const ok = page.getByRole('status').filter({ hasText: /är skapad/ }).last();
    await expect(ok).toBeVisible();
    const ref = (await ok.innerText()).match(/CB-[A-Z0-9]{6}/)![0];
    await ok.getByRole('button', { name: 'Stäng' }).dispatchEvent('click');

    await make(uniqueName('Samtidigt'));
    await expect(page.getByRole('alert').filter({ hasText: /./ }).first()).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /är skapad/ })).toHaveCount(0);

    // Tidy up: cancel the first booking
    const drawer = await openBooking(page, ref);
    await drawer.getByRole('button', { name: 'Avboka' }).click();
    await confirmDialog(page, 'Avboka');
    await expect(drawer.getByText('Avbokad', { exact: true })).toBeVisible();
  });
});

test.describe('Admin – navigation, overview and messages', () => {
  test.setTimeout(120_000);

  test('every admin page opens, unknown addresses fall back to the overview, and logging out works', async ({ page }) => {
    await adminLogin(page);
    const pages: [string, string][] = [
      ['Översikt', 'Översikt'],
      ['Bokningar', 'Bokningar'],
      ['Kalender', 'Kalender'],
      ['Ny bokning', 'Ny bokning'],
      ['Meddelanden', 'Meddelanden'],
      ['Tjänster & priser', 'Tjänster & priser'],
      ['Platser & hämtning', 'Platser & hämtning'],
      ['Recensioner', 'Recensioner'],
      ['Samarbetspartners', 'Samarbetspartners'],
      ['Välgörenhet', 'Välgörenhet'],
      ['Öppettider', 'Öppettider'],
      ['Blockerade tider', 'Blockerade tider'],
      ['Inställningar', 'Inställningar'],
    ];
    for (const [link, heading] of pages) {
      await goAdmin(page, link);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0); // no load errors
    }
    await expect(adminNav(page).getByRole('link', { name: 'Inställningar' })).toHaveAttribute('aria-current', 'page');

    await page.goto('/admin/finns-inte');
    await expect(page.getByRole('heading', { name: 'Översikt', level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.getByRole('link', { name: /Sajten/ })).toHaveAttribute('href', '/');

    await page.getByRole('button', { name: 'Logga ut' }).first().click();
    await expect(page.getByRole('heading', { name: 'Logga in' })).toBeVisible();
    await page.goto('/admin/bokningar');
    await expect(page.getByRole('heading', { name: 'Logga in' })).toBeVisible();
  });

  test('overview cards link to their sections', async ({ page }) => {
    await adminLogin(page);
    const card = (label: string) => page.getByRole('link', { name: new RegExp(label) });
    for (const [label, route] of [
      ['Väntar på bekräftelse', '/admin/bokningar'],
      ['Kommande hämtningar', '/admin/platser'],
      ['Kommande tvättar på plats', '/admin/platser'],
      ['Recensioner att granska', '/admin/recensioner'],
      ['Partners utan logotyp', '/admin/partners'],
      ['Välgörenhet', '/admin/valgorenhet'],
    ] as const) {
      await ensureAdmin(page);
      await card(label).first().click();
      await expect(page).toHaveURL(new RegExp(route));
    }
  });

  test('contact messages: unread → read, reply links, delete', async ({ page }) => {
    const name = uniqueName('Kontakt');
    const message = `Fråga om lackskydd ${Date.now()}`;
    await page.goto('/#kontakt');
    const form = page.locator('#kontakt form');
    await form.getByLabel('Namn').fill(name);
    await form.getByLabel('E-post').fill('kontakt-e2e@example.com');
    await form.getByLabel('Telefon').fill('070-765 43 21');
    await form.getByLabel('Meddelande').fill(message);
    await form.getByRole('button', { name: /Skicka meddelande/ }).click();
    await expect(page.getByText('Tack för ditt meddelande!')).toBeVisible({ timeout: 15_000 });

    await adminLogin(page);
    await goAdmin(page, 'Meddelanden');
    const item = page.locator('main li', { hasText: name });
    await expect(item).toBeVisible();
    await expect(item.getByLabel('Oläst')).toBeVisible();
    await item.getByRole('button', { name: new RegExp(name) }).click();
    await expect(item.getByText(message).last()).toBeVisible();
    await expect(item.getByLabel('Oläst')).toHaveCount(0);
    await expect(item.getByRole('link', { name: /Svara kontakt-e2e@example.com/ })).toHaveAttribute('href', /^mailto:kontakt-e2e@example\.com/);
    await expect(item.getByRole('link', { name: /Ring/ })).toHaveAttribute('href', 'tel:0707654321');

    // Stays read after a reload
    await page.reload();
    await expect(page.locator('main li', { hasText: name }).getByLabel('Oläst')).toHaveCount(0);

    // Delete: cancel keeps, confirm removes
    await page.locator('main li', { hasText: name }).getByRole('button', { name: new RegExp(name) }).click();
    await page.getByRole('button', { name: 'Radera meddelandet' }).click();
    await confirmDialog(page, 'Avbryt');
    await expect(page.locator('main li', { hasText: name })).toBeVisible();
    await page.getByRole('button', { name: 'Radera meddelandet' }).click();
    await confirmDialog(page, 'Radera');
    await expect(page.locator('main li', { hasText: name })).toHaveCount(0);
  });
});
