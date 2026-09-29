/**
 * The API the Playwright smoke test talks to: in-memory fakes, no database, no Google.
 *
 * Sessions come from a `postrail_test_user` cookie holding the user as JSON, which is
 * what a browser can send where the unit tests use a header. This file is only ever
 * started by `apps/web/playwright.config.ts`; nothing in `src/index.ts` imports it.
 */
import { serve } from '@hono/node-server';
import { type SessionUser } from '../lib/context';
import { createTestApp } from './app';

export const E2E_COOKIE = 'postrail_test_user';
export const E2E_ORG_ID = '20000000-0000-4000-8000-000000000001';
export const E2E_USER_EMAIL = 'e2e-owner@example.com';

const port = Number(process.env.PORT ?? 8091);
const dashboardOrigin = process.env.DASHBOARD_ORIGIN ?? 'http://localhost:5174';

function cookieValue(headers: Headers, name: string): string | undefined {
  const header = headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

const t = createTestApp({
  dashboardOrigin,
  sessionResolver: (headers) => {
    const raw = cookieValue(headers, E2E_COOKIE);
    return Promise.resolve(raw ? (JSON.parse(raw) as SessionUser) : null);
  },
});

// One owner, one mailbox and one sent message so the pages have something to show.
const owner = t.member(E2E_ORG_ID, 'owner', E2E_USER_EMAIL);
const org = t.orgStore.orgs.find((o) => o.id === E2E_ORG_ID);
if (org) org.name = 'E2E Org';
const mailbox = t.store.add(E2E_ORG_ID, { email: 'sender@example.com' });
void t.emailStore
  .insert(E2E_ORG_ID, {
    mailboxId: mailbox.id,
    idempotencyKey: null,
    toEmail: 'first@example.com',
    fromEmail: mailbox.email,
    subject: 'Welcome to Postrail',
    body: { html: '<p>Hello</p>', text: 'Hello', replyTo: null, headers: null },
  })
  .then(({ row }) => t.emailStore.markSent(E2E_ORG_ID, row.id, 'gmail-1', new Date()));

serve({ fetch: t.app.fetch, port }, () => {
  // Playwright waits for this line's URL before starting the browser.
  console.error(`e2e api listening on http://localhost:${port} as ${owner.email}`);
});
