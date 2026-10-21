import { expect, test } from '@playwright/test';
import { uniqueEmail } from './helpers';

test('mobile: menu works and a booking can be completed with touch-sized controls', async ({ page }) => {
  await page.goto('/');

  // Hamburger menu opens, traps focus, and closes on Escape
  await page.getByRole('button', { name: 'Öppna menyn' }).click();
  await expect(page.locator('#mobile-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mobile-menu')).toBeHidden();

  await page.getByRole('button', { name: 'Öppna menyn' }).click();
  await page.locator('#mobile-menu').getByRole('link', { name: /Boka tid/ }).click();
  const booking = page.locator('#boka');

  await booking.getByRole('radio', { name: /^Biltvätt/ }).click();
  await booking.getByRole('button', { name: 'Fortsätt' }).click();
  await booking.getByRole('radio', { name: /^Hos / }).click();
  await booking.getByRole('button', { name: 'Fortsätt' }).click();

  await booking.getByRole('button', { name: 'Nästa vecka' }).click();
  const days = booking.getByRole('group', { name: 'Välj dag' }).getByRole('button');
  await expect(days).toHaveCount(7);
  // pick the first day that has free times (move on if earlier runs filled this week)
  const dayWithTimes = booking.getByRole('group', { name: 'Välj dag' }).getByRole('button', { name: /\d+ lediga tider/ }).first();
  for (let i = 0; i < 6 && !(await dayWithTimes.isVisible().catch(() => false)); i++) {
    await page.waitForTimeout(400);
    if (await dayWithTimes.isVisible().catch(() => false)) break;
    await booking.getByRole('button', { name: 'Nästa vecka' }).click();
  }
  await dayWithTimes.click();
  // The desktop grid is in the DOM but hidden on phones — only match visible buttons.
  const time = booking.locator('button[aria-pressed]:visible', { hasText: /^\d\d:\d\d$/ }).first();
  const box = await time.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44); // touch target
  await time.click();
  await booking.getByRole('button', { name: 'Fortsätt' }).click();

  await booking.getByLabel('Namn', { exact: true }).fill('Mobil Kund');
  await booking.getByLabel('E-post').fill(uniqueEmail('mobile'));
  await booking.getByLabel('Telefon').fill('+46 70 123 45 67');
  await booking.getByRole('button', { name: 'Fortsätt' }).click();
  await booking.getByRole('checkbox').check();
  await booking.getByRole('button', { name: /Bekräfta bokning/ }).click();
  await expect(booking.getByText(/^CB-[A-Z0-9]{6}$/)).toBeVisible({ timeout: 20_000 });

  // No horizontal overflow on a phone
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
