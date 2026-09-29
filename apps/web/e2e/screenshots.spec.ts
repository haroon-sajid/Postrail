import { test } from '@playwright/test';
import { E2E_API_ORIGIN } from '../playwright.config';

/**
 * Visual review aid, not an assertion suite: captures every page at four widths into
 * test-results/screens. Run with `pnpm exec playwright test screenshots --grep-invert none`
 * or the `shots` project. Skipped in the normal run because it produces no assertions.
 */
const E2E_ORG_ID = '20000000-0000-4000-8000-000000000001';
const E2E_USER = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'e2e-owner@example.com',
  name: 'owner',
  image: null,
};

const PAGES = [
  '',
  '/logs',
  '/mailboxes',
  '/api-keys',
  '/templates',
  '/webhooks',
  '/suppressions',
  '/settings',
  '/settings/members',
  '/settings/billing',
];
const WIDTHS = [1920, 1280, 768, 375];

test.describe('screenshots', () => {
  test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture');

  test('capture every page', async ({ page, context }) => {
    test.setTimeout(600_000);
    // Login is captured signed out, before the cookie exists.
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 800 ? 900 : 1000 });
      await page.goto('/login');
      await page.waitForTimeout(400);
      await page.screenshot({ path: `test-results/screens/login-${width}.png`, fullPage: true });
    }
    await context.addCookies([
      {
        name: 'postrail_test_user',
        value: encodeURIComponent(JSON.stringify(E2E_USER)),
        url: E2E_API_ORIGIN,
      },
    ]);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 800 ? 900 : 1000 });
      for (const sub of PAGES) {
        // Polling queries never let the network go idle, so wait on the heading instead.
        await page.goto(`/o/${E2E_ORG_ID}${sub}`);
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.waitForTimeout(600);
        const name = sub === '' ? 'overview' : sub.slice(1).replace(/\//g, '-');
        await page.screenshot({
          path: `test-results/screens/${name}-${width}.png`,
          fullPage: true,
        });
      }
    }
  });
});
