import { expect, test } from '@playwright/test';
import { adminLogin, chooseService, chooseWorkshop, fillDetails, firstFreeSlot, uniqueEmail } from './helpers';

test.describe('Customer booking journey', () => {
  test('books a mobile appointment end to end and gets a booking reference', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Boka bilvård/ }).first().click();
    const booking = page.locator('#boka');

    // Add-ons are optional and add up
    await expect(booking.getByRole('radio', { name: /^Biltvätt/ })).toHaveAttribute('aria-checked', 'true');
    await booking.getByRole('checkbox', { name: /Keramiskt sprayvax/ }).click();
    await booking.getByRole('checkbox', { name: /Fläckborttagning/ }).click();
    await expect(booking.getByText('150 kr', { exact: true })).toBeVisible();
    await chooseService(page, 'Biltvätt');

    // Mobile location requires a valid address
    await booking.getByRole('radio', { name: /^På din adress/ }).click();
    await booking.getByRole('button', { name: 'Fortsätt' }).click();
    await expect(booking.getByText('Ange gatuadress.')).toBeVisible();
    await page.getByLabel('Gatuadress').fill('Testvägen 5');
    await page.getByLabel('Postnummer').fill('2111');
    await page.getByLabel('Ort').fill('Malmö');
    await booking.getByRole('button', { name: 'Fortsätt' }).click();
    await expect(booking.getByText(/Postnumret ska bestå av fem siffror/)).toBeVisible();
    await page.getByLabel('Postnummer').fill('211 15');
    await booking.getByRole('button', { name: 'Fortsätt' }).click();

    const slot = await firstFreeSlot(page, 1);
    await slot.click();
    await expect(booking.getByText('Vald tid')).toBeVisible();
    await booking.getByRole('button', { name: 'Fortsätt' }).click();

    // Required fields are enforced before continuing
    await booking.getByRole('button', { name: 'Fortsätt' }).click();
    await expect(booking.getByText('Ange ditt namn.')).toBeVisible();
    await fillDetails(page, uniqueEmail('journey'));
    await booking.getByRole('button', { name: 'Fortsätt' }).click();

    await expect(booking.getByRole('heading', { name: 'Sammanfattning' })).toBeVisible();
    await expect(booking.getByText('Testvägen 5, 211 15 Malmö')).toBeVisible();
    await expect(booking.getByText('Keramiskt sprayvax')).toBeVisible();
    await expect(booking.getByText(/Tjänsten enligt offert \+ tillägg 150 kr/)).toBeVisible();

    // Privacy acceptance required
    await booking.getByRole('button', { name: /Bekräfta bokning/ }).click();
    await expect(booking.getByText(/godkänna integritetsinformationen/)).toBeVisible();
    await booking.getByRole('checkbox', { name: /integritetspolicyn/ }).check();
    await booking.getByRole('button', { name: /Bekräfta bokning/ }).click();

    await expect(booking.getByRole('heading', { name: /reserverad|bekräftad/ })).toBeVisible({ timeout: 20_000 });
    await expect(booking.getByText(/^CB-[A-Z0-9]{6}$/)).toBeVisible();
    // Email is not configured locally: the UI must not claim one was sent
    await expect(booking.getByText(/har skickats till/)).toHaveCount(0);
  });

  test('keeps entered information after a page refresh', async ({ page }) => {
    await page.goto('/#boka');
    await chooseService(page, 'Biltvätt');
    await chooseWorkshop(page);
    await (await firstFreeSlot(page, 1)).click();
    await page.locator('#boka').getByRole('button', { name: 'Fortsätt' }).click();
    await page.locator('#boka').getByLabel('Namn', { exact: true }).fill('Kvar Efter Omladdning');
    await page.reload();
    await expect(page.locator('#boka').getByLabel('Namn', { exact: true })).toHaveValue('Kvar Efter Omladdning');
  });

  test('two customers racing for the same slot: exactly one succeeds', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const [a, b] = [await ctxA.newPage(), await ctxB.newPage()];

    // Both pick the same first free slot two weeks ahead
    for (const [p, tag] of [
      [a, 'raceA'],
      [b, 'raceB'],
    ] as const) {
      await p.goto('/#boka');
      await chooseService(p, 'Biltvätt');
      await chooseWorkshop(p);
      await (await firstFreeSlot(p, 2)).click();
      await p.locator('#boka').getByRole('button', { name: 'Fortsätt' }).click();
      await fillDetails(p, uniqueEmail(tag));
      await p.locator('#boka').getByRole('button', { name: 'Fortsätt' }).click();
      await p.locator('#boka').getByRole('checkbox').check();
    }
    const timeA = await a.locator('#boka dd').nth(1).innerText();
    const timeB = await b.locator('#boka dd').nth(1).innerText();
    expect(timeA).toBe(timeB);

    // Submit simultaneously
    await Promise.all([
      a.locator('#boka').getByRole('button', { name: /Bekräfta bokning/ }).click(),
      b.locator('#boka').getByRole('button', { name: /Bekräfta bokning/ }).click(),
    ]);

    const success = (p: typeof a) => p.locator('#boka').getByText(/^CB-[A-Z0-9]{6}$/);
    const conflict = (p: typeof a) => p.locator('#boka').getByText('Den valda tiden är tyvärr inte längre tillgänglig. Välj en annan tid.');
    await expect(async () => {
      const results = await Promise.all([success(a).count(), success(b).count(), conflict(a).count(), conflict(b).count()]);
      expect(results[0] + results[1]).toBe(1);
      expect(results[2] + results[3]).toBe(1);
    }).toPass({ timeout: 20_000 });

    // The loser is sent back to the calendar with their details intact
    const loser = (await success(a).count()) ? b : a;
    await expect(loser.locator('#boka').getByRole('heading', { name: 'Välj dag och tid' })).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });

  test('a slot that is booked shows as unavailable to others', async ({ page }) => {
    await page.goto('/#boka');
    await chooseService(page, 'Biltvätt');
    await chooseWorkshop(page);
    await page.locator('#boka').getByRole('button', { name: 'Nästa vecka' }).click();
    await page.locator('#boka').getByRole('button', { name: 'Nästa vecka' }).click();
    // The race test above booked a slot this week; at least one is disabled now.
    await expect(page.locator('#boka').getByRole('group', { name: /^Tider vecka/ }).locator('button[aria-pressed]:disabled').first()).toBeVisible();
  });
});

test.describe('Administration', () => {
  test('requires login and rejects wrong credentials', async ({ page }) => {
    await page.goto('/admin/bokningar');
    await expect(page.getByRole('heading', { name: 'Logga in' })).toBeVisible();
    await page.getByLabel('E-post').fill('admin@crescor.test');
    await page.getByLabel('Lösenord').fill('wrong-password-123');
    await page.getByRole('button', { name: 'Logga in' }).click();
    await expect(page.getByText('Fel e-postadress eller lösenord.')).toBeVisible();
  });

  test('admin confirms, reschedules and cancels a booking', async ({ page }) => {
    // Create a booking as a customer first
    const email = uniqueEmail('admin');
    await page.goto('/#boka');
    await chooseService(page, 'Biltvätt');
    await chooseWorkshop(page);
    await (await firstFreeSlot(page, 3)).click();
    await page.locator('#boka').getByRole('button', { name: 'Fortsätt' }).click();
    await fillDetails(page, email);
    await page.locator('#boka').getByRole('button', { name: 'Fortsätt' }).click();
    await page.locator('#boka').getByRole('checkbox').check();
    await page.locator('#boka').getByRole('button', { name: /Bekräfta bokning/ }).click();
    const ref = (await page.locator('#boka').getByText(/^CB-[A-Z0-9]{6}$/).innerText()).trim();

    await adminLogin(page);
    await page.getByPlaceholder(/Sök bokningsnr/).fill(ref);
    await page.getByRole('button', { name: new RegExp(ref) }).click();
    const drawer = page.getByRole('dialog', { name: 'Bokningsdetaljer' });
    await expect(drawer.getByText('Väntar på bekräftelse')).toBeVisible();

    await drawer.getByRole('button', { name: 'Bekräfta' }).click();
    await expect(drawer.getByText('Bekräftad', { exact: true })).toBeVisible();

    // Reschedule to an invalid time outside business hours → rejected
    await drawer.getByRole('button', { name: 'Flytta' }).click();
    await drawer.getByLabel('Ny starttid').fill('03:00');
    await drawer.getByRole('button', { name: 'Spara ny tid' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Flytta' }).last().click();
    await expect(page.getByText(/utanför öppettiderna/)).toBeVisible();

    // Cancel with confirmation
    await drawer.getByRole('button', { name: 'Avboka' }).click();
    await page.getByRole('button', { name: 'Avboka' }).last().click();
    await expect(drawer.getByText('Avbokad', { exact: true })).toBeVisible();
  });
});

test('contact form validates input and stores the message', async ({ page }) => {
  await page.goto('/#kontakt');
  const form = page.locator('#kontakt form');
  await form.getByRole('button', { name: /Skicka meddelande/ }).click();
  await expect(form.getByText('Ange ditt namn.')).toBeVisible();
  await form.getByLabel('Namn').fill('Kontakt Test');
  await form.getByLabel('E-post').fill('kontakt@example.com');
  await form.getByLabel('Meddelande').fill('Hej! Jag undrar över polering av en svart bil.');
  await form.getByRole('button', { name: /Skicka meddelande/ }).click();
  await expect(page.getByText('Tack för ditt meddelande!')).toBeVisible({ timeout: 15_000 });
});
