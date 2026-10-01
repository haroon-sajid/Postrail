import { test } from '@playwright/test';
import { E2E_API_ORIGIN } from '../playwright.config';

/**
 * Visual review aid, not an assertion suite: captures every page at four widths into
 * test-results/screens. Pages scroll inside the panel, so each shot is the first screenful. Run with `pnpm exec playwright test screenshots --grep-invert none`
 * or the `shots` project. Skipped in the normal run because it produces no assertions.
 */
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
  '/settings/profile',
  '/settings/audit-log',
  '/billing',
  '/billing?tab=payments',
  '/billing?tab=packages',
  // One planned-feature page stands for all of them; they share a component.
  '/broadcasts',
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
        await page.goto(sub || '/');
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.waitForTimeout(600);
        const name = sub === '' ? 'overview' : sub.slice(1).replace(/[/?=]/g, '-');
        await page.screenshot({
          path: `test-results/screens/${name}-${width}.png`,
          fullPage: true,
        });
      }
    }

    // Shell states that no route reaches on its own: collapsed sidebar, open account menu.
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('/logs');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'test-results/screens/shell-collapsed-1280.png' });
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/screens/shell-account-menu-1280.png' });
    await page.keyboard.press('Escape');
  });

  test('capture overlays', async ({ page, context }) => {
    test.setTimeout(180_000);
    await context.addCookies([
      {
        name: 'postrail_test_user',
        value: encodeURIComponent(JSON.stringify(E2E_USER)),
        url: E2E_API_ORIGIN,
      },
    ]);
    const shot = async (name: string) => {
      await page.waitForTimeout(400);
      await page.screenshot({ path: `test-results/screens/${name}-1280.png` });
    };
    const open = async (sub: string, button: string) => {
      await page.goto(sub);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.getByRole('button', { name: button }).first().click();
    };
    await page.setViewportSize({ width: 1280, height: 1000 });

    // The workspace switcher, then one modal of each width.
    await page.goto('/logs');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.getByRole('button', { name: /Switch workspace/ }).click();
    await shot('shell-workspace-menu');
    await page.getByRole('option', { name: 'Add another workspace' }).click();
    await shot('modal-create-workspace');
    await open('/webhooks', 'New webhook');
    await shot('modal-md-new-webhook');
    await open('/suppressions', 'Import');
    await shot('modal-md-import-suppressions');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await shot('modal-lg-command-palette');
    await page.keyboard.press('Escape');

    // The assistant docked beside a page (wide enough to dock), mid-conversation.
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/logs');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.getByRole('button', { name: 'Assistant' }).click();
    await page.getByRole('button', { name: 'Why did my recent emails fail?' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'test-results/screens/shell-assistant-1600.png' });
  });
});
