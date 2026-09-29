import { expect, test } from '@playwright/test';
import { E2E_API_ORIGIN } from '../playwright.config';

/** Mirrors the seed in apps/api/src/test/e2e-server.ts. */
const E2E_ORG_ID = '20000000-0000-4000-8000-000000000001';
const E2E_USER = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'e2e-owner@example.com',
  name: 'owner',
  image: null,
};

test('signed-out visitors land on the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in to Postrail' })).toBeVisible();
});

test('login with a test session, create a key, view logs', async ({ page, context }) => {
  // The e2e API accepts the session as a cookie instead of a Better Auth session.
  await context.addCookies([
    {
      name: 'postrail_test_user',
      value: encodeURIComponent(JSON.stringify(E2E_USER)),
      url: E2E_API_ORIGIN,
    },
  ]);

  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/o/${E2E_ORG_ID}$`));
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  // Create an API key and read it back from the one-time reveal.
  await page.getByRole('link', { name: 'API Keys' }).click();
  await expect(page.getByRole('heading', { name: 'API keys' })).toBeVisible();
  await page.getByRole('button', { name: 'Create key' }).first().click();
  await page.getByLabel('Name').fill('Smoke test');
  await page.getByRole('button', { name: 'Create key' }).last().click();
  await expect(page.getByRole('heading', { name: 'Key created' })).toBeVisible();
  const key = await page.getByTestId('secret-value').innerText();
  expect(key).toMatch(/^pr_live_/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('cell', { name: 'Smoke test', exact: true })).toBeVisible();

  // The seeded message is in the logs, and its drawer opens.
  await page.getByRole('link', { name: 'Logs' }).click();
  await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible();
  const row = page.getByRole('button', { name: 'Open message to first@example.com' });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole('dialog').getByText('Welcome to Postrail')).toBeVisible();
});
