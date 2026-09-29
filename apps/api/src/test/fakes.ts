import {
  createTokenCipher,
  generateApiKey,
  type MailboxStatus,
  type WebhookEvent,
} from '@postrail/shared';
import { type ApiKeyRecord, type ApiKeyStore } from '../modules/api-keys/repo';
import { type AuditInput } from '../modules/audit/service';
import {
  type EmailStore,
  type ListCursor,
  type MessageBodyRow,
  type MessageRow,
  type NewMessage,
  type TemplateRow,
} from '../modules/emails/repo';
import {
  type ConnectedMailboxInput,
  type MailboxStore,
  type MailboxSummary,
} from '../modules/mailboxes/repo';
import { type SuppressionRow, type SuppressionStore } from '../modules/suppressions/repo';
import { type TemplateStore } from '../modules/templates/repo';
import { type DeliveryRow, type EndpointRow, type WebhookStore } from '../modules/webhooks/repo';
import {
  createGoogleClient,
  type GoogleClient,
  type GoogleTokens,
} from '../providers/google-client';
import { type MailboxRow } from '../providers/types';
import { AppError } from '../lib/errors';

// Test doubles shared across api tests. Not a *.test.ts file, so vitest does not run it.

export const TEST_KEY_HEX = 'ab'.repeat(32);
export const testCipher = createTokenCipher(TEST_KEY_HEX);
export const TEST_INTERNAL_SECRET = 'test-internal-secret-0123456789';

export const testGoogleConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:8080/api/google/callback',
};

let counter = 0;
export function nextId(): string {
  return `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
}

/** Real `authUrl`, everything that touches the network is a stub with sensible defaults. */
export function fakeGoogleClient(overrides: Partial<GoogleClient> = {}): GoogleClient {
  const real = createGoogleClient(testGoogleConfig, () => {
    throw new Error('network access in tests');
  });
  const tokens: GoogleTokens = {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresIn: 3600,
  };
  return {
    authUrl: (params) => real.authUrl(params),
    exchangeCode: () => Promise.resolve(tokens),
    refreshAccessToken: () => Promise.resolve({ accessToken: 'access-2', expiresIn: 3600 }),
    getEmail: () => Promise.resolve('user@example.com'),
    sendRaw: () => Promise.resolve({ id: 'gmail-1' }),
    ...overrides,
  };
}

// ---------- mailboxes ----------

export interface InMemoryMailboxStore extends MailboxStore {
  rows: MailboxRow[];
  audits: Array<AuditInput & { orgId: string }>;
  /** Adds an already-connected mailbox, defaults active with fresh tokens. */
  add: (orgId: string, overrides?: Partial<MailboxRow>) => MailboxRow;
}

export function inMemoryMailboxStore(): InMemoryMailboxStore {
  const find = (orgId: string, id: string) =>
    store.rows.find((r) => r.orgId === orgId && r.id === id);

  const store: InMemoryMailboxStore = {
    rows: [],
    audits: [],

    add: (orgId, overrides = {}) => {
      const row: MailboxRow = {
        id: nextId(),
        orgId,
        email: `mailbox-${counter}@example.com`,
        provider: 'google',
        refreshTokenEnc: testCipher.encrypt('refresh'),
        accessTokenEnc: testCipher.encrypt('access'),
        accessExpiresAt: new Date(Date.now() + 3600_000),
        dailyLimit: 400,
        sentToday: 0,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
      store.rows.push(row);
      return row;
    },

    list: (orgId) => Promise.resolve(store.rows.filter((r) => r.orgId === orgId).map(summarize)),

    get: (orgId, id) => Promise.resolve(find(orgId, id)),

    upsertConnected: (orgId, input: ConnectedMailboxInput, audit) => {
      let row = store.rows.find((r) => r.orgId === orgId && r.email === input.email);
      if (row) {
        Object.assign(row, input, { status: 'active', updatedAt: new Date() });
      } else {
        row = store.add(orgId, { ...input, status: 'active' });
      }
      store.audits.push({ ...audit, orgId, target: row.id });
      return Promise.resolve(summarize(row));
    },

    remove: (orgId, id, audit) => {
      const before = store.rows.length;
      store.rows = store.rows.filter((r) => !(r.orgId === orgId && r.id === id));
      const removed = store.rows.length < before;
      if (removed) store.audits.push({ ...audit, orgId, target: id });
      return Promise.resolve(removed);
    },

    saveAccessToken: (orgId, id, accessTokenEnc, expiresAt) => {
      const row = find(orgId, id);
      if (row) Object.assign(row, { accessTokenEnc, accessExpiresAt: expiresAt });
      return Promise.resolve();
    },

    setStatus: (orgId, id, status: MailboxStatus) => {
      const row = find(orgId, id);
      if (row) row.status = status;
      return Promise.resolve();
    },

    pickForSend: (orgId, from) => {
      const candidates = store.rows
        .filter((r) => r.orgId === orgId && r.status === 'active' && r.sentToday < r.dailyLimit)
        .filter((r) => (from ? r.email === from : true))
        .sort((a, b) => a.sentToday - b.sentToday || a.createdAt.getTime() - b.createdAt.getTime());
      return Promise.resolve(candidates[0]);
    },

    incrementSentToday: (orgId, id) => {
      const row = find(orgId, id);
      if (row) row.sentToday += 1;
      return Promise.resolve();
    },

    resetDailyCounters: () => {
      const touched = store.rows.filter((r) => r.sentToday > 0);
      for (const row of touched) row.sentToday = 0;
      return Promise.resolve(touched.length);
    },
  };
  return store;
}

function summarize(row: MailboxRow): MailboxSummary {
  const { id, email, provider, status, dailyLimit, sentToday, createdAt } = row;
  return { id, email, provider, status, dailyLimit, sentToday, createdAt };
}

// ---------- api keys ----------

export interface InMemoryApiKeyStore extends ApiKeyStore {
  records: Array<ApiKeyRecord & { keyHash: string }>;
  touches: Array<{ id: string; at: Date }>;
  create: (orgId: string, options?: { revoked?: boolean }) => { id: string; raw: string };
}

export function inMemoryApiKeyStore(): InMemoryApiKeyStore {
  const store: InMemoryApiKeyStore = {
    records: [],
    touches: [],

    create: (orgId, options = {}) => {
      const key = generateApiKey();
      const record = {
        id: nextId(),
        orgId,
        keyHash: key.hash,
        revokedAt: options.revoked ? new Date() : null,
        lastUsedAt: null,
      };
      store.records.push(record);
      return { id: record.id, raw: key.raw };
    },

    findByHash: (keyHash) => Promise.resolve(store.records.find((r) => r.keyHash === keyHash)),

    touchLastUsed: (_orgId, id, at) => {
      const record = store.records.find((r) => r.id === id);
      if (record) record.lastUsedAt = at;
      store.touches.push({ id, at });
      return Promise.resolve();
    },
  };
  return store;
}

// ---------- templates + suppressions (shared rows so the send path sees CRUD results) ----------

export interface InMemoryTemplateStore extends TemplateStore {
  rows: TemplateRow[];
}

export function inMemoryTemplateStore(rows: TemplateRow[] = []): InMemoryTemplateStore {
  const find = (orgId: string, id: string) =>
    store.rows.find((r) => r.orgId === orgId && r.id === id);
  const store: InMemoryTemplateStore = {
    rows,
    create: (orgId, input) => {
      if (store.rows.some((r) => r.orgId === orgId && r.slug === input.slug)) {
        return Promise.reject(AppError.conflict(`template slug "${input.slug}" already exists`));
      }
      const row: TemplateRow = {
        id: nextId(),
        orgId,
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.rows.push(row);
      return Promise.resolve(row);
    },
    list: (orgId) => Promise.resolve(store.rows.filter((r) => r.orgId === orgId)),
    get: (orgId, id) => Promise.resolve(find(orgId, id)),
    update: (orgId, id, patch) => {
      const row = find(orgId, id);
      if (row) Object.assign(row, patch, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    remove: (orgId, id) => {
      // Mutate in place: the email store shares this array.
      const index = store.rows.findIndex((r) => r.orgId === orgId && r.id === id);
      if (index >= 0) store.rows.splice(index, 1);
      return Promise.resolve(index >= 0);
    },
  };
  return store;
}

export interface InMemorySuppressionStore extends SuppressionStore {
  rows: SuppressionRow[];
}

export function inMemorySuppressionStore(rows: SuppressionRow[] = []): InMemorySuppressionStore {
  const find = (orgId: string, email: string) =>
    store.rows.find((r) => r.orgId === orgId && r.email === email);
  const store: InMemorySuppressionStore = {
    rows,
    upsert: (orgId, email, reason) => {
      const existing = find(orgId, email);
      if (existing) return Promise.resolve(existing);
      const row: SuppressionRow = { orgId, email, reason, createdAt: new Date() };
      store.rows.push(row);
      return Promise.resolve(row);
    },
    list: (orgId, limit) =>
      Promise.resolve(store.rows.filter((r) => r.orgId === orgId).slice(0, limit)),
    get: (orgId, email) => Promise.resolve(find(orgId, email)),
    remove: (orgId, email) => {
      // Mutate in place: the email store shares this array.
      const index = store.rows.findIndex((r) => r.orgId === orgId && r.email === email);
      if (index >= 0) store.rows.splice(index, 1);
      return Promise.resolve(index >= 0);
    },
  };
  return store;
}

// ---------- emails ----------

export interface InMemoryEmailStore extends EmailStore {
  rows: MessageRow[];
  bodies: Map<string, MessageBodyRow>;
  templates: TemplateRow[];
  suppressions: SuppressionRow[];
  addTemplate: (orgId: string, overrides?: Partial<TemplateRow>) => TemplateRow;
  suppress: (orgId: string, email: string) => void;
}

export function inMemoryEmailStore(): InMemoryEmailStore {
  const find = (orgId: string, id: string) =>
    store.rows.find((r) => r.orgId === orgId && r.id === id);

  const store: InMemoryEmailStore = {
    rows: [],
    bodies: new Map(),
    templates: [],
    suppressions: [],

    addTemplate: (orgId, overrides = {}) => {
      const row: TemplateRow = {
        id: nextId(),
        orgId,
        slug: 'welcome',
        subject: 'Welcome {{name}}',
        html: '<p>Hi {{name}}, your code is {{code}}</p>',
        variables: ['name', 'code'],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
      store.templates.push(row);
      return row;
    },

    suppress: (orgId, email) => {
      store.suppressions.push({
        orgId,
        email: email.toLowerCase(),
        reason: 'manual',
        createdAt: new Date(),
      });
    },

    findByIdempotencyKey: (orgId, key) =>
      Promise.resolve(store.rows.find((r) => r.orgId === orgId && r.idempotencyKey === key)),

    insert: (orgId, { body, ...input }: NewMessage) => {
      if (input.idempotencyKey) {
        const existing = store.rows.find(
          (r) => r.orgId === orgId && r.idempotencyKey === input.idempotencyKey,
        );
        if (existing) return Promise.resolve({ row: existing, created: false });
      }
      const row: MessageRow = {
        id: nextId(),
        orgId,
        ...input,
        status: 'queued',
        providerMessageId: null,
        error: null,
        attempts: 0,
        sentAt: null,
        // Strictly increasing so keyset pagination has a deterministic order.
        createdAt: new Date(Date.now() + store.rows.length),
        updatedAt: new Date(),
      };
      store.rows.push(row);
      store.bodies.set(row.id, { messageId: row.id, orgId, ...body, createdAt: new Date() });
      return Promise.resolve({ row, created: true });
    },

    claimForSending: (orgId, id, leaseMs, now) => {
      const row = find(orgId, id);
      const stale = row?.status === 'sending' && row.updatedAt.getTime() < now.getTime() - leaseMs;
      if (!row || !(row.status === 'queued' || stale)) return Promise.resolve(undefined);
      Object.assign(row, { status: 'sending', attempts: row.attempts + 1, updatedAt: now });
      return Promise.resolve({ ...row });
    },

    getBody: (orgId, id) => {
      const body = store.bodies.get(id);
      return Promise.resolve(body?.orgId === orgId ? body : undefined);
    },

    markSent: (orgId, id, providerMessageId, sentAt) => {
      const row = find(orgId, id);
      if (row) Object.assign(row, { status: 'sent', providerMessageId, sentAt, error: null });
      store.bodies.delete(id);
      return Promise.resolve();
    },

    markFailed: (orgId, id, error) => {
      const row = find(orgId, id);
      if (row) Object.assign(row, { status: 'failed', error });
      store.bodies.delete(id);
      return Promise.resolve();
    },

    scheduleRetry: (orgId, id, error, now) => {
      const row = find(orgId, id);
      if (row) Object.assign(row, { status: 'queued', error, updatedAt: now });
      return Promise.resolve();
    },

    get: (orgId, id) => Promise.resolve(find(orgId, id)),

    list: (orgId, limit, cursor?: ListCursor) => {
      const after = (r: MessageRow) =>
        !cursor ||
        r.createdAt < cursor.createdAt ||
        (r.createdAt.getTime() === cursor.createdAt.getTime() && r.id < cursor.id);
      const rows = store.rows
        .filter((r) => r.orgId === orgId && after(r))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (b.id < a.id ? -1 : 1))
        .slice(0, limit);
      return Promise.resolve(rows);
    },

    isSuppressed: (orgId, email) =>
      Promise.resolve(
        store.suppressions.some((s) => s.orgId === orgId && s.email === email.toLowerCase()),
      ),

    findTemplate: (orgId, slug) =>
      Promise.resolve(store.templates.find((t) => t.orgId === orgId && t.slug === slug)),
  };
  return store;
}

// ---------- webhooks ----------

export interface InMemoryWebhookStore extends WebhookStore {
  endpoints: EndpointRow[];
  deliveries: DeliveryRow[];
}

export function inMemoryWebhookStore(): InMemoryWebhookStore {
  const findEndpoint = (orgId: string, id: string) =>
    store.endpoints.find((e) => e.orgId === orgId && e.id === id);
  const findDelivery = (orgId: string, id: string) =>
    store.deliveries.find((d) => d.orgId === orgId && d.id === id);

  const store: InMemoryWebhookStore = {
    endpoints: [],
    deliveries: [],

    createEndpoint: (orgId, input) => {
      const row: EndpointRow = {
        id: nextId(),
        orgId,
        url: input.url,
        secret: input.secretEnc,
        events: input.events,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.endpoints.push(row);
      return Promise.resolve(row);
    },
    listEndpoints: (orgId) => Promise.resolve(store.endpoints.filter((e) => e.orgId === orgId)),
    getEndpoint: (orgId, id) => Promise.resolve(findEndpoint(orgId, id)),
    updateEndpoint: (orgId, id, patch) => {
      const row = findEndpoint(orgId, id);
      if (row) Object.assign(row, patch, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    deleteEndpoint: (orgId, id) => {
      const before = store.endpoints.length;
      store.endpoints = store.endpoints.filter((e) => !(e.orgId === orgId && e.id === id));
      return Promise.resolve(store.endpoints.length < before);
    },
    listEndpointsForEvent: (orgId, event: WebhookEvent) =>
      Promise.resolve(store.endpoints.filter((e) => e.orgId === orgId && e.events.includes(event))),

    createDelivery: (orgId, input) => {
      const row: DeliveryRow = {
        ...input,
        orgId,
        status: 'pending',
        attempts: 0,
        responseCode: null,
        error: null,
        nextRetryAt: null,
        createdAt: new Date(Date.now() + store.deliveries.length),
        updatedAt: new Date(),
      };
      store.deliveries.push(row);
      return Promise.resolve(row);
    },
    claimDelivery: (orgId, id, leaseMs, now) => {
      const row = findDelivery(orgId, id);
      const stale = row?.status === 'sending' && row.updatedAt.getTime() < now.getTime() - leaseMs;
      if (!row || !(row.status === 'pending' || stale)) return Promise.resolve(undefined);
      Object.assign(row, { status: 'sending', attempts: row.attempts + 1, updatedAt: now });
      return Promise.resolve({ ...row });
    },
    markDelivered: (orgId, id, responseCode) => {
      const row = findDelivery(orgId, id);
      if (row)
        Object.assign(row, { status: 'delivered', responseCode, error: null, nextRetryAt: null });
      return Promise.resolve();
    },
    scheduleDeliveryRetry: (orgId, id, error, responseCode, nextRetryAt) => {
      const row = findDelivery(orgId, id);
      if (row) Object.assign(row, { status: 'pending', error, responseCode, nextRetryAt });
      return Promise.resolve();
    },
    markDeliveryFailed: (orgId, id, error, responseCode) => {
      const row = findDelivery(orgId, id);
      if (row) Object.assign(row, { status: 'failed', error, responseCode, nextRetryAt: null });
      return Promise.resolve();
    },
    listDeliveries: (orgId, endpointId, limit) =>
      Promise.resolve(
        store.deliveries
          .filter((d) => d.orgId === orgId && d.endpointId === endpointId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit),
      ),
  };
  return store;
}

/** Records every webhook POST and answers with a configurable status. */
export function fakeWebhookReceiver(status = 200) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const state = { status, throwNext: false };
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    if (state.throwNext) {
      state.throwNext = false;
      return Promise.reject(new TypeError('fetch failed'));
    }
    calls.push({
      url: typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url,
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: typeof init?.body === 'string' ? init.body : '',
    });
    return Promise.resolve(new Response(null, { status: state.status }));
  }) as typeof fetch;
  return { fetchImpl, calls, state };
}
