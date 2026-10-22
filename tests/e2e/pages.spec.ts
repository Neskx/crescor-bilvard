import { expect, test } from '@playwright/test';

test('main navigation reaches every subpage with its own title and heading', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Huvudmeny' });
  const pages: [string, RegExp, string][] = [
    ['Våra tjänster', /Våra tjänster/, '/tjanster'],
    ['Boka tid', /Boka bilvård online/, '/boka'],
    ['Om oss', /Om oss/, '/om-oss'],
    ['Kontakt', /Kontakt/, '/kontakt'],
  ];
  for (const [label, title, path] of pages) {
    await nav.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page).toHaveTitle(title);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await nav.getByRole('link', { name: 'Hem', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('service page shows facts and its booking button preselects the service', async ({ page }) => {
  await page.goto('/tjanster');
  await expect(page.getByRole('heading', { name: 'Tillägg' })).toBeVisible();
  await expect(page.getByText('Borttagning av djurhår', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Mini Rekond', exact: true }).first().click();
  await expect(page).toHaveURL(/\/tjanster\/mini-rekond$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mini Rekond' })).toBeVisible();
  await expect(page.getByText('Beräknad tid')).toBeVisible();
  await expect(page.getByText('ca 3–3,5 timmar')).toBeVisible();
  await expect(page.getByText('Handrengöring av fälgar')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Brödsmulor' })).toContainText('Våra tjänster');

  await page.locator('main a[href="/boka?tjanst=mini-rekond"]').first().click();
  await expect(page).toHaveURL(/\/boka$/); // query parameter is consumed
  const booking = page.locator('#boka');
  await expect(booking.getByRole('heading', { name: 'Välj plats' })).toBeVisible();
  await booking.getByRole('button', { name: 'Tillbaka' }).click();
  await expect(booking.getByRole('radio', { name: /^Mini Rekond/ })).toHaveAttribute('aria-checked', 'true');
});

test('the old placeholder service URL redirects to its successor', async ({ page }) => {
  await page.goto('/tjanster/biltvatt');
  await expect(page).toHaveURL(/\/tjanster\/enkel-tvatt$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Enkel Tvätt' })).toBeVisible();
});

test('unknown service shows a not-found page that is excluded from search', async ({ page }) => {
  await page.goto('/tjanster/finns-inte');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tjänsten finns inte');
  await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
});

test('official logo is used in header and footer, and links home', async ({ page }) => {
  await page.goto('/kontakt');
  const logos = page.locator('img[src="/logo/crescor-logo.webp"]');
  expect(await logos.count()).toBeGreaterThanOrEqual(2);
  await page.getByRole('link', { name: 'Crescor Bilvård – till startsidan' }).first().click();
  await expect(page).toHaveURL(/\/$/);
});
