import { expect, type Page } from '@playwright/test';

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@crescor.test';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'LocalDevAdmin2026';

export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const booking = (page: Page) => page.locator('#boka');

export async function chooseService(page: Page, name: string) {
  await booking(page).getByRole('radio', { name: new RegExp(`^${name}`) }).click();
  await booking(page).getByRole('button', { name: 'Fortsätt' }).click();
}

export async function chooseWorkshop(page: Page) {
  await booking(page).getByRole('radio', { name: /^Hos / }).click();
  await booking(page).getByRole('button', { name: 'Fortsätt' }).click();
}

/** Moves to the given week offset and returns the first available slot button. */
export async function firstFreeSlot(page: Page, weeksAhead = 1) {
  for (let i = 0; i < weeksAhead; i++) await booking(page).getByRole('button', { name: 'Nästa vecka' }).click();
  const grid = booking(page).getByRole('group', { name: /^Tider vecka/ });
  await expect(grid).toBeVisible();
  const slot = grid.locator('button[aria-pressed]:enabled').first();
  // Earlier runs may have filled this week in the local DB: move on until a week has room.
  for (let i = 0; i < 6 && !(await slot.isVisible().catch(() => false)); i++) {
    await page.waitForTimeout(400);
    if (await slot.isVisible().catch(() => false)) break;
    await booking(page).getByRole('button', { name: 'Nästa vecka' }).click();
    await expect(grid).toBeVisible();
  }
  await expect(slot).toBeVisible();
  return slot;
}

export async function fillDetails(page: Page, email: string) {
  const b = booking(page);
  await b.getByLabel('Namn', { exact: true }).fill('Testa Testsson');
  await b.getByLabel('E-post').fill(email);
  await b.getByLabel('Telefon').fill('070-123 45 67');
  await b.getByLabel(/Registreringsnummer/).fill('abc 123');
}

export async function adminLogin(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('E-post').fill(ADMIN_EMAIL);
  await page.getByLabel('Lösenord').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Logga in' }).click();
  await expect(page.getByRole('heading', { name: 'Bokningar' })).toBeVisible();
}
