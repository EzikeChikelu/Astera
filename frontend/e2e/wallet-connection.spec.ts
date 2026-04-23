import { test, expect } from '@playwright/test';
import { freighterMockScript, MOCK_ADDRESS } from './mocks/freighter';

test.describe('Wallet Connection', () => {
  test('Connect Wallet button is visible on the home page', async ({ page }) => {
    await page.goto('/');
    const connectBtn = page.getByRole('button', { name: /connect wallet/i });
    await expect(connectBtn).toBeVisible();
  });

  test('Connect Wallet button is visible in the navbar', async ({ page }) => {
    await page.goto('/dashboard');
    const connectBtn = page.getByRole('button', { name: /connect wallet/i });
    await expect(connectBtn).toBeVisible();
  });

  test('shows Freighter-not-detected error when extension is absent', async ({ page }) => {
    // Mock Freighter reporting isConnected = false
    await page.addInitScript(freighterMockScript({ isConnected: false }));
    await page.goto('/');

    await page.getByRole('button', { name: /connect wallet/i }).click();

    await expect(
      page.getByText(/freighter not detected/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows connected address in navbar after successful connection', async ({ page }) => {
    // Patch the dynamic import so the mock freighter resolves correctly
    await page.addInitScript(freighterMockScript({ isConnected: true, isAllowed: true }));

    // Route the freighter bundle to return our mock
    await page.route('**/@stellar/freighter-api**', (route) => {
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          module.exports = {
            isConnected: () => Promise.resolve({ isConnected: true }),
            isAllowed: () => Promise.resolve({ isAllowed: true }),
            setAllowed: () => Promise.resolve({ isAllowed: true }),
            getAddress: () => Promise.resolve({ address: '${MOCK_ADDRESS}', error: null }),
            signTransaction: (xdr) => Promise.resolve({ signedTxXdr: xdr + '_signed', error: null }),
          };
        `,
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: /connect wallet/i }).click();

    // After connection, the truncated address should appear
    // Truncated: first 4 + last 4 chars of MOCK_ADDRESS
    const truncated = `${MOCK_ADDRESS.slice(0, 4)}...${MOCK_ADDRESS.slice(-4)}`;
    await expect(page.getByText(truncated)).toBeVisible({ timeout: 8000 });
  });

  test('navigation links are accessible before wallet connection', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /invest/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /new invoice/i })).toBeVisible();
  });

  test('Astera brand link navigates to home', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: /astera/i }).first().click();
    await expect(page).toHaveURL('/');
  });
});
