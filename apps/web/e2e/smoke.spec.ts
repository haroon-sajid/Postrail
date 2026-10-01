import { expect, test, type BrowserContext } from '@playwright/test';
import { E2E_API_ORIGIN } from '../playwright.config';

/** Mirrors the seed in apps/api/src/test/e2e-server.ts. */
const E2E_ORG_ID = '20000000-0000-4000-8000-000000000001';
const E2E_USER = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'e2e-owner@example.com',
  name: 'owner',
  image: null,
};

/** The e2e API accepts the session as a cookie instead of a Better Auth session. */
async function signIn(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'postrail_test_user',
      value: encodeURIComponent(JSON.stringify(E2E_USER)),
      url: E2E_API_ORIGIN,
    },
  ]);
}

test('signed-out visitors land on the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});

test('login with a test session, create a key, view logs', async ({ page, context }) => {
  await signIn(context);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  // No org id in the address bar (ADR 0010).
  expect(new URL(page.url()).pathname).toBe('/');

  // Create an API key and read it back from the one-time reveal.
  await page.getByRole('link', { name: 'API Keys' }).click();
  await expect(page.getByRole('heading', { name: 'API keys' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/api-keys');
  await page.getByRole('button', { name: 'Create key' }).first().click();
  await page.getByLabel('Name').fill('Smoke test');
  await page.getByRole('button', { name: 'Create key' }).last().click();
  await expect(page.getByRole('heading', { name: 'Key created' })).toBeVisible();
  const key = await page.getByTestId('secret-value').innerText();
  expect(key).toMatch(/^pr_live_/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('cell', { name: 'Smoke test', exact: true })).toBeVisible();

  // The seeded message is in the logs, and its drawer opens.
  let listRequests = 0;
  page.on('request', (request) => {
    if (/\/emails\?/.test(request.url())) listRequests += 1;
  });
  await page.getByRole('link', { name: 'Logs' }).click();
  await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible();
  const row = page.getByRole('button', { name: 'Open message to first@example.com' });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole('dialog').getByText('Welcome to Postrail')).toBeVisible();
  // The list is fetched when the page opens, not once per render.
  await page.waitForTimeout(1000);
  expect(listRequests).toBeLessThan(5);
});

test('links that still carry an org id land on the clean path', async ({ page, context }) => {
  await signIn(context);
  await page.goto(`/o/${E2E_ORG_ID}/settings/members?tab=invites`);
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  const url = new URL(page.url());
  expect(url.pathname + url.search).toBe('/settings/members?tab=invites');
});

test('settings is one page with a tab per section, each with its own address', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto('/settings/members');
  const tabs = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(tabs.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
  // The sidebar has one Settings item for all of them, and it stays highlighted.
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }),
  ).toHaveAttribute('aria-current', 'page');

  await tabs.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/settings/profile');

  await tabs.getByRole('link', { name: /Audit log/ }).click();
  await expect(page.getByText('Coming soon')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});

test('the page header stays put while the page scrolls under it', async ({ page, context }) => {
  await signIn(context);
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/');
  const title = page.getByRole('heading', { name: 'Overview', level: 1 });
  await expect(title).toBeVisible();
  const before = await title.boundingBox();

  await page.getByRole('heading', { name: 'Recent failures' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Recent failures' })).toBeInViewport();
  // The panel scrolled, not the window, and the title did not move.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await title.boundingBox()).toEqual(before);

  // The next page starts from its top, not from where this one was left.
  await page.getByRole('link', { name: 'Billing', exact: true }).click();
  await expect(page.getByText('Monthly add-ons')).toBeInViewport();
});

test('the account menu opens account settings and switches between light, dark and system', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  const pickTheme = async (name: string) => {
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Theme' }).click();
    await page.getByRole('menuitemcheckbox', { name }).click();
  };

  await pickTheme('Dark');
  await expect(html).toHaveClass(/dark/);
  // System follows the operating system, live.
  await pickTheme('System');
  await expect(html).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });

  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
});

test('the sidebar footer opens help and the list of updates', async ({ page, context }) => {
  await signIn(context);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await sidebar.getByRole('button', { name: /Updates/ }).click();
  await expect(page.getByText("What's new")).toBeVisible();
  await page.keyboard.press('Escape');
  await sidebar.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByRole('complementary', { name: 'Assistant' })).toBeVisible();
});

test('the collapsed sidebar keeps its icon buttons styled and marks the current page', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto('/logs');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  // Each item is a square icon button around an 18px icon. When the link's classes were
  // lost, the icon fell back to its 24px default.
  const logs = page.getByRole('link', { name: 'Logs' });
  await expect(logs).toHaveAttribute('aria-current', 'page');
  const box = await logs.boundingBox();
  expect(box?.width).toBe(box?.height);
  expect(box?.width).toBeLessThan(40);
  const icon = await logs.locator('svg').boundingBox();
  expect(icon?.width).toBe(18);
  // The mark at the top of the rail is the way back out.
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
});

test('a modal is centred from the first frame of its enter animation', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto('/api-keys');
  // Freeze the enter animation on frame one, where the modal used to sit a full width off centre.
  await page.addStyleTag({
    content: `.motion-modal[data-state='open'] { animation-play-state: paused !important; }`,
  });
  await page.getByRole('button', { name: 'Create key' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'attached' });
  const offset = await dialog.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return {
      x: box.left + box.width / 2 - window.innerWidth / 2,
      y: box.top + box.height / 2 - window.innerHeight / 2,
    };
  });
  expect(Math.abs(offset.x)).toBeLessThan(2);
  expect(Math.abs(offset.y)).toBeLessThan(2);
});

test('the workspace switcher filters by name and opens the new workspace modal', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto('/');
  await page.getByRole('button', { name: /Switch workspace/ }).click();
  await page.getByLabel('Search workspaces').fill('no such workspace');
  await expect(page.getByText('No workspace found.')).toBeVisible();
  await page.getByRole('option', { name: 'Add another workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible();
});

test('the assistant opens beside the page, answers a set question and links into the product', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/webhooks');
  // Nothing to list yet: the empty state stands alone rather than inside a card.
  await expect(page.getByText('No webhooks yet')).toBeVisible();

  await page.getByRole('button', { name: 'Assistant' }).click();
  const panel = page.getByRole('complementary', { name: 'Assistant' });
  await panel.getByRole('button', { name: 'Why did my recent emails fail?' }).click();
  await panel.getByRole('link', { name: 'Open failed emails' }).click();
  await expect(page.getByRole('heading', { name: 'Logs', level: 1 })).toBeVisible();
  expect(new URL(page.url()).search).toBe('?status=failed');
  // Docked, it stays open across pages and across a reload.
  await page.reload();
  await expect(panel).toBeVisible();

  await panel.getByLabel('Ask the assistant').fill('what is the weather');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(panel.getByText(/only answer a few set questions/)).toBeVisible();
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  await expect(panel).toBeHidden();
});

test('a planned feature has a page that says so and points at what works today', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto('/');
  await page.getByRole('link', { name: /Alerts/ }).click();
  await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible();
  await expect(page.getByText('Coming soon')).toBeVisible();
  await page.getByRole('link', { name: 'Use webhooks for now' }).click();
  await expect(page.getByRole('heading', { name: 'Webhooks', level: 1 })).toBeVisible();
});

test('billing opens the tab named in the URL and its summary links switch tabs', async ({
  page,
  context,
}) => {
  await signIn(context);
  // Billing used to live under Settings; that address still lands on it.
  await page.goto('/settings/billing?tab=payments');
  await expect(page.getByRole('tab', { name: 'Payments' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(new URL(page.url()).pathname).toBe('/billing');
  await expect(page.getByRole('heading', { name: 'Billing history' })).toBeVisible();

  await page.getByRole('button', { name: 'Change plan' }).click();
  await expect(page.getByRole('heading', { name: 'Plans' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('?tab=packages');
  // Nothing can be bought yet, and the page says so instead of doing nothing.
  await page.getByRole('button', { name: 'Upgrade' }).first().click();
  await expect(page.getByText('Upgrading to Pro is not available yet')).toBeVisible();

  await page.getByRole('tab', { name: 'Utilization' }).click();
  await expect(page.getByRole('heading', { name: 'Consumption & capacity' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

// Last on purpose: it adds an org to the shared in-memory server.
test('a new workspace becomes the active one, survives a reload and can be switched back', async ({
  page,
  context,
}) => {
  // The longest flow here (create, reload, switch back); on a busy machine it outruns 30s.
  test.slow();
  await signIn(context);
  await page.goto('/logs');
  await page.getByRole('button', { name: /Switch workspace/ }).click();
  await page.getByRole('option', { name: 'Add another workspace' }).click();
  await page.getByLabel('Workspace name').fill('Second workspace');
  await page.getByRole('radio', { name: /Developer/ }).click();
  await page.getByRole('button', { name: 'Create workspace' }).click();

  const current = (name: string) =>
    page.getByRole('button', { name: `Switch workspace (current: ${name})` });
  await expect(current('Second workspace')).toBeVisible();
  // A developer's workspace opens on API keys, and the org never shows up in the path.
  expect(new URL(page.url()).pathname).toBe('/api-keys');
  await page.reload();
  await expect(current('Second workspace')).toBeVisible();

  await current('Second workspace').click();
  await page.getByRole('option', { name: 'E2E Org' }).click();
  await expect(current('E2E Org')).toBeVisible();
  // Switching between existing workspaces starts from the overview.
  expect(new URL(page.url()).pathname).toBe('/');
});
