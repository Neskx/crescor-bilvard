import { expect, test, type Page } from '@playwright/test';
import {
  adminLogin,
  booking,
  bookUpToSummary,
  confirmDialog,
  ensureAdmin,
  expectToast,
  freshBooking,
  goAdmin,
  kr,
  openBooking,
  submitBooking,
  uniqueName,
} from './adminHelpers';
import { chooseService, chooseWorkshop, firstFreeSlot, uniqueEmail } from './helpers';

// Locations & fees, opening hours, blocked periods and the settings page. Each test restores
// whatever it changes (even when it fails), so the local database ends up as it started.

test.describe.configure({ mode: 'serial' });

const dd = (scope: ReturnType<Page['locator']>, label: string) => scope.getByText(label, { exact: true }).locator('xpath=following-sibling::dd[1]');

const monday = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
};
/** Clicks "Nästa vecka" until the week containing `iso` is shown. */
async function gotoWeekOf(page: Page, iso: string) {
  const today = new Date().toISOString().slice(0, 10);
  const weeks = Math.round((monday(iso).getTime() - monday(today).getTime()) / (7 * 86_400_000));
  for (let i = 0; i < weeks; i++) await booking(page).getByRole('button', { name: 'Nästa vecka' }).click();
  await expect(booking(page).getByRole('group', { name: /^Tider vecka/ })).toBeVisible();
}
/** "Onsdag 4 november" as used in the slot buttons' accessible names. */
const dayLabel = (iso: string) => {
  const text = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
};
/** A Tuesday–Thursday 2–5 weeks ahead (open days in the default hours). */
function midweekDate(minDays = 16) {
  const d = new Date(Date.now() + (minDays + Math.floor(Math.random() * 21)) * 86_400_000);
  while (![2, 3, 4].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---- Locations & fees ---------------------------------------------------------------------------

const LOC_FIELDS = [
  '#loc-workshop_instructions',
  '#loc-pickup_area_text',
  '#loc-pickup-zones',
  '#loc-pickup_fee',
  '#loc-pickup_travel_minutes',
  '#loc-pickup_info_text',
  '#loc-service_area_text',
  '#loc-mobile-zones',
  '#loc-mobile_fee',
  '#loc-mobile_travel_minutes',
];
const SERVICE = 'Enkel Tvätt';
const MATRIX = ['Lämna bilen', 'Vi hämtar bilen', 'Tvätt på plats'];

async function openLocations(page: Page) {
  await ensureAdmin(page);
  await goAdmin(page, 'Platser & hämtning');
  await expect(page.getByRole('heading', { name: 'Vi hämtar bilen' })).toBeVisible();
  await expect(page.locator('#loc-pickup_fee')).toBeVisible();
}
async function snapshotLocations(page: Page) {
  await openLocations(page);
  const fields: Record<string, string> = {};
  for (const f of LOC_FIELDS) fields[f] = await page.locator(f).inputValue();
  const switches = [] as boolean[];
  for (let i = 0; i < 3; i++) switches.push(await page.getByRole('switch').nth(i).isChecked());
  const matrix = [] as boolean[];
  for (const m of MATRIX) matrix.push(await page.getByRole('checkbox', { name: `${SERVICE}: ${m}` }).isChecked());
  return { fields, switches, matrix };
}
async function restoreLocations(page: Page, snap: Awaited<ReturnType<typeof snapshotLocations>>) {
  await openLocations(page);
  for (const f of LOC_FIELDS) await page.locator(f).fill(snap.fields[f]);
  for (let i = 0; i < 3; i++) await page.getByRole('switch').nth(i).setChecked(snap.switches[i], { force: true });
  await page.getByRole('button', { name: 'Spara platsinställningar' }).click();
  await expectToast(page, 'Platsinställningarna är sparade.');
  for (let i = 0; i < MATRIX.length; i++) await page.getByRole('checkbox', { name: `${SERVICE}: ${MATRIX[i]}` }).setChecked(snap.matrix[i]);
}
const saveLocations = async (page: Page) => {
  await page.getByRole('button', { name: 'Spara platsinställningar' }).click();
  await expectToast(page, 'Platsinställningarna är sparade.');
};
/** Chooses the service on the public form and returns the location options. */
async function toLocationStep(page: Page) {
  await freshBooking(page);
  await chooseService(page, SERVICE);
  await expect(booking(page).getByRole('heading', { name: 'Välj plats' })).toBeVisible();
}

test.describe('Admin – locations, pickup and fees', () => {
  test.setTimeout(240_000);

  test('fees, areas, zones and per-package availability change what customers see and pay', async ({ page }) => {
    await adminLogin(page);
    const snap = await snapshotLocations(page);
    const area = uniqueName('Malmö');
    const mobileArea = uniqueName('Lund');
    try {
      // ---- Validation ----
      await openLocations(page);
      await page.locator('#loc-pickup-zones').fill('21x');
      await page.getByRole('button', { name: 'Spara platsinställningar' }).click();
      await expect(page.getByText(/Postnummerområden anges som/)).toBeVisible();
      await page.locator('#loc-pickup-zones').fill('');
      await page.locator('#loc-pickup_fee').fill('-5');
      await page.getByRole('button', { name: 'Spara platsinställningar' }).click();
      await expect(page.getByText(/Avgifter måste vara 0 kr eller mer/)).toBeVisible();

      // ---- Switch on pickup and on-site washing with fees ----
      await page.getByRole('switch').nth(1).setChecked(true, { force: true });
      await page.getByRole('switch').nth(2).setChecked(true, { force: true });
      await page.locator('#loc-pickup_area_text').fill(area);
      await page.locator('#loc-pickup_fee').fill('200');
      await page.locator('#loc-pickup_travel_minutes').fill('30');
      await page.locator('#loc-pickup_info_text').fill('E2E: vi ringer dig innan vi kommer.');
      await page.locator('#loc-service_area_text').fill(mobileArea);
      await page.locator('#loc-mobile_fee').fill('300');
      await page.locator('#loc-mobile_travel_minutes').fill('45');
      await saveLocations(page);
      await expect(page.getByText(/Aktuella avgifter: hämtning 200\skr · på plats 300\skr/)).toBeVisible();
      for (const m of MATRIX) await page.getByRole('checkbox', { name: `${SERVICE}: ${m}` }).check();

      // ---- Customers see the offers and their fees ----
      await toLocationStep(page);
      const b = booking(page);
      await expect(b.getByRole('radio', { name: /^Lämna bilen/ })).toBeVisible();
      await expect(b.getByRole('radio', { name: /^Vi hämtar bilen/ })).toContainText(area);
      await expect(b.getByRole('radio', { name: /^Vi hämtar bilen/ })).toContainText(kr(200));
      await expect(b.getByRole('radio', { name: /^Tvätt på plats/ })).toContainText(mobileArea);
      await expect(b.getByRole('radio', { name: /^Tvätt på plats/ })).toContainText(kr(300));
      await b.getByRole('radio', { name: /^Vi hämtar bilen/ }).click();
      await expect(b.getByText('E2E: vi ringer dig innan vi kommer.')).toBeVisible();

      // ---- A real pickup booking pays the fee: 650 + 200 = 850 kr ----
      const email = uniqueEmail('pickup');
      await bookUpToSummary(page, {
        service: SERVICE,
        email,
        weeksAhead: 7,
        location: { type: 'pickup', address: 'Pickupgatan 5', postalCode: '21143', city: 'Malmö' },
      });
      await expect(dd(b, 'Hämtning')).toContainText(kr(200));
      await expect(dd(b, 'Pris')).toContainText(kr(850));
      const ref = await submitBooking(page);

      await ensureAdmin(page);
      const drawer = await openBooking(page, ref);
      await expect(drawer).toContainText('Vi hämtar bilen');
      await expect(drawer).toContainText('Pickupgatan 5');
      await expect(dd(drawer, 'Hämtningsavgift')).toContainText(kr(200));
      await expect(dd(drawer, 'Pris')).toContainText(kr(850));
      await expect(drawer).toContainText('30 min restid');
      await drawer.getByRole('button', { name: 'Stäng' }).click();

      // The upcoming-pickups list on the locations page links to it
      await goAdmin(page, 'Platser & hämtning');
      const upcoming = page.getByRole('region', { name: 'Kommande hämtningar' });
      await expect(upcoming.getByRole('button', { name: /Pickupgatan 5/ }).first()).toBeVisible();
      await upcoming.getByRole('button', { name: /Pickupgatan 5/ }).first().click();
      await expect(page.getByRole('dialog', { name: 'Bokningsdetaljer' })).toContainText('Pickupgatan 5');
      await page.getByRole('dialog', { name: 'Bokningsdetaljer' }).getByLabel(/Meddela kunden via e-post/).uncheck();
      await page.getByRole('dialog', { name: 'Bokningsdetaljer' }).getByRole('button', { name: 'Avboka' }).click();
      await confirmDialog(page, 'Avboka');
      await expect(page.getByRole('dialog', { name: 'Bokningsdetaljer' }).getByText('Avbokad', { exact: true })).toBeVisible();

      // ---- Change the fee: customers see the new price; free pickup says so ----
      await openLocations(page);
      await page.locator('#loc-pickup_fee').fill('0');
      await saveLocations(page);
      await toLocationStep(page);
      await expect(b.getByRole('radio', { name: /^Vi hämtar bilen/ })).toContainText('Ingen extra avgift');
      await openLocations(page);
      await page.locator('#loc-pickup_fee').fill('');
      await saveLocations(page);
      await toLocationStep(page);
      await expect(b.getByRole('radio', { name: /^Vi hämtar bilen/ })).not.toContainText('kr');
      await expect(b.getByRole('radio', { name: /^Vi hämtar bilen/ })).not.toContainText('Ingen extra avgift');

      // ---- Postal-code zones ----
      await openLocations(page);
      await page.locator('#loc-pickup-zones').fill('211, 212');
      await saveLocations(page);
      await toLocationStep(page);
      await b.getByRole('radio', { name: /^Vi hämtar bilen/ }).click();
      await b.locator('#bk-service_address').fill('Zongatan 1');
      await b.locator('#bk-service_postal_code').fill('99999');
      await b.locator('#bk-service_city').fill('Långtbort');
      await b.getByRole('button', { name: 'Fortsätt' }).click();
      await expect(b.getByText(/Vi hämtar tyvärr inte bilar i det här postnummerområdet/)).toBeVisible();
      await b.locator('#bk-service_postal_code').fill('21145');
      await b.getByRole('button', { name: 'Fortsätt' }).click();
      await expect(b.getByRole('group', { name: /^Tider vecka/ })).toBeVisible();

      // ---- Per-package availability (the matrix saves immediately) ----
      await openLocations(page);
      await page.getByRole('checkbox', { name: `${SERVICE}: Vi hämtar bilen` }).uncheck();
      await toLocationStep(page);
      await expect(b.getByRole('radio', { name: /^Vi hämtar bilen/ })).toBeDisabled();
      await expect(b.getByText(`Erbjuds inte för ${SERVICE}.`)).toBeVisible();
      await openLocations(page);
      await page.getByRole('checkbox', { name: `${SERVICE}: Vi hämtar bilen` }).check();

      // ---- Switching a location off removes it altogether ----
      await openLocations(page);
      await page.getByRole('switch').nth(1).setChecked(false, { force: true });
      await page.getByRole('switch').nth(2).setChecked(false, { force: true });
      await saveLocations(page);
      await toLocationStep(page).catch(async () => {
        // With only the workshop left the step is skipped; the service step continues straight on.
      });
      await expect(b.getByRole('radio', { name: /^Vi hämtar bilen/ })).toHaveCount(0);
      await expect(b.getByRole('radio', { name: /^Tvätt på plats/ })).toHaveCount(0);
    } finally {
      await restoreLocations(page, snap);
    }
  });
});

// ---- Opening hours -------------------------------------------------------------------------------

const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];

test.describe('Admin – opening hours', () => {
  test.setTimeout(180_000);

  test('closing a weekday removes its slots; bad ranges are blocked; hours persist', async ({ page }) => {
    await adminLogin(page);
    await goAdmin(page, 'Öppettider');
    await expect(page.getByRole('heading', { name: 'Öppettider', level: 1 })).toBeVisible();
    const open = (i: number) => page.getByRole('checkbox', { name: 'Öppet' }).nth(i);
    const from = (i: number) => page.getByLabel(`${DAYS[i]} öppnar`);
    const to = (i: number) => page.getByLabel(`${DAYS[i]} stänger`);

    const original = [] as { open: boolean; from: string; to: string }[];
    for (let i = 0; i < 7; i++) original.push({ open: await open(i).isChecked(), from: await from(i).inputValue(), to: await to(i).inputValue() });
    expect(original.some((d) => d.open)).toBe(true);

    const restore = async () => {
      await ensureAdmin(page);
      await goAdmin(page, 'Öppettider');
      await expect(from(0)).toBeVisible();
      for (let i = 0; i < 7; i++) {
        await open(i).setChecked(original[i].open);
        if (original[i].open) {
          await from(i).fill(original[i].from);
          await to(i).fill(original[i].to);
        }
      }
      await page.getByRole('button', { name: 'Spara öppettider' }).click();
      await expectToast(page, 'Öppettiderna är sparade.');
    };

    try {
      // Choose an open weekday (Tue–Thu) to close
      const wed = 2;
      expect(original[wed].open, 'the default hours open on Wednesdays').toBe(true);

      // ---- A closing time before the opening time can't be saved ----
      await to(wed).fill('06:00');
      await expect(page.getByText(/Stängningstiden måste vara senare än öppningstiden \(Onsdag\)/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Spara öppettider' })).toBeDisabled();
      await to(wed).fill(original[wed].to);
      await expect(page.getByRole('button', { name: 'Spara öppettider' })).toBeEnabled();

      // ---- Closing a day: the time inputs lock, the public grid shows "Stängt" ----
      await open(wed).uncheck();
      await expect(from(wed)).toBeDisabled();
      await page.getByRole('button', { name: 'Spara öppettider' }).click();
      await expectToast(page, 'Öppettiderna är sparade.');
      await page.reload();
      await expect(open(wed)).not.toBeChecked();

      const date = midweekDate();
      const wednesday = new Date(`${date}T12:00:00Z`);
      wednesday.setUTCDate(wednesday.getUTCDate() + ((3 - wednesday.getUTCDay() + 7) % 7));
      const wedIso = wednesday.toISOString().slice(0, 10);
      await freshBooking(page);
      await chooseService(page, SERVICE);
      await chooseWorkshop(page);
      await gotoWeekOf(page, wedIso);
      const grid = booking(page).getByRole('group', { name: /^Tider vecka/ });
      await expect(grid.getByRole('button', { name: new RegExp(`^${dayLabel(wedIso)}`) })).toHaveCount(0);
      await expect(grid.getByText('Stängt').first()).toBeVisible();
      // Other days still have times
      const tuesday = new Date(wednesday.getTime() - 86_400_000).toISOString().slice(0, 10);
      await expect(grid.getByRole('button', { name: new RegExp(`^${dayLabel(tuesday)}`) }).first()).toBeVisible();

      // ---- Re-open with shorter hours: fewer slots that day ----
      await ensureAdmin(page);
      await goAdmin(page, 'Öppettider');
      await open(wed).check();
      await from(wed).fill('09:00');
      await to(wed).fill('12:00');
      await page.getByRole('button', { name: 'Spara öppettider' }).click();
      await expectToast(page, 'Öppettiderna är sparade.');
      await freshBooking(page);
      await chooseService(page, SERVICE);
      await chooseWorkshop(page);
      await gotoWeekOf(page, wedIso);
      const labels = await booking(page)
        .getByRole('group', { name: /^Tider vecka/ })
        .getByRole('button', { name: new RegExp(`^${dayLabel(wedIso)}`) })
        .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
      for (const l of labels) {
        const hour = Number(l.match(/klockan (\d{2}):/)![1]);
        expect(hour, l).toBeGreaterThanOrEqual(9);
        expect(hour, l).toBeLessThan(12);
      }
    } finally {
      await restore();
    }
  });
});

// ---- Blocked periods ------------------------------------------------------------------------------

/** Deletes the block with this reason (if it exists), waiting for the list to load first. */
async function removeBlock(page: Page, reason: string) {
  await ensureAdmin(page);
  await goAdmin(page, 'Blockerade tider');
  const item = page.locator('main li', { hasText: reason });
  await item.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
  while (await item.first().isVisible().catch(() => false)) {
    await item.first().getByRole('button', { name: 'Ta bort blockering' }).click();
    await confirmDialog(page, 'Ta bort');
    await expect(item).toHaveCount(0);
  }
}

test.describe('Admin – blocked periods', () => {
  test.setTimeout(180_000);
  // Sweep any "E2E …" block, including ones left behind by an interrupted run.
  test.afterEach(async ({ page }) => removeBlock(page, 'E2E '));

  test('a blocked day disappears from the public calendar and stops admin bookings; it can be removed again', async ({ page }) => {
    const date = midweekDate(21);
    const reason = uniqueName('Semester');
    await adminLogin(page);
    await goAdmin(page, 'Blockerade tider');
    await expect(page.getByRole('heading', { name: 'Blockerade tider', level: 1 })).toBeVisible();

    // Before: the day has bookable times
    await freshBooking(page);
    await chooseService(page, SERVICE);
    await chooseWorkshop(page);
    await gotoWeekOf(page, date);
    const dayButtons = (enabledOnly = false) =>
      booking(page)
        .getByRole('group', { name: /^Tider vecka/ })
        .getByRole('button', { name: new RegExp(`^${dayLabel(date)}`), ...(enabledOnly ? { disabled: false } : {}) });
    await expect(dayButtons(true).first()).toBeVisible();

    try {
      await ensureAdmin(page);
      await goAdmin(page, 'Blockerade tider');
      // ---- Validation: end before start (time range) ----
      await page.getByLabel('Hela dagar').uncheck();
      await page.locator('#bl-from').fill(date);
      await page.locator('#bl-fromt').fill('12:00');
      await page.locator('#bl-to').fill(date);
      await page.locator('#bl-tot').fill('09:00');
      await page.getByRole('button', { name: 'Blockera period' }).click();
      await expect(page.getByText('Slutet måste vara efter starten.')).toBeVisible();

      // ---- Block the whole day ----
      await page.getByLabel('Hela dagar').check();
      await page.locator('#bl-from').fill(date);
      await page.locator('#bl-to').fill(date);
      await page.locator('#bl-reason').fill(reason);
      await page.getByRole('button', { name: 'Blockera period' }).click();
      await expectToast(page, 'Perioden är blockerad.');
      const item = page.locator('main li', { hasText: reason });
      await expect(item).toBeVisible();

      // ---- The public calendar no longer offers that day ----
      await freshBooking(page);
      await chooseService(page, SERVICE);
      await chooseWorkshop(page);
      await gotoWeekOf(page, date);
      await expect(booking(page).getByRole('group', { name: /^Tider vecka/ })).toBeVisible();
      await expect(dayButtons(true)).toHaveCount(0);

      // ---- The admin calendar shows it ----
      await ensureAdmin(page);
      await goAdmin(page, 'Kalender');
      const weeks = Math.round((monday(date).getTime() - monday(new Date().toISOString().slice(0, 10)).getTime()) / (7 * 86_400_000));
      for (let i = 0; i < weeks; i++) await page.getByRole('button', { name: 'Nästa vecka' }).click();
      // Exactly one day carries the block (a whole-day block must not spill onto the day before/after)
      await expect(page.getByText(`Blockerat: ${reason}`)).toHaveCount(1);
      await expect(page.locator('section', { hasText: `Blockerat: ${reason}` }).locator('h2')).toContainText(new RegExp(`^${dayLabel(date).split(' ')[0].slice(0, 3)}`, 'i'));

      // ---- Admin can't book into it ----
      await goAdmin(page, 'Ny bokning');
      const value = await page.locator('#nb-service_id option', { hasText: SERVICE }).getAttribute('value');
      await page.locator('#nb-service_id').selectOption(value!);
      await page.locator('#nb-date').fill(date);
      await page.locator('#nb-time').fill('10:00');
      await page.locator('#nb-customer_name').fill(uniqueName('Blockerad'));
      await page.locator('#nb-customer_email').fill(uniqueEmail('blocked'));
      await page.locator('#nb-customer_phone').fill('070-123 45 67');
      await page.getByLabel(/Skicka bokningsbekräftelse/).uncheck();
      await page.getByRole('button', { name: 'Skapa bokning' }).click();
      await expect(page.getByRole('alert').first()).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: /är skapad/ })).toHaveCount(0);
    } finally {
      await removeBlock(page, reason);
    }
    await expect(page.locator('main li', { hasText: reason })).toHaveCount(0);

    // Removing the block makes the day bookable again
    await freshBooking(page);
    await chooseService(page, SERVICE);
    await chooseWorkshop(page);
    await gotoWeekOf(page, date);
    await expect(dayButtons(true).first()).toBeVisible();
  });

  test('cancelling the removal keeps the block', async ({ page }) => {
    const date = midweekDate(60);
    const reason = uniqueName('Helg');
    await adminLogin(page);
    await goAdmin(page, 'Blockerade tider');
    await page.locator('#bl-from').fill(date);
    await page.locator('#bl-to').fill(date);
    await page.locator('#bl-reason').fill(reason);
    await page.getByRole('button', { name: 'Blockera period' }).click();
    await expectToast(page, 'Perioden är blockerad.');
    const item = page.locator('main li', { hasText: reason });
    await item.getByRole('button', { name: 'Ta bort blockering' }).click();
    await confirmDialog(page, 'Avbryt');
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: 'Ta bort blockering' }).click();
    await confirmDialog(page, 'Ta bort');
    await expect(item).toHaveCount(0);
  });
});

// ---- Settings ----------------------------------------------------------------------------------------

const SETTING_FIELDS = ['#st-company_phone', '#st-company_email', '#st-opening_hours_text', '#st-notification_email', '#st-org_number', '#st-company_address'];
const SETTING_NUMBERS = ['#st-booking_notice_hours', '#st-booking_horizon_days', '#st-retention_days'];

async function openSettings(page: Page) {
  await ensureAdmin(page);
  await goAdmin(page, 'Inställningar');
  await expect(page.locator('#st-company_phone')).toBeVisible();
}

test.describe('Admin – settings', () => {
  test.setTimeout(240_000);

  test('contact details, booking switch and auto-confirm change the site and new bookings', async ({ page }) => {
    await adminLogin(page);
    await openSettings(page);
    const snap = {
      fields: Object.fromEntries(await Promise.all(SETTING_FIELDS.map(async (f) => [f, await page.locator(f).inputValue()]))) as Record<string, string>,
      numbers: Object.fromEntries(await Promise.all(SETTING_NUMBERS.map(async (f) => [f, await page.locator(f).inputValue()]))) as Record<string, string>,
      slot: await page.locator('#st-slot').inputValue(),
      bookingEnabled: await page.getByRole('switch', { name: /^Onlinebokning aktiverad/ }).isChecked(),
      autoConfirm: await page.getByRole('switch', { name: /^Bekräfta onlinebokningar automatiskt/ }).isChecked(),
    };
    const save = async () => {
      await page.getByRole('button', { name: 'Spara inställningar' }).click();
      await expectToast(page, 'Inställningarna är sparade.');
    };
    const restore = async () => {
      await openSettings(page);
      for (const f of SETTING_FIELDS) await page.locator(f).fill(snap.fields[f]);
      for (const f of SETTING_NUMBERS) await page.locator(f).fill(snap.numbers[f]);
      await page.locator('#st-slot').selectOption(snap.slot);
      await page.getByRole('switch', { name: /^Onlinebokning aktiverad/ }).setChecked(snap.bookingEnabled, { force: true });
      await page.getByRole('switch', { name: /^Bekräfta onlinebokningar automatiskt/ }).setChecked(snap.autoConfirm, { force: true });
      await save();
    };

    try {
      // ---- Validation ----
      await page.locator('#st-company_email').fill('inte-en-epost');
      await page.getByRole('button', { name: 'Spara inställningar' }).click();
      await expect(page.getByText('Kontrollera e-postadresserna.')).toBeVisible();

      // ---- Contact details show up on the public site ----
      await page.locator('#st-company_phone').fill('040-123 45 67');
      await page.locator('#st-company_email').fill('e2e-kontakt@example.com');
      await page.locator('#st-opening_hours_text').fill('E2E mån–fre 07–16');
      await save();
      await page.goto('/');
      const footer = page.locator('footer');
      await expect(footer.getByRole('link', { name: 'e2e-kontakt@example.com' })).toHaveAttribute('href', 'mailto:e2e-kontakt@example.com');
      await expect(footer).toContainText('040-123 45 67');
      await expect(footer).toContainText('E2E mån–fre 07–16');
      await expect(page.locator('#kontakt')).toContainText('E2E mån–fre 07–16');

      // ---- Missing details are flagged ----
      await openSettings(page);
      await page.locator('#st-company_phone').fill('');
      await save();
      await page.reload();
      await expect(page.getByText('Saknas innan lansering')).toBeVisible();
      await expect(page.getByText(/telefonnummer/)).toBeVisible();
      await page.goto('/');
      await expect(page.locator('footer')).not.toContainText('040-123 45 67');

      // ---- Booking rules persist ----
      await openSettings(page);
      await page.locator('#st-booking_notice_hours').fill('12');
      await page.locator('#st-booking_horizon_days').fill('90');
      await page.locator('#st-slot').selectOption('60');
      await page.locator('#st-retention_days').fill('400');
      await save();
      await page.reload();
      await expect(page.locator('#st-booking_notice_hours')).toHaveValue('12');
      await expect(page.locator('#st-booking_horizon_days')).toHaveValue('90');
      await expect(page.locator('#st-slot')).toHaveValue('60');
      await expect(page.locator('#st-retention_days')).toHaveValue('400');
      // …and a 60-minute interval is visible in the public grid: all start times are on the hour
      await freshBooking(page);
      await chooseService(page, SERVICE);
      await chooseWorkshop(page);
      const slot = await firstFreeSlot(page, 1);
      expect(await slot.getAttribute('aria-label')).toMatch(/klockan \d{2}:00,/);

      // ---- Switching online booking off closes the form ----
      await openSettings(page);
      await page.getByRole('switch', { name: /^Onlinebokning aktiverad/ }).uncheck({ force: true });
      await save();
      await page.goto('/#boka');
      await expect(page.getByText('Onlinebokningen öppnar snart')).toBeVisible();
      await expect(booking(page).getByRole('radiogroup', { name: 'Tjänster' })).toHaveCount(0);
      await openSettings(page);
      await page.getByRole('switch', { name: /^Onlinebokning aktiverad/ }).check({ force: true });
      await save();

      // ---- Auto-confirm off: new bookings wait for the admin and show up in the counters ----
      await openSettings(page);
      await page.getByRole('switch', { name: /^Bekräfta onlinebokningar automatiskt/ }).uncheck({ force: true });
      await save();
      await goAdmin(page, 'Översikt');
      const pendingCard = page.getByRole('link', { name: /Väntar på bekräftelse/ }).first();
      await expect(pendingCard).toBeVisible();
      const before = Number((await pendingCard.innerText()).match(/\n(\d+)\n/)?.[1] ?? (await pendingCard.innerText()).match(/(\d+)/)![1]);

      await bookUpToSummary(page, { service: SERVICE, email: uniqueEmail('pending'), weeksAhead: 8 });
      await expect(booking(page).getByText(/Tiden reserveras direkt när du skickar/)).toBeVisible();
      const pendingRef = await submitBooking(page);

      await ensureAdmin(page);
      const pendingCardAfter = page.getByRole('link', { name: /Väntar på bekräftelse/ }).first();
      await expect(pendingCardAfter).toContainText(String(before + 1));
      await expect(adminLink(page, 'Bokningar').getByLabel(`${before + 1} väntar på bekräftelse`)).toBeVisible();
      const drawer = await openBooking(page, pendingRef);
      await expect(drawer.getByText('Väntar på bekräftelse')).toBeVisible();
      await drawer.getByRole('button', { name: 'Bekräfta', exact: true }).click();
      await expect(drawer.getByText('Bekräftad', { exact: true })).toBeVisible();
      await drawer.getByRole('button', { name: 'Avboka' }).click();
      await confirmDialog(page, 'Avboka');
      await expect(drawer.getByText('Avbokad', { exact: true })).toBeVisible();
      await drawer.getByRole('button', { name: 'Stäng' }).click();

      // ---- Auto-confirm on: the booking is confirmed immediately ----
      await openSettings(page);
      await page.getByRole('switch', { name: /^Bekräfta onlinebokningar automatiskt/ }).check({ force: true });
      await save();
      await bookUpToSummary(page, { service: SERVICE, email: uniqueEmail('auto'), weeksAhead: 8 });
      await expect(booking(page).getByText(/Tiden reserveras direkt när du skickar/)).toHaveCount(0);
      const autoRef = await submitBooking(page);
      await ensureAdmin(page);
      const drawer2 = await openBooking(page, autoRef);
      await expect(drawer2.getByText('Bekräftad', { exact: true })).toBeVisible();
      await drawer2.getByRole('button', { name: 'Avboka' }).click();
      await confirmDialog(page, 'Avboka');
      await expect(drawer2.getByText('Avbokad', { exact: true })).toBeVisible();
    } finally {
      await restore();
    }
  });

  test('the privacy clean-up asks for confirmation and can be cancelled', async ({ page }) => {
    await adminLogin(page);
    await openSettings(page);
    const days = await page.locator('#st-retention_days').inputValue();
    await page.getByRole('button', { name: 'Gallra nu' }).click();
    const dialog = page.locator('dialog[open]:not([aria-label])');
    await expect(dialog).toContainText('Gallra gamla personuppgifter?');
    await expect(dialog).toContainText(`${days} dagar`);
    await confirmDialog(page, 'Avbryt');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /anonymiserade/ })).toHaveCount(0);
  });
});

const adminLink = (page: Page, name: string) => page.getByRole('navigation', { name: 'Administration' }).getByRole('link', { name: new RegExp(`^${name}`) });
