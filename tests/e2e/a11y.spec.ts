import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { chooseService, chooseWorkshop, firstFreeSlot } from './helpers';

async function audit(page: Page) {
  // Reveal scroll-animated content so it is audited at full opacity.
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-visible')));
  await page.waitForTimeout(1200);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test('homepage has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  await audit(page);
});

test('booking calendar and details steps have no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/#boka');
  await chooseService(page, 'Biltvätt');
  await chooseWorkshop(page);
  await firstFreeSlot(page, 1);
  await audit(page);
  await (await firstFreeSlot(page, 0)).click();
  await page.locator('#boka').getByRole('button', { name: 'Fortsätt' }).click();
  await page.locator('#boka').getByRole('button', { name: 'Fortsätt' }).click(); // trigger error state
  await audit(page);
});

for (const path of ['/tjanster', '/tjanster/biltvatt', '/boka', '/om-oss', '/kontakt']) {
  test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(path);
    await audit(page);
  });
}

test('privacy page and admin login have no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/integritetspolicy');
  await audit(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Logga in' })).toBeVisible();
  await audit(page);
});
