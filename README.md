<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/postrail-logo-dark.svg" />
    <img src="apps/web/public/brand/postrail-logo-light.svg" alt="Postrail" width="280" />
  </picture>
</p>

# Postrail

Postrail is an email API that sends from your own Gmail mailbox. Your app calls one endpoint. Postrail sends the message through the mailbox you connected, so you can send transactional email without an email provider. The same API key signs your users in with Google, GitHub, an emailed link or an emailed code, and sends one announcement to a whole list of contacts without going over your mailbox's daily limit. A dashboard shows every message, mailbox, key, template, webhook, suppression, contact, broadcast and user.

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Why Postrail

Most apps only need to send a few hundred emails a day. Signing up with an email provider means a new domain, DNS records, a warm up period and a reputation you have to earn. You already have a mailbox that sends fine. Postrail lets your app send through that mailbox with an API key. Messages come from your real address, land where your normal mail lands, and you keep control of the account.

## How it works

```
+-----------+   POST /v1/emails    +---------------+   Gmail API   +--------------------+           +-----------+
| Your app  | -------------------> | Postrail API  | ------------> | Your Gmail mailbox | --------> | Recipient |
+-----------+   201 { queued }     +---------------+               +--------------------+           +-----------+
                                          |
                                          | email.sent, email.failed
                                          v
                                   +---------------+
                                   | Your webhook  |
                                   +---------------+
```

Postrail stores the message, queues it and returns at once. A worker sends it through the Gmail API with the OAuth token you granted. Postrail never stores your Gmail password. Message bodies are kept so you can preview and resend a message from Logs. Sign-in emails are the exception: their content is never shown and is deleted once sent.

## Quickstart

1. Open the dashboard and sign in with Google or an emailed link.
2. Go to Mailboxes and connect a Gmail account. Google asks for permission to send mail as you. Nothing else.
3. Go to API Keys and create a key. It is shown once. It starts with `pr_live_`.
4. Send an email.

```bash
curl -X POST https://postrail.haroonsajid-ai.workers.dev/v1/emails \
  -H "Authorization: Bearer pr_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "to": "someone@example.com",
    "subject": "Your order is confirmed",
    "text": "Thanks for your order."
  }'
```

The response is `201`:

```json
{ "id": "5f2c3d0a-9d0e-4b3f-8f1a-3c2e9d1b7a11", "status": "queued" }
```

The same call in Node:

```js
const res = await fetch('https://postrail.haroonsajid-ai.workers.dev/v1/emails', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer pr_live_...',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    to: 'someone@example.com',
    subject: 'Your order is confirmed',
    html: '<p>Thanks for your order.</p>',
  }),
});
const { id, status } = await res.json();
```

Poll `GET /v1/emails/{id}` until `status` is `sent` or `failed`, or subscribe to a webhook.

## Features

| Feature           | What it does                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Send              | `POST /v1/emails` with `to`, `subject` and `html` or `text`. Optional `from`, `reply_to` and custom `headers`.                                      |
| Batch             | `POST /v1/emails/batch` sends up to 100 messages in one call. Each item succeeds or fails on its own.                                               |
| Idempotency       | Send the `Idempotency-Key` header, or `idempotency_key` per batch item. A repeat returns the first message.                                         |
| Queue and retries | Sends are queued and retried on transient errors after 30 s, 2 min, 8 min and 30 min. Five attempts in total.                                       |
| Templates         | Store a subject and HTML body with `{{name}}` placeholders. Send with `template` and `variables`.                                                   |
| Suppressions      | A per org deny list. A send to a listed address fails before a mailbox is touched. Import up to 1000 at once.                                       |
| Hard bounces      | When Gmail rejects a recipient as invalid, the address is added to the suppression list automatically.                                              |
| Webhooks          | Signed HTTP calls for email, mailbox and user events, with retries and a delivery log. See [Webhooks](#webhooks).                                   |
| Contacts          | Keep recipients with the properties your templates use. Group them into lists. Import a CSV.                                                        |
| Broadcasts        | Send one template to a whole list, paced over days so each mailbox stays inside its limit. See [Contacts and broadcasts](#contacts-and-broadcasts). |
| Mailboxes         | Connect more than one Gmail account. Set a daily limit per mailbox. Pause and resume. Postrail picks the least used one.                            |
| Logs              | Every message with status, attempts, error and timestamps. Filter by status, mailbox, date and text.                                                |
| Sign-in           | Sign your app's users in with Google, GitHub, a magic link or a six-digit email code. See [Sign in your users](#sign-in-your-users).                |
| Dashboard         | Overview stats, logs, mailboxes, API keys, templates, webhooks, suppressions, contacts, broadcasts, users, sign-in methods and settings.            |
| Organisations     | Invite members by email with roles `owner`, `admin` and `member`. Data is isolated per organisation.                                                |
| OpenAPI           | The spec is generated from the same schemas that validate requests. Swagger UI is served with the API.                                              |

Outlook is not supported yet. The dashboard shows it as coming soon.

## API

Base URL: `https://postrail.haroonsajid-ai.workers.dev`

Every `/v1` request needs the header `Authorization: Bearer pr_live_...`. Bodies and responses are JSON with snake_case fields. Timestamps are ISO 8601.

| Method | Path                             | What it does                                           |
| ------ | -------------------------------- | ------------------------------------------------------ |
| POST   | `/v1/emails`                     | Send one email                                         |
| POST   | `/v1/emails/batch`               | Send up to 100 emails                                  |
| GET    | `/v1/emails`                     | List emails, newest first, with a cursor               |
| GET    | `/v1/emails/{id}`                | Get one email                                          |
| POST   | `/v1/emails/{id}/resend`         | Queue a fresh copy of an earlier email                 |
| GET    | `/v1/mailboxes`                  | List connected mailboxes                               |
| PATCH  | `/v1/mailboxes/{id}`             | Change `daily_limit` or set `status` to `paused`       |
| POST   | `/v1/templates`                  | Create a template                                      |
| POST   | `/v1/templates/{id}/test`        | Send a test email rendered from a template             |
| POST   | `/v1/suppressions`               | Suppress an address                                    |
| POST   | `/v1/suppressions/import`        | Suppress up to 1000 addresses                          |
| GET    | `/v1/suppressions/{email}`       | Check one address                                      |
| POST   | `/v1/webhooks`                   | Create a webhook endpoint. The secret is returned once |
| GET    | `/v1/webhooks/{id}/deliveries`   | Recent deliveries with status and response code        |
| POST   | `/v1/webhooks/{id}/test`         | Send a sample event                                    |
| POST   | `/v1/contacts`                   | Add a contact, or update the one with that address     |
| POST   | `/v1/contacts/import`            | Add or update up to 1000 contacts                      |
| GET    | `/v1/contacts`                   | List contacts, newest first, with a cursor             |
| POST   | `/v1/contact-lists`              | Create a contact list                                  |
| POST   | `/v1/broadcasts`                 | Create a draft broadcast from a template and a list    |
| POST   | `/v1/broadcasts/{id}/send`       | Start sending a draft                                  |
| POST   | `/v1/broadcasts/{id}/cancel`     | Stop a broadcast that is sending                       |
| GET    | `/v1/broadcasts/{id}/recipients` | Each recipient and what happened to it                 |
| POST   | `/v1/auth/sign-in/google`        | Get a Google consent URL for one of your users         |
| POST   | `/v1/auth/sign-in/github`        | Get a GitHub consent URL for one of your users         |
| POST   | `/v1/auth/sign-in/magic-link`    | Email a one-time sign-in link                          |
| POST   | `/v1/auth/sign-in/otp`           | Email a six-digit sign-in code                         |
| POST   | `/v1/auth/sign-in/otp/verify`    | Check the code and get a session                       |
| POST   | `/v1/auth/exchange`              | Swap the `code` from a redirect for a session          |
| POST   | `/v1/auth/sessions/refresh`      | Get a fresh access token for a session                 |
| POST   | `/v1/auth/sessions/verify`       | Check a session token                                  |
| POST   | `/v1/auth/sessions/revoke`       | End a session                                          |
| GET    | `/v1/auth/users`                 | List your users, newest first, with a cursor           |
| POST   | `/v1/auth/users`                 | Add a user by hand                                     |

The full list, with request and response schemas, is in Swagger UI at `/docs` and in the spec at `/openapi.json`.

Errors always have one shape. Branch on `code`. The message is for people and may change.

```json
{ "error": { "code": "SUPPRESSED", "message": "someone@example.com is on the suppression list" } }
```

Codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `SUPPRESSED`, `NO_MAILBOX`, `RATE_LIMITED`, `INTERNAL_ERROR`.

## Webhooks

Create an endpoint with a URL and the events you want. The response includes `secret`. Store it. It is not shown again.

```bash
curl -X POST https://postrail.haroonsajid-ai.workers.dev/v1/webhooks \
  -H "Authorization: Bearer pr_live_..." \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://example.com/postrail", "events": ["email.sent", "email.failed"] }'
```

| Event                  | When                                                |
| ---------------------- | --------------------------------------------------- |
| `email.sent`           | Gmail accepted the message                          |
| `email.failed`         | All attempts failed, or the error was permanent     |
| `mailbox.disconnected` | The Gmail grant was revoked and the mailbox stopped |
| `user.created`         | Someone signed up to your app, or was added by hand |
| `user.signed_in`       | A user signed in. `data.method` says how            |
| `user.deleted`         | A user was deleted                                  |

Each delivery is a POST with a JSON body `{ id, event, created_at, data }` and these headers:

| Header                 | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| `Postrail-Signature`   | `v1=<hex>`, HMAC SHA-256 of `<timestamp>.<raw body>` with the secret |
| `Postrail-Timestamp`   | Unix seconds when the request was signed                             |
| `Postrail-Event`       | The event name                                                       |
| `Postrail-Delivery-Id` | Unique per delivery. Use it to drop duplicates                       |

Verify against the raw body bytes. Reject timestamps older than five minutes. Reply with a 2xx quickly; anything else is retried after 30 s, 1 min, 5 min, 15 min, 1 h, 3 h and 6 h, eight attempts in total.

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verify({ secret, rawBody, timestamp, signature }) {
  const provided = signature?.split(',').find((p) => p.startsWith('v1='));
  if (!provided || !timestamp) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isInteger(Number(timestamp)) || age > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  const actual = Buffer.from(provided.slice(3), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
```

A complete receiver with no dependencies is in [examples/webhook-receiver.mjs](examples/webhook-receiver.mjs).

## Contacts and broadcasts

A contact is an address with properties. A property fills the template placeholder of the same name, so `first_name` on a contact fills `{{first_name}}`.

```bash
# Add a contact and put it on a list. Sending the same address again updates it.
curl -X POST https://postrail.haroonsajid-ai.workers.dev/v1/contacts \
  -H "Authorization: Bearer pr_live_..." \
  -H "Content-Type: application/json" \
  -d '{ "email": "ada@example.com", "properties": { "first_name": "Ada" }, "list_ids": ["<list id>"] }'
```

In the dashboard, Contacts imports a CSV: the `email` column is the address and every other column becomes a property.

A broadcast sends one template to one list.

```bash
# 1. Create a draft. Nothing is sent yet.
curl -X POST https://postrail.haroonsajid-ai.workers.dev/v1/broadcasts \
  -H "Authorization: Bearer pr_live_..." \
  -H "Content-Type: application/json" \
  -d '{ "name": "October news", "template_id": "<template id>", "list_id": "<list id>" }'

# 2. Send it.
curl -X POST https://postrail.haroonsajid-ai.workers.dev/v1/broadcasts/<id>/send \
  -H "Authorization: Bearer pr_live_..."
```

| Thing             | Detail                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Pacing            | A broadcast uses at most 80% of each mailbox's daily limit. A bigger list carries on after the daily reset at 00:00 UTC.       |
| Application email | The other 20% is never used by a broadcast, so password resets and sign-in emails still go out on the day of a big send.       |
| What is sent      | The template and the list as they were when sending started. Editing either afterwards does not change the broadcast.          |
| Each recipient    | Is an ordinary message in Logs with its own status. `GET /v1/broadcasts/{id}/recipients` lists them.                           |
| Suppressed        | Addresses on the suppression list are skipped.                                                                                 |
| Missing property  | A contact without a property the template needs is not sent to. The rest of the broadcast carries on.                          |
| Unsubscribe       | Every email gets an unsubscribe link and the `List-Unsubscribe` header. Put `{{unsubscribe_url}}` in the template to place it. |
| Stopping          | `POST /v1/broadcasts/{id}/cancel` skips everyone still waiting. Messages already queued still go out.                          |

An unsubscribe adds the address to the suppression list with reason `unsubscribe`, so it applies to every later send, not only broadcasts.

## Sign in your users

Postrail can be the sign-in system for your app. Your server makes the calls with the same API key that sends your email. The key never reaches the browser, and there is nothing to install on the front end.

Set it up once in the dashboard under Sign-in methods:

1. Add the page in your app that finishes a sign-in as a redirect URL, for example `https://yourapp.com/auth/callback`. Postrail only sends people to URLs on this list.
2. Magic links and codes are sent from your connected mailbox, so connect one first.
3. Google sign-in works at once with Postrail's shared Google client. Its consent screen says Postrail. Before you launch, add your own Google client ID and secret so it shows your app's name.
4. GitHub sign-in needs your own GitHub OAuth app. Add its client ID and secret, then turn GitHub on.

Then a sign-in is a few calls:

```js
const postrail = (path, body) =>
  fetch('https://postrail.haroonsajid-ai.workers.dev/v1/auth' + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer pr_live_...', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => res.json());

// 1. Start. Redirect the browser to `url` for Google (or '/sign-in/github')...
const { url } = await postrail('/sign-in/google', {
  redirect_url: 'https://yourapp.com/auth/callback',
  state, // a random value you also keep in a cookie
});
// ...or email a link instead.
await postrail('/sign-in/magic-link', {
  email: 'someone@example.com',
  redirect_url: 'https://yourapp.com/auth/callback',
  state,
});

// 2. Both come back to your redirect URL with ?code=...&state=...
//    Check that state matches your cookie, then swap the code. It works once.
const { user, session, access_token, is_new_user } = await postrail('/exchange', { code });

// 3. Keep session.token and access_token in httpOnly cookies.
//    When the access token is about to expire, trade the session for a new one.
const fresh = await postrail('/sessions/refresh', { token: session.token });
if (!fresh.active) {
  // The session was revoked or ran out: sign the user out.
}
```

For a code instead of a link, call `/sign-in/otp` with the email, then `/sign-in/otp/verify` with the email and the six digits the user typed. It returns the same response.

### Check a login without calling Postrail

The access token is a signed JWT (ES256) that lasts 15 minutes. Verify it on every request against your workspace's public keys. This needs no API call, so it does not count against your rate limit. Sign-in methods in the dashboard shows the three values to use.

```js
import { createRemoteJWKSet, jwtVerify } from 'jose';

const keys = createRemoteJWKSet(
  new URL('https://postrail.haroonsajid-ai.workers.dev/api/jwks/<workspace id>'),
);

export async function currentUser(accessToken) {
  const { payload } = await jwtVerify(accessToken, keys, {
    issuer: 'https://postrail.haroonsajid-ai.workers.dev',
    audience: '<workspace id>',
  });
  return payload; // payload.sub is the user id, payload.email their address
}
```

| Thing            | Detail                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Users            | One user per email address per workspace. Signing in by link and later by Google is the same user.                        |
| Session token    | Opaque, starts with `prs_`, valid 30 days, can be revoked. Only a hash is stored.                                         |
| Access token     | A JWT valid 15 minutes. Verify it yourself, and refresh it with the session token.                                        |
| A dead session   | `sessions/verify` and `sessions/refresh` answer `200` with `active: false`. It is not an error.                           |
| Revoking         | Takes effect at the next refresh, so at most 15 minutes later. Call `sessions/verify` where it must be immediate.         |
| A failed sign-in | The redirect carries `?error=...` instead of `code`, for example `access_denied` or `email_not_verified`.                 |
| Sign out         | `POST /v1/auth/sessions/revoke` with the token, or `POST /v1/auth/users/{id}/revoke-sessions` for all.                    |
| Sign-up          | There is no separate call. The first sign-in creates the user and returns `is_new_user: true`.                            |
| Closed sign-ups  | Turn off "Allow new sign-ups" and only existing users get in. Add people with `POST /v1/auth/users` or on the Users page. |
| Your own emails  | Choose one of your templates for the link email and the code email. It must contain `{{url}}` or `{{code}}`.              |
| Email content    | A sign-in email is listed in Logs, but its content is never shown and is deleted once it is sent.                         |

A complete app with no dependencies is in [examples/sign-in-app.mjs](examples/sign-in-app.mjs).

## Limits

| Limit                     | Value                                                                     |
| ------------------------- | ------------------------------------------------------------------------- |
| Sends per mailbox per day | 400 by default. Set `daily_limit` up to 10,000 per mailbox.               |
| API requests per key      | 120 burst, then 2 per second                                              |
| Batch size                | 100 messages                                                              |
| Body size                 | 500,000 characters each for `html` and `text`                             |
| Suppression import        | 1,000 addresses per call                                                  |
| Webhook attempts          | 8 per event                                                               |
| Sign-in emails            | 5 per address every 15 minutes                                            |
| Sign-in link and code     | A link works for 15 minutes, a code for 10 and five guesses               |
| Redirect URLs             | 20 per workspace                                                          |
| Access token              | Valid 15 minutes. The session behind it lasts 30 days                     |
| Contact import            | 1,000 contacts per call. The dashboard sends as many calls as a CSV needs |
| Contact properties        | 50 per contact, 1,000 characters each                                     |
| Broadcast share           | 80% of each mailbox's daily limit                                         |

Gmail itself caps a free account at about 500 messages a day. The default of 400 leaves room for your own mail. The daily counter resets at 00:00 UTC.

Google has not yet completed verification of the Postrail OAuth app. Until it does, Google shows a warning screen when you connect a mailbox.

## Self hosting

| Part      | Stack                                                                                         |
| --------- | --------------------------------------------------------------------------------------------- |
| API       | Hono on Node 22, Neon Postgres via Drizzle, Better Auth. Runs on Render or Cloud Run.         |
| Dashboard | React with Vite. Served by a Cloudflare Worker that proxies the API so both share one origin. |
| Queue     | In process by default. Google Cloud Tasks when `QUEUE_DRIVER=cloudtasks`.                     |

Environment variables for the API. The API refuses to start if a required one is missing or malformed, and names the variable.

| Name                                                                                            | Required          | Description                                                                                       |
| ----------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                  | Yes               | Postgres connection string. Neon works on the free tier.                                          |
| `TOKEN_ENCRYPTION_KEY`                                                                          | Yes               | 32 bytes as 64 hex characters. Encrypts mailbox tokens and webhook secrets.                       |
| `BETTER_AUTH_SECRET`                                                                            | Yes               | Signs session cookies and magic links. At least 32 characters.                                    |
| `GOOGLE_CLIENT_ID`                                                                              | Yes               | OAuth client for sign in, mailbox connect and shared end-user sign-in. Enable the Gmail API.      |
| `GOOGLE_CLIENT_SECRET`                                                                          | Yes               | Its secret.                                                                                       |
| `GOOGLE_REDIRECT_URI`                                                                           | Yes               | `<API_ORIGIN>/api/google/callback`. Must match the Google console.                                |
| `API_ORIGIN`                                                                                    | In production     | Public URL users reach the API at. Behind the Worker this is the dashboard origin. Must be https. |
| `DASHBOARD_ORIGIN`                                                                              | In production     | Public URL of the dashboard. Invite links point here. Must be https.                              |
| `CORS_ORIGIN_PATTERN`                                                                           | No                | Wildcard origins to trust, such as preview builds. One `*` per host label.                        |
| `CORS_ORIGIN`                                                                                   | No                | Extra exact origins to trust, comma separated.                                                    |
| `SYSTEM_MAILBOX_EMAIL`                                                                          | No                | A connected mailbox that sends magic links and invites. Unset disables both.                      |
| `QUEUE_DRIVER`                                                                                  | No                | `local` (default) or `cloudtasks`.                                                                |
| `INTERNAL_SECRET`                                                                               | With `local`      | Bearer secret for the worker and cron routes under `/internal`.                                   |
| `GCP_PROJECT_ID`, `GCP_REGION`, `TASKS_QUEUE_NAME`, `WORKER_URL`, `TASKS_SERVICE_ACCOUNT_EMAIL` | With `cloudtasks` | Cloud Tasks queue and the service account it signs tokens as.                                     |
| `NODE_ENV`                                                                                      | No                | `development` (default), `test` or `production`.                                                  |
| `PORT`                                                                                          | No                | Default 8080.                                                                                     |
| `LOG_LEVEL`                                                                                     | No                | `debug`, `info` (default), `warn` or `error`.                                                     |

The dashboard needs no build variable. The Worker reads `API_UPSTREAM` from `apps/web/wrangler.jsonc`. Hosting details, including the Render and Cloudflare values, are in [docs/deploy.md](docs/deploy.md).

Run it locally. You need Node 22 and pnpm.

```bash
pnpm install
cp .env.example .env          # set DATABASE_URL and the Google client
pnpm db:migrate               # apply migrations
pnpm db:seed                  # create a demo org and print an API key once
pnpm dev                      # API on http://localhost:8080, Swagger UI at /docs
pnpm --filter @postrail/web dev   # dashboard on http://localhost:5173
```

## Project structure

```
apps/api          Hono HTTP API. One folder per feature under src/modules.
apps/web          React dashboard, Playwright smoke test, and the Cloudflare Worker in src/worker.ts.
packages/db       Drizzle schema, migrations and the Neon client. Every tenant table has row level security.
packages/shared   Zod schemas, types, constants, error codes, the env loader and webhook signing.
docs/adr          Architecture decision records. Start with 0001.
docs/deploy.md    How the API and dashboard are hosted.
examples          A webhook receiver and a sign-in app you can run locally.
brand             Logo and icon sources.
```

## Contributing

Read [CLAUDE.md](CLAUDE.md) for the working rules and [docs/adr](docs/adr) for why things are the way they are. Every feature gets a short ADR and tests. Before opening a pull request these must pass:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Security

Report a vulnerability by email to haroonsajid016@gmail.com. Do not open a public issue for it.

Mailbox OAuth tokens, webhook secrets, OAuth client secrets and the private keys that sign access tokens are encrypted at rest with AES-256-GCM. API keys, session tokens and sign-in codes are stored as a SHA-256 hash and the raw value is shown once. Message bodies are kept for preview and resend; the body of a sign-in email is never shown and is deleted once the send reaches `sent` or `failed`. Every tenant table carries `org_id` and Postgres row level security enforces the boundary.

## License

[MIT](LICENSE)
