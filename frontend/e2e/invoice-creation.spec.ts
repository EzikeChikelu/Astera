import { test, expect } from '@playwright/test';
import { MOCK_ADDRESS } from './mocks/freighter';

/** Inject a connected wallet state into Zustand store via localStorage. */
async function injectConnectedWallet(page: import('@playwright/test').Page) {
  await page.addInitScript((address: string) => {
    // Zustand persist middleware reads from localStorage on mount.
    // Key must match the store's persist name.
    localStorage.setItem(
      'astera-wallet',
      JSON.stringify({ state: { wallet: { address, connected: true, network: 'testnet' } }, version: 0 })
    );
  }, MOCK_ADDRESS);
}

test.describe('Invoice Creation', () => {
  test('invoice creation page renders heading', async ({ page }) => {
    await page.goto('/invoice/new');
    await expect(page.getByRole('heading', { name: /tokenize invoice/i })).toBeVisible();
  });

  test('shows connect-wallet prompt when wallet is not connected', async ({ page }) => {
    await page.goto('/invoice/new');
    await expect(page.getByText(/connect your wallet first/i)).toBeVisible();
  });

  test('form renders all required fields when wallet is connected', async ({ page }) => {
    await injectConnectedWallet(page);
    await page.goto('/invoice/new');

    await expect(page.getByRole('textbox', { name: /debtor/i })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: /amount/i }).or(
      page.locator('input[name="amount"]')
    )).toBeVisible();
    await expect(page.locator('input[name="dueDate"]')).toBeVisible();
    await expect(page.getByRole('textbox', { name: /description/i }).or(
      page.locator('textarea[name="description"]')
    )).toBeVisible();
  });

  test('submit button is present when wallet is connected', async ({ page }) => {
    await injectConnectedWallet(page);
    await page.goto('/invoice/new');

    await expect(
      page.getByRole('button', { name: /tokenize|submit|create/i })
    ).toBeVisible();
  });

  test('form prevents submission with empty required fields', async ({ page }) => {
    await injectConnectedWallet(page);
    await page.goto('/invoice/new');

    // Click submit without filling in anything
    const submitBtn = page.getByRole('button', { name: /tokenize|submit|create/i });
    await submitBtn.click();

    // Browser native validation: page should not navigate away
    await expect(page).toHaveURL(/\/invoice\/new/);
  });

  test('navigating to /invoice/new from navbar works', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /new invoice/i }).click();
    await expect(page).toHaveURL('/invoice/new');
    await expect(page.getByRole('heading', { name: /tokenize invoice/i })).toBeVisible();
  });
});
