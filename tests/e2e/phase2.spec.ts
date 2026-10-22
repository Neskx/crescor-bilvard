import { expect, test } from '@playwright/test';
import { adminLogin, chooseCharity, chooseService, chooseWorkshop, fillDetails, firstFreeSlot, uniqueEmail } from './helpers';

test('homepage shows the packages, the charity initiative, partners and reviews — without invented figures', async ({ page }) => {
  await page.goto('/');

  const packages = page.locator('#tjanster');
  await expect(packages.getByRole('button', { name: /Boka denna tjänst/ })).toHaveCount(3);
  await expect(packages.getByText('650 kr')).toBeVisible();
  await expect(packages.getByText('ca 4,5–5 timmar')).toBeVisible();
  await expect(packages.getByText(/populär/i)).toHaveCount(0);

  const charity = page.locator('#valgorenhet');
  await expect(charity.getByRole('heading', { level: 2 })).toContainText('Renare bil');
  await expect(charity.getByRole('link', { name: /rodakorset\.se/ })).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(charity.getByRole('link', { name: /wfp\.org/ })).toBeVisible();
  await expect(charity).not.toContainText('%');
  await expect(charity.getByText('Ny Gemenskap')).toHaveCount(0); // inactive until verified

  const partners = page.locator('#samarbetspartners');
  await partners.scrollIntoViewIfNeeded();
  await expect(partners.getByRole('img', { name: 'Greentopia AB' })).toBeVisible();
  await expect(partners.getByRole('img', { name: 'BoxPark' })).toBeVisible();
  await expect(partners.getByRole('img', { name: 'Metallotech' })).toBeVisible();
  await expect(partners.getByText('SSM')).toHaveCount(0);
  await expect(partners.getByText('Jöhlteam')).toHaveCount(0); // hidden until spelling is confirmed

  await expect(page.locator('#recensioner').getByRole('heading', { level: 2 })).toContainText('kunder säger');
  // No fake aggregate rating in structured data
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.join(' ')).not.toMatch(/aggregateRating|ratingValue/);
});

test('review lifecycle: completed booking → personal link → customer review → admin publishes', async ({ page, context }) => {
  // A customer booking
  await page.goto('/#boka');
  await chooseService(page, 'Enkel Tvätt');
  await chooseWorkshop(page);
  await (await firstFreeSlot(page, 4)).click();
  await page.locator('#boka').getByRole('button', { name: 'Fortsätt' }).click();
  await fillDetails(page, uniqueEmail('review'));
  await page.locator('#boka').getByRole('button', { name: 'Fortsätt' }).click();
  await chooseCharity(page);
  await page.locator('#boka').getByRole('checkbox').check();
  await page.locator('#boka').getByRole('button', { name: /Bekräfta bokning/ }).click();
  const ref = (await page.locator('#boka').getByText(/^CB-[A-Z0-9]{6}$/).innerText()).trim();

  // Admin confirms, marks it completed and creates a review link
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  await adminLogin(page);
  await page.getByRole('navigation', { name: 'Administration' }).getByRole('link', { name: 'Bokningar' }).click();
  await page.getByPlaceholder(/Sök bokningsnr/).fill(ref);
  await page.getByRole('button', { name: new RegExp(ref) }).click();
  const drawer = page.getByRole('dialog', { name: 'Bokningsdetaljer' });
  await expect(drawer.getByText('Lämna bilen', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Bekräfta' }).click();
  await expect(drawer.getByText('Bekräftad', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Markera utförd' }).click();
  await expect(drawer.getByText('Utförd', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Kopiera länk' }).click();
  const link = await drawer.getByLabel('Recensionslänk').inputValue();
  expect(link).toMatch(/\/recension\?t=[A-Za-z0-9_-]{43}$/);

  // The customer leaves a review
  const text = `Mycket noggrant arbete och trevligt bemötande ${Date.now()}.`;
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hur var ditt');
  await page.getByRole('button', { name: 'Skicka recension' }).click();
  await expect(page.getByText('Välj ett betyg.')).toBeVisible();
  await page.getByRole('radio', { name: /^5 av 5/ }).click();
  await page.getByLabel('Namn som visas').fill('Testa T.');
  await page.getByLabel('Din recension').fill(text);
  await page.getByRole('button', { name: 'Skicka recension' }).click();
  await expect(page.getByText('Tack för din recension!')).toBeVisible();

  // The link cannot be used twice
  await page.goto(link);
  await expect(page.getByText('Länken kan inte användas')).toBeVisible();

  // Not public until approved
  await page.goto('/');
  await expect(page.getByText(text)).toHaveCount(0);

  await page.goto('/admin/recensioner');
  const card = page.locator('li', { hasText: text });
  await card.getByRole('button', { name: 'Publicera' }).click();
  await expect(page.getByText('Recensionen är publicerad.')).toBeVisible();

  await page.goto('/#recensioner');
  await expect(page.locator('#recensioner').getByText(text)).toBeVisible();
  await expect(page.locator('#recensioner').getByRole('img', { name: 'Betyg 5 av 5' }).first()).toBeVisible();

  // Hide it again so later runs start from a known state
  await page.goto('/admin/recensioner');
  await page.getByRole('tab', { name: /Publicerade/ }).click();
  await page.locator('li', { hasText: text }).getByRole('button', { name: 'Dölj' }).click();
  await expect(page.getByText('Recensionen är dold.')).toBeVisible();
});

test('admin sections: locations, partners and the charity programme', async ({ page }) => {
  await adminLogin(page);
  const nav = page.getByRole('navigation', { name: 'Administration' });

  await nav.getByRole('link', { name: 'Platser & hämtning' }).click();
  await expect(page.getByRole('heading', { name: 'Vi hämtar bilen' })).toBeVisible();
  await page.getByLabel('Postnummerområden').first().fill('21x');
  await page.getByRole('button', { name: 'Spara platsinställningar' }).click();
  await expect(page.getByText(/Postnummerområden anges som/)).toBeVisible();
  await page.getByLabel('Postnummerområden').first().fill('');

  await nav.getByRole('link', { name: 'Samarbetspartners' }).click();
  await expect(page.getByText('Greentopia AB')).toBeVisible();
  await page.locator('li', { hasText: 'Metallotech' }).getByRole('button', { name: 'Redigera' }).click();
  await page.locator('#pt-url').fill('inte-en-adress');
  await page.getByRole('button', { name: 'Spara', exact: true }).click();
  await expect(page.getByText(/Webbadressen måste börja med https/)).toBeVisible();
  await page.getByRole('button', { name: 'Avbryt' }).click();

  await nav.getByRole('link', { name: 'Välgörenhet' }).click();
  await expect(page.getByRole('heading', { name: 'Kundernas val' })).toBeVisible();
  await expect(page.getByText(/inga belopp räknas ut automatiskt/)).toBeVisible();

  // Switching the programme off hides it on the site; booking keeps working
  const toggle = page.getByRole('switch', { name: /Visa välgörenhetsinitiativet/ });
  await toggle.uncheck({ force: true });
  await expect(page.getByText(/Välgörenhetsinitiativet är dolt/)).toBeVisible();
  try {
    await page.goto('/');
    await expect(page.locator('#tjanster')).toBeVisible();
    await expect(page.locator('#valgorenhet')).toHaveCount(0);
    await page.goto('/#boka');
    await chooseService(page, 'Enkel Tvätt');
    await chooseWorkshop(page);
    await (await firstFreeSlot(page, 1)).click();
    await page.locator('#boka').getByRole('button', { name: 'Fortsätt' }).click();
    await fillDetails(page, uniqueEmail('nocharity'));
    await page.locator('#boka').getByRole('button', { name: 'Fortsätt' }).click();
    await expect(page.locator('#boka').getByRole('heading', { name: 'Sammanfattning' })).toBeVisible();
  } finally {
    await page.goto('/admin/valgorenhet');
    await page.getByRole('switch', { name: /Visa välgörenhetsinitiativet/ }).check({ force: true });
    await expect(page.getByText(/visas på webbplatsen och i bokningen/)).toBeVisible();
  }
});
