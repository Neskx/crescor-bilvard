import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  adminLogin,
  booking,
  bookUpToSummary,
  cleanupCharities,
  cleanupPartners,
  confirmDialog,
  ensureAdmin,
  expectToast,
  freshBooking,
  goAdmin,
  kr,
  openBooking,
  row,
  submitBooking,
  uniqueName,
} from './adminHelpers';
import { chooseService, chooseWorkshop, fillDetails, firstFreeSlot, uniqueEmail } from './helpers';

// Samarbetspartners, the charity programme and review moderation.

test.describe.configure({ mode: 'serial' });

const SERVICE = 'Enkel Tvätt';
// 1×1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const formOf = (page: Page, firstFieldId: string) => page.locator('form', { has: page.locator(firstFieldId) });
const saveIn = (page: Page, firstFieldId: string) => formOf(page, firstFieldId).getByRole('button', { name: 'Spara', exact: true }).click();
/** The number on an overview card, e.g. "Partners utan logotyp". */
async function overviewCount(page: Page, label: string) {
  await ensureAdmin(page);
  const card = page.getByRole('link', { name: new RegExp(label) }).first();
  await expect(card).toBeVisible();
  return Number((await card.innerText()).match(/\d+/)![0]);
}

// ---- Partners ------------------------------------------------------------------------------------------

test.describe('Admin – partners', () => {
  test.setTimeout(180_000);
  test.afterEach(async ({ page }) => cleanupPartners(page));

  test('create, validate, add a logo, hide, reorder and delete a partner — the home page follows', async ({ page }) => {
    const name = uniqueName('Partner');
    const url = 'https://e2e-partner.example';
    const publicLink = () => page.locator('#samarbetspartners').getByRole('list', { name: 'Samarbetspartners' }).getByRole('link', { name: new RegExp(name) });
    const publicLogo = () => page.locator('#samarbetspartners').getByRole('list', { name: 'Samarbetspartners' }).getByRole('img', { name });

    await adminLogin(page);
    const withoutLogoBefore = await overviewCount(page, 'Partners utan logotyp');

    await goAdmin(page, 'Samarbetspartners');
    await expect(page.getByRole('heading', { name: 'Samarbetspartners', level: 1 })).toBeVisible();
    await expect(page.getByText('Greentopia AB')).toBeVisible();
    const names = () => page.locator('main li p.font-semibold').allInnerTexts();
    const count = (await names()).length;

    // ---- Validation ----
    await page.getByRole('button', { name: 'Ny partner' }).click();
    await saveIn(page, '#pt-name');
    await expect(page.getByText('Ange företagets namn.')).toBeVisible();
    await page.locator('#pt-name').fill(name);
    await page.locator('#pt-url').fill('inte-en-adress');
    await saveIn(page, '#pt-name');
    await expect(page.getByText(/Webbadressen måste börja med https/)).toBeVisible();

    // ---- Create (no logo → the name is shown) ----
    await page.locator('#pt-url').fill(url);
    await page.locator('#pt-note').fill('E2E: ingen riktig partner');
    await saveIn(page, '#pt-name');
    await expectToast(page, 'Samarbetspartnern är sparad.');
    await expect(row(page, name)).toContainText(url);
    await expect(row(page, name)).toContainText('E2E: ingen riktig partner');
    expect((await names()).length).toBe(count + 1);

    await page.goto('/');
    await page.locator('#samarbetspartners').scrollIntoViewIfNeeded();
    await expect(publicLink()).toHaveAttribute('href', url);
    await expect(publicLink()).toHaveAttribute('target', '_blank');
    await expect(publicLink()).toHaveAttribute('rel', 'noopener noreferrer');
    expect(await overviewCount(page, 'Partners utan logotyp')).toBe(withoutLogoBefore + 1);

    // ---- Logo from the bundled set (the background follows the logo) ----
    await goAdmin(page, 'Samarbetspartners');
    await row(page, name).getByRole('button', { name: 'Redigera' }).click();
    await page.getByLabel('Logotypkälla').selectOption({ label: 'Medföljande: Korpera' });
    await expect(page.getByRole('radio', { name: /Mörk ruta/ })).toBeChecked();
    await expect(formOf(page, '#pt-name').locator('img')).toBeVisible();
    // An unverified logo warns before it is connected
    await page.getByLabel('Logotypkälla').selectOption({ index: 5 });
    await expect(page.getByText(/Ägaren till den här logotypen är inte bekräftad/)).toBeVisible();
    await page.getByLabel('Logotypkälla').selectOption({ label: 'Medföljande: Korpera' });
    await page.getByRole('radio', { name: /Ljus ruta/ }).check();
    await page.getByRole('radio', { name: /Mörk ruta/ }).check();
    await saveIn(page, '#pt-name');
    await expectToast(page, 'Samarbetspartnern är sparad.');
    await page.goto('/');
    await page.locator('#samarbetspartners').scrollIntoViewIfNeeded();
    await expect(publicLogo()).toBeVisible();
    expect(await overviewCount(page, 'Partners utan logotyp')).toBe(withoutLogoBefore);

    // ---- Own upload ----
    await goAdmin(page, 'Samarbetspartners');
    await row(page, name).getByRole('button', { name: 'Redigera' }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'e2e-logo.png', mimeType: 'image/png', buffer: PNG });
    // The upload needs Supabase Storage. A local stack started without it can't store the file;
    // then this part is reported as not verified instead of failing the rest of the test.
    const uploaded = await expect
      .poll(() => page.getByLabel('Logotypkälla').inputValue(), { timeout: 10_000 })
      .toBe('uploaded')
      .then(() => true, () => false);
    if (uploaded) {
      await saveIn(page, '#pt-name');
      await expectToast(page, 'Samarbetspartnern är sparad.');
      await expect(row(page, name)).toBeVisible();
    } else {
      test.info().annotations.push({ type: 'not verified', description: 'Logo upload: Supabase Storage is not running in the local stack.' });
      await page.getByRole('button', { name: 'Avbryt' }).click();
    }

    // Oversized files are refused before anything is uploaded
    await row(page, name).getByRole('button', { name: 'Redigera' }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 10) });
    await expect(page.getByText('Logotypen får vara högst 2 MB.')).toBeVisible();
    await page.getByRole('button', { name: 'Avbryt' }).click();

    // ---- Hide / show ----
    await row(page, name).getByRole('button', { name: 'Dölj' }).click();
    await expectToast(page, 'Partnern är dold.');
    await expect(row(page, name)).toContainText('DOLD');
    await page.goto('/');
    await expect(page.locator('#samarbetspartners').getByText(name)).toHaveCount(0);
    await goAdmin(page, 'Samarbetspartners');
    await row(page, name).getByRole('button', { name: 'Visa' }).click();
    await expectToast(page, 'Partnern visas nu.');
    await expect(row(page, name)).not.toContainText('DOLD');

    // ---- Reorder ----
    const position = async () => (await names()).findIndex((n) => n.includes(name));
    const index = await position();
    const total = (await names()).length;
    const [first, second] = index > 0 ? (['upp', 'ned'] as const) : (['ned', 'upp'] as const);
    const moved = index > 0 ? index - 1 : index + 1;
    await page.getByRole('button', { name: `Flytta ${first} ${name}` }).click();
    await expect.poll(position).toBe(moved);
    await page.reload(); // the new order is saved
    await expect.poll(position).toBe(moved);
    await expect(page.getByRole('button', { name: `Flytta upp ${name}` })).toHaveCount(1);
    await page.getByRole('button', { name: `Flytta ${second} ${name}` }).click();
    await expect.poll(position).toBe(index);
    expect((await names()).length).toBe(total);
    // The first partner can't move up, the last can't move down
    await expect(page.getByRole('button', { name: /^Flytta upp / }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Flytta ned / }).last()).toBeDisabled();

    // ---- Delete: cancel keeps, confirm removes ----
    await page.getByRole('button', { name: `Ta bort ${name}` }).click();
    await confirmDialog(page, 'Avbryt');
    await expect(row(page, name)).toBeVisible();
    await page.getByRole('button', { name: `Ta bort ${name}` }).click();
    await confirmDialog(page, 'Ta bort');
    await expectToast(page, 'Samarbetspartnern är borttagen.');
    await expect(row(page, name)).toHaveCount(0);
    await page.goto('/');
    await expect(page.locator('#samarbetspartners').getByText(name)).toHaveCount(0);
  });
});

// ---- Charity ---------------------------------------------------------------------------------------------

/** Public booking up to (and including) the optional "Välj ändamål" step. */
async function toCharityStep(page: Page) {
  await freshBooking(page);
  await chooseService(page, SERVICE);
  await chooseWorkshop(page);
  await (await firstFreeSlot(page, 9)).click();
  await booking(page).getByRole('button', { name: 'Fortsätt' }).click();
  await fillDetails(page, uniqueEmail('charity'));
  await booking(page).getByRole('button', { name: 'Fortsätt' }).click();
  await expect(booking(page).getByRole('heading', { name: 'Välj ett ändamål att stödja' })).toBeVisible();
}
/** A cause in the "Ändamål" list (gifts also mention the cause's name, so scope to that section). */
const causeRow = (page: Page, cause: string) => page.getByRole('region', { name: 'Ändamål', exact: true }).locator('li', { hasText: cause });
const summaryRow = (page: Page, name: string) => page.locator('table tbody tr', { hasText: name });

test.describe('Admin – charity programme', () => {
  test.setTimeout(240_000);
  test.afterEach(async ({ page }) => cleanupCharities(page));

  test('causes, customer choices, gifts, public totals and CSV export', async ({ page }) => {
    const cause = uniqueName('Stiftelse');
    const period = 'E2E 2026 Q4';
    const seeded = 'Svenska Röda Korset';

    await adminLogin(page);
    await goAdmin(page, 'Välgörenhet');
    await expect(page.getByRole('heading', { name: 'Kundernas val' })).toBeVisible();
    await expect(page.getByRole('switch', { name: /Visa välgörenhetsinitiativet/ })).toBeChecked();

    // ---- Cause validation ----
    await page.getByRole('button', { name: 'Nytt ändamål' }).click();
    await saveIn(page, '#ch-name');
    await expect(page.getByText('Ange organisationens namn.')).toBeVisible();
    await page.locator('#ch-name').fill(cause);
    await page.locator('#ch-url').fill('http://osaker.example');
    await saveIn(page, '#ch-name');
    await expect(page.getByText(/Webbadressen måste vara en säker adress/)).toBeVisible();
    await page.locator('#ch-url').fill('https://e2e-stiftelse.example');
    await page.locator('#ch-logo').fill('ftp://logo.example/x.png');
    await saveIn(page, '#ch-name');
    await expect(page.getByText(/Logotypens adress måste börja med/)).toBeVisible();
    await page.locator('#ch-logo').fill('');

    // ---- Create: inactive until verified ----
    await page.locator('#ch-desc').fill('E2E: en testorganisation.');
    await page.locator('#ch-note').fill('E2E: ej verifierad');
    await saveIn(page, '#ch-name');
    await expectToast(page, 'Ändamålet är sparat.');
    await expect(causeRow(page, cause)).toContainText('INAKTIV');
    await expect(causeRow(page, cause)).toContainText('E2E: ej verifierad');
    await expect(summaryRow(page, cause)).toContainText('(inaktiv)');

    await page.goto('/');
    await expect(page.locator('#valgorenhet')).not.toContainText(cause);
    await toCharityStep(page);
    await expect(booking(page).getByRole('radio', { name: new RegExp(`^${cause}`) })).toHaveCount(0);

    // ---- Activate: now it is offered on the home page and in the booking ----
    await ensureAdmin(page);
    await goAdmin(page, 'Välgörenhet');
    await causeRow(page, cause).getByRole('button', { name: 'Redigera' }).click();
    await formOf(page, '#ch-name').getByRole('switch', { name: /^Aktiv/ }).check({ force: true });
    await saveIn(page, '#ch-name');
    await expectToast(page, 'Ändamålet är sparat.');
    await expect(causeRow(page, cause)).not.toContainText('INAKTIV');

    await page.goto('/');
    const card = page.locator('#valgorenhet li', { hasText: cause });
    await expect(card).toContainText('E2E: en testorganisation.');
    await expect(card.getByRole('link', { name: /e2e-stiftelse\.example/ })).toHaveAttribute('href', 'https://e2e-stiftelse.example');
    await toCharityStep(page);
    await expect(booking(page).getByRole('radio', { name: new RegExp(`^${cause}`) })).toBeVisible();

    // ---- A customer picks a cause: it is counted, shown on the booking, and not counted once cancelled ----
    await ensureAdmin(page);
    await goAdmin(page, 'Välgörenhet');
    const selectionsBefore = Number((await summaryRow(page, seeded).locator('td').nth(1).innerText()).match(/^\d+/)![0]);
    await bookUpToSummary(page, { service: SERVICE, email: uniqueEmail('charity-pick'), weeksAhead: 9, charity: seeded });
    await expect(booking(page).getByText('Ändamål', { exact: true }).locator('xpath=following-sibling::dd[1]')).toContainText(seeded);
    const ref = await submitBooking(page);

    await ensureAdmin(page);
    await goAdmin(page, 'Välgörenhet');
    await expect(summaryRow(page, seeded).locator('td').nth(1)).toContainText(String(selectionsBefore + 1));
    // The date filter narrows the count
    await page.getByLabel('Från', { exact: true }).fill('2099-01-01');
    await expect(summaryRow(page, seeded).locator('td').nth(1)).toContainText(/^0/);
    await page.getByLabel('Från', { exact: true }).fill('');
    await expect(summaryRow(page, seeded).locator('td').nth(1)).toContainText(String(selectionsBefore + 1));

    const drawer = await openBooking(page, ref);
    await expect(drawer.getByText('Valt ändamål', { exact: true }).locator('xpath=following-sibling::dd[1]')).toHaveText(seeded);
    await drawer.getByRole('button', { name: 'Avboka' }).click();
    await confirmDialog(page, 'Avboka');
    await expect(drawer.getByText('Avbokad', { exact: true })).toBeVisible();
    await drawer.getByRole('button', { name: 'Stäng' }).click();
    await goAdmin(page, 'Välgörenhet');
    await expect(summaryRow(page, seeded).locator('td').nth(1)).toContainText(String(selectionsBefore));

    // ---- Gifts: validation ----
    await page.getByRole('button', { name: 'Registrera gåva' }).click();
    await saveIn(page, '#dn-charity');
    await expect(page.getByText('Välj ändamål.')).toBeVisible();
    await page.locator('#dn-charity').selectOption({ label: cause });
    await saveIn(page, '#dn-charity');
    await expect(page.getByText(/Ange period/)).toBeVisible();
    await page.locator('#dn-period').fill(period);
    await saveIn(page, '#dn-charity');
    await expect(page.getByText('Ange ett belopp större än 0 kr.')).toBeVisible();
    await page.locator('#dn-amount').fill('500');
    await page.locator('#dn-status').selectOption('completed');
    await saveIn(page, '#dn-charity');
    await expect(page.getByText('Ange en referens eller ett kvittonummer för en genomförd gåva.')).toBeVisible();

    // ---- Gifts: planned → approved → completed; only completed gifts are public ----
    await page.locator('#dn-status').selectOption('planned');
    await saveIn(page, '#dn-charity');
    await expectToast(page, 'Gåvan är sparad.');
    const gift = page.locator('main li', { hasText: `${cause} · ${period}` });
    await expect(gift).toContainText(kr(500));
    await expect(gift).toContainText('Preliminär');
    await expect(summaryRow(page, cause).locator('td').nth(2)).toContainText(kr(500)); // Preliminärt
    await page.goto('/');
    await expect(page.locator('#valgorenhet')).not.toContainText('Genomförda gåvor');

    await goAdmin(page, 'Välgörenhet');
    await gift.getByRole('button', { name: 'Redigera' }).click();
    await page.locator('#dn-status').selectOption('approved');
    await page.locator('#dn-amount').fill('750');
    await saveIn(page, '#dn-charity');
    await expectToast(page, 'Gåvan är sparad.');
    await expect(gift).toContainText(kr(750));
    await expect(gift).toContainText('Godkänd');
    await expect(summaryRow(page, cause).locator('td').nth(3)).toContainText(kr(750)); // Godkänt
    await page.goto('/');
    await expect(page.locator('#valgorenhet')).not.toContainText('Genomförda gåvor');

    await goAdmin(page, 'Välgörenhet');
    await gift.getByRole('button', { name: 'Redigera' }).click();
    await page.locator('#dn-status').selectOption('completed');
    await page.locator('#dn-ref').fill('E2E-kvitto-1');
    await saveIn(page, '#dn-charity');
    await expectToast(page, 'Gåvan är sparad.');
    await expect(gift).toContainText('Genomförd');
    await expect(gift).toContainText('Ref: E2E-kvitto-1');
    await expect(summaryRow(page, cause).locator('td').nth(4)).toContainText(kr(750)); // Genomfört
    await page.goto('/');
    const totals = page.locator('#valgorenhet');
    await expect(totals).toContainText('Genomförda gåvor');
    await expect(totals.locator('li', { hasText: cause }).last()).toContainText(kr(750));

    // ---- One gift per cause and period ----
    await goAdmin(page, 'Välgörenhet');
    await page.getByRole('button', { name: 'Registrera gåva' }).click();
    await page.locator('#dn-charity').selectOption({ label: cause });
    await page.locator('#dn-period').fill(period);
    await page.locator('#dn-amount').fill('100');
    await saveIn(page, '#dn-charity');
    await expect(page.getByText('Det finns redan en gåva för samma ändamål och period.')).toBeVisible();
    await page.getByRole('button', { name: 'Avbryt' }).click();

    // ---- CSV exports ----
    const [donations] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportera' }).nth(1).click()]);
    expect(donations.suggestedFilename()).toMatch(/^gavor-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = readFileSync((await donations.path())!, 'utf8');
    expect(csv).toContain(cause);
    expect(csv).toContain('750');
    expect(csv).toContain('E2E-kvitto-1');
    const [choices] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportera' }).first().click()]);
    expect(choices.suggestedFilename()).toMatch(/^kundval-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(readFileSync((await choices.path())!, 'utf8')).toContain(seeded);

    // ---- Removing: gifts first (a cause with gifts is protected) ----
    await causeRow(page, cause).getByRole('button', { name: `Ta bort ${cause}` }).click();
    await confirmDialog(page, 'Ta bort');
    await expect(page.getByRole('alert').last()).toBeVisible(); // refused
    await expect(causeRow(page, cause)).toBeVisible();
    await gift.getByRole('button', { name: 'Ta bort gåvan' }).click();
    await confirmDialog(page, 'Avbryt');
    await expect(gift).toBeVisible();
    await gift.getByRole('button', { name: 'Ta bort gåvan' }).click();
    await confirmDialog(page, 'Ta bort');
    await expectToast(page, 'Gåvan är borttagen.');
    await expect(gift).toHaveCount(0);
    await causeRow(page, cause).getByRole('button', { name: `Ta bort ${cause}` }).click();
    await confirmDialog(page, 'Ta bort');
    await expectToast(page, 'Ändamålet är borttaget.');
    await expect(causeRow(page, cause)).toHaveCount(0);
    await page.goto('/');
    await expect(page.locator('#valgorenhet')).not.toContainText(cause);
  });
});

// ---- Reviews ----------------------------------------------------------------------------------------------

/** Customer books, admin confirms and completes, customer reviews through the personal link. */
async function makeReview(page: Page, context: BrowserContext, o: { text: string; name: string; rating: number }) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  await bookUpToSummary(page, { service: SERVICE, email: uniqueEmail('review'), weeksAhead: 3 });
  const ref = await submitBooking(page);

  await ensureAdmin(page);
  const drawer = await openBooking(page, ref);
  const confirm = drawer.getByRole('button', { name: 'Bekräfta', exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await drawer.getByRole('button', { name: 'Markera utförd' }).click();
  await expect(drawer.getByText('Utförd', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Kopiera länk' }).click();
  const link = await drawer.getByLabel('Recensionslänk').inputValue();
  expect(link).toMatch(/\/recension\?t=[A-Za-z0-9_-]{43}$/);

  await page.goto(link);
  await page.getByRole('radio', { name: new RegExp(`^${o.rating} av 5`) }).click();
  await page.getByLabel('Namn som visas').fill(o.name);
  await page.getByLabel('Din recension').fill(o.text);
  await page.getByRole('button', { name: 'Skicka recension' }).click();
  await expect(page.getByText('Tack för din recension!')).toBeVisible();
  return { ref, link };
}

async function deleteReviewsContaining(page: Page, text: string) {
  await ensureAdmin(page);
  await goAdmin(page, 'Recensioner');
  await expect(page.getByRole('tablist', { name: 'Filter' })).toBeVisible();
  for (const tab of [/Att granska/, /Publicerade/, /Avvisade & dolda/]) {
    await page.getByRole('tab', { name: tab }).click();
    const card = page.locator('main li', { hasText: text });
    await page.waitForTimeout(500);
    while (await card.first().isVisible().catch(() => false)) {
      await card.first().getByRole('button', { name: /^Ta bort recensionen/ }).click();
      await confirmDialog(page, 'Ta bort');
      await expect(card).toHaveCount(0);
    }
  }
}

test.describe('Admin – reviews', () => {
  test.setTimeout(240_000);

  test('moderation: reject, reconsider, publish, report, clear the report, hide and delete', async ({ page, context }) => {
    await adminLogin(page);
    const text = `E2E-recension: noggrant jobb och bra service ${Date.now()}.`;
    const author = 'E2E Granskare';
    try {
      const { ref } = await makeReview(page, context, { text, name: author, rating: 4 });

      await ensureAdmin(page);
      await goAdmin(page, 'Recensioner');
      const card = page.locator('main li', { hasText: text });
      const tab = (name: RegExp) => page.getByRole('tab', { name });
      const status = async (re: RegExp) => expect(card).toContainText(re);

      // ---- Pending: shows author, rating, verified booking and service ----
      await expect(tab(/Att granska/)).toHaveAttribute('aria-selected', 'true');
      await expect(card).toBeVisible();
      await expect(card.getByRole('img', { name: 'Betyg 4 av 5' })).toBeVisible();
      await expect(card).toContainText(author);
      await expect(card).toContainText('Verifierad bokning');
      await expect(card).toContainText(SERVICE);
      await status(/Väntar på granskning/);
      // Not public yet
      await page.goto('/');
      await expect(page.getByText(text)).toHaveCount(0);

      // ---- Reject → shows under "Avvisade & dolda" → back to review ----
      await goAdmin(page, 'Recensioner');
      await card.getByRole('button', { name: 'Avvisa' }).click();
      await expectToast(page, 'Recensionen är avvisad.');
      await expect(card).toHaveCount(0);
      await tab(/Avvisade & dolda/).click();
      await status(/Avvisad/);
      await card.getByRole('button', { name: 'Till granskning' }).click();
      await expectToast(page, 'Recensionen ligger åter för granskning.');
      await tab(/Att granska/).click();
      await expect(card).toBeVisible();

      // ---- Publish: public site shows it; the admin shows the internal average ----
      await card.getByRole('button', { name: 'Publicera' }).click();
      await expectToast(page, 'Recensionen är publicerad.');
      await tab(/Publicerade/).click();
      await status(/Publicerad/);
      await expect(page.getByText(/publicerade · snittbetyg \d,\d \(endast internt\)/)).toBeVisible();
      await page.goto('/');
      const reviews = page.locator('#recensioner');
      await expect(reviews.getByText(text)).toBeVisible();
      await expect(reviews.locator('li', { hasText: text }).getByRole('img', { name: 'Betyg 4 av 5' })).toBeVisible();

      // ---- A visitor reports it → admin sees it under "Rapporterade" ----
      await reviews.getByRole('button', { name: `Rapportera recensionen från ${author}` }).click();
      await expect(reviews.getByRole('button', { name: 'Recensionen är rapporterad' })).toBeDisabled();
      await ensureAdmin(page);
      await goAdmin(page, 'Recensioner');
      await tab(/Rapporterade/).click();
      await expect(card).toContainText('Rapporterad av en besökare');
      await card.getByRole('button', { name: 'Rensa rapport' }).click();
      await expectToast(page, 'Rapporteringen är rensad.');
      await expect(card).toHaveCount(0);

      // ---- The booking drawer mentions the review ----
      const drawer = await openBooking(page, ref);
      await expect(drawer).toContainText('Kunden har lämnat en recension (4/5) – publicerad.');
      await drawer.getByRole('button', { name: 'Stäng' }).click();

      // ---- Hide: gone from the site, kept in the admin ----
      await goAdmin(page, 'Recensioner');
      await tab(/Publicerade/).click();
      await card.getByRole('button', { name: 'Dölj' }).click();
      await expectToast(page, 'Recensionen är dold.');
      await page.goto('/');
      await expect(page.getByText(text)).toHaveCount(0);
      await ensureAdmin(page);
      await goAdmin(page, 'Recensioner');
      await tab(/Avvisade & dolda/).click();
      await status(/Dold/);

      // ---- Delete: cancel keeps, confirm removes ----
      await card.getByRole('button', { name: `Ta bort recensionen från ${author}` }).click();
      await confirmDialog(page, 'Avbryt');
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: `Ta bort recensionen från ${author}` }).click();
      await confirmDialog(page, 'Ta bort');
      await expectToast(page, 'Recensionen är borttagen.');
      await expect(card).toHaveCount(0);
    } finally {
      await deleteReviewsContaining(page, text);
    }
  });
});
