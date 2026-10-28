import {
  type AuthProvider,
  createTokenCipher,
  generateApiKey,
  type MailboxStatus,
  type MemberRole,
  type WebhookEvent,
} from '@postrail/shared';
import { type AuditStore } from '../modules/audit/repo';
import { AppError } from '../lib/errors';
import { type ApiKeyListRow, type ApiKeyRecord, type ApiKeyStore } from '../modules/api-keys/repo';
import { type AuditInput } from '../modules/audit/service';
import {
  type AuthChallengeRow,
  type AuthSessionRow,
  type AuthSettingsRow,
  type AuthSigningKeyRow,
  type AuthStore,
  type AuthUserRow,
} from '../modules/auth/repo';
import {
  broadcastRoom,
  type BroadcastRow,
  type BroadcastStore,
  type RecipientCounts,
  type RecipientRow,
  recipientStatus,
} from '../modules/broadcasts/repo';
import {
  type ContactInput,
  type ContactListRow,
  type ContactRow,
  type ContactStore,
} from '../modules/contacts/repo';
import {
  type EmailListFilters,
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
import { type InviteRow, type OrgRow, type OrgStore } from '../modules/orgs/repo';
import { type SystemMailer } from '../modules/orgs/service';
import { type OverviewStore } from '../modules/overview/repo';
import { type SuppressionRow, type SuppressionStore } from '../modules/suppressions/repo';
import { type TemplateStore } from '../modules/templates/repo';
import { type DeliveryRow, type EndpointRow, type WebhookStore } from '../modules/webhooks/repo';
import {
  createGoogleClient,
  type GoogleClient,
  type GoogleTokens,
} from '../providers/google-client';
import { createGithubIdentityProvider } from '../providers/github-identity';
import { createGoogleIdentityProvider } from '../providers/google-identity';
import { type IdentityProfile, type IdentityProvider } from '../providers/identity';
import { type MailboxRow } from '../providers/types';

// Test doubles shared across api tests. Not a *.test.ts file, so vitest does not run it.

export const TEST_KEY_HEX = 'ab'.repeat(32);
export const testCipher = createTokenCipher(TEST_KEY_HEX);
export const TEST_INTERNAL_SECRET = 'test-internal-secret-0123456789';
export const TEST_DASHBOARD_ORIGIN = 'http://localhost:5173';
export const TEST_API_ORIGIN = 'http://localhost:8080';

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

export const testIdentityProfile: IdentityProfile = {
  id: 'provider-id-1',
  email: 'ada@example.com',
  emailVerified: true,
  name: 'Ada Lovelace',
  picture: 'https://example.com/ada.png',
};

/** Real `authUrl`; the code exchange answers with a fixed profile and records its input. */
export function fakeIdentityProvider(
  provider: AuthProvider,
  overrides: Partial<IdentityProvider> = {},
) {
  const noNetwork = () => {
    throw new Error('network access in tests');
  };
  const real =
    provider === 'google'
      ? createGoogleIdentityProvider(noNetwork)
      : createGithubIdentityProvider(noNetwork);
  const exchanges: Array<Parameters<IdentityProvider['fetchProfile']>[0]> = [];
  const client: IdentityProvider = {
    authUrl: (params) => real.authUrl(params),
    fetchProfile: (params) => {
      exchanges.push(params);
      return Promise.resolve(testIdentityProfile);
    },
    ...overrides,
  };
  return Object.assign(client, { exchanges });
}

// ---------- audit ----------

export interface InMemoryAuditStore extends AuditStore {
  entries: Array<AuditInput & { orgId: string }>;
}

export function inMemoryAuditStore(): InMemoryAuditStore {
  const store: InMemoryAuditStore = {
    entries: [],
    record: (orgId, entry) => {
      store.entries.push({ ...entry, orgId });
      return Promise.resolve();
    },
  };
  return store;
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
        lastUsedAt: null,
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
      if (row) {
        row.sentToday += 1;
        row.lastUsedAt = new Date();
      }
      return Promise.resolve();
    },

    resetDailyCounters: () => {
      const touched = store.rows.filter((r) => r.sentToday > 0);
      for (const row of touched) row.sentToday = 0;
      return Promise.resolve(touched.length);
    },

    update: (orgId, id, patch) => {
      const row = find(orgId, id);
      if (row) Object.assign(row, patch, { updatedAt: new Date() });
      return Promise.resolve(row ? summarize(row) : undefined);
    },

    findByEmailAnyOrg: (email) => Promise.resolve(store.rows.find((r) => r.email === email)),
  };
  return store;
}

function summarize(row: MailboxRow): MailboxSummary {
  const { id, email, provider, status, dailyLimit, sentToday, lastUsedAt, createdAt } = row;
  return { id, email, provider, status, dailyLimit, sentToday, lastUsedAt, createdAt };
}

// ---------- api keys ----------

export interface InMemoryApiKeyStore extends ApiKeyStore {
  records: Array<ApiKeyRecord & ApiKeyListRow & { keyHash: string }>;
  touches: Array<{ id: string; at: Date }>;
  create0: (orgId: string, options?: { revoked?: boolean }) => { id: string; raw: string };
}

export function inMemoryApiKeyStore(): InMemoryApiKeyStore {
  const store: InMemoryApiKeyStore = {
    records: [],
    touches: [],

    /** Test shortcut: a key with no creator, like the seed makes. */
    create0: (orgId, options = {}) => {
      const key = generateApiKey();
      const record = {
        id: nextId(),
        orgId,
        name: 'test',
        prefix: key.prefix,
        keyHash: key.hash,
        createdAt: new Date(),
        revokedAt: options.revoked ? new Date() : null,
        lastUsedAt: null,
        createdBy: null,
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

    create: (orgId, input) => {
      const record = {
        id: nextId(),
        orgId,
        name: input.name,
        prefix: input.prefix,
        keyHash: input.keyHash,
        createdAt: new Date(),
        revokedAt: null,
        lastUsedAt: null,
        createdBy: input.createdBy ? { id: input.createdBy, email: 'creator@example.com' } : null,
      };
      store.records.push(record);
      return Promise.resolve(record);
    },

    list: (orgId) => Promise.resolve(store.records.filter((r) => r.orgId === orgId)),

    revoke: (orgId, id, at) => {
      const record = store.records.find((r) => r.orgId === orgId && r.id === id);
      if (!record) return Promise.resolve(false);
      record.revokedAt ??= at;
      return Promise.resolve(true);
    },
  };
  return store;
}

// ---------- end-user auth ----------

export interface InMemoryAuthStore extends AuthStore {
  settings: AuthSettingsRow[];
  users: AuthUserRow[];
  identities: Array<{ orgId: string; userId: string; provider: AuthProvider; sub: string }>;
  sessions: AuthSessionRow[];
  challenges: AuthChallengeRow[];
  signingKeys: AuthSigningKeyRow[];
}

export function inMemoryAuthStore(): InMemoryAuthStore {
  const findUser = (orgId: string, id: string) =>
    store.users.find((u) => u.orgId === orgId && u.id === id);
  const findChallenge = (orgId: string, id: string) =>
    store.challenges.find((c) => c.orgId === orgId && c.id === id);
  const withProviders = (user: AuthUserRow) => ({
    ...user,
    providers: store.identities.filter((i) => i.userId === user.id).map((i) => i.provider),
  });
  const byEmail = (orgId: string, email: string) =>
    store.users.find((u) => u.orgId === orgId && u.email === email);
  const insertUser = (orgId: string, email: string, patch: Partial<AuthUserRow>) => {
    const user: AuthUserRow = {
      id: nextId(),
      orgId,
      email,
      emailVerified: false,
      name: null,
      image: null,
      lastSignInAt: null,
      // Strictly increasing so keyset pagination has a deterministic order.
      createdAt: new Date(Date.now() + store.users.length),
      updatedAt: new Date(),
      ...patch,
    };
    store.users.push(user);
    return user;
  };
  const resolveByEmail = (
    orgId: string,
    email: string,
    patch: Partial<AuthUserRow>,
    allowCreate: boolean,
  ) => {
    const existing = byEmail(orgId, email);
    if (existing) {
      Object.assign(existing, patch, { updatedAt: new Date() });
      return { user: existing, created: false };
    }
    return allowCreate ? { user: insertUser(orgId, email, patch), created: true } : undefined;
  };

  const store: InMemoryAuthStore = {
    settings: [],
    users: [],
    identities: [],
    sessions: [],
    challenges: [],
    signingKeys: [],

    getSettings: (orgId) => Promise.resolve(store.settings.find((s) => s.orgId === orgId)),
    saveSettings: (orgId, patch) => {
      let row = store.settings.find((s) => s.orgId === orgId);
      if (!row) {
        row = {
          orgId,
          appName: null,
          redirectUrls: [],
          googleEnabled: true,
          magicLinkEnabled: true,
          emailOtpEnabled: true,
          googleClientId: null,
          googleClientSecretEnc: null,
          githubEnabled: false,
          githubClientId: null,
          githubClientSecretEnc: null,
          signupsEnabled: true,
          magicLinkTemplate: null,
          otpTemplate: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.settings.push(row);
      }
      Object.assign(row, patch, { updatedAt: new Date() });
      return Promise.resolve(row);
    },

    resolveUserByIdentity: (orgId, input, allowCreate) => {
      const profile = {
        emailVerified: true,
        ...(input.name ? { name: input.name } : {}),
        ...(input.image ? { image: input.image } : {}),
      };
      const linked = store.identities.find(
        (i) => i.orgId === orgId && i.provider === input.provider && i.sub === input.providerUserId,
      );
      const existing = linked ? findUser(orgId, linked.userId) : undefined;
      if (existing) {
        Object.assign(existing, profile);
        return Promise.resolve({ user: existing, created: false });
      }
      const resolved = resolveByEmail(orgId, input.email, profile, allowCreate);
      if (resolved) {
        store.identities.push({
          orgId,
          userId: resolved.user.id,
          provider: input.provider,
          sub: input.providerUserId,
        });
      }
      return Promise.resolve(resolved);
    },
    resolveUserByEmail: (orgId, email, allowCreate) =>
      Promise.resolve(resolveByEmail(orgId, email, { emailVerified: true }, allowCreate)),
    findUserByEmail: (orgId, email) => Promise.resolve(byEmail(orgId, email)),
    createUser: (orgId, input) =>
      Promise.resolve(
        byEmail(orgId, input.email) ? undefined : insertUser(orgId, input.email, input),
      ),
    getUser: (orgId, id) => {
      const user = findUser(orgId, id);
      return Promise.resolve(user ? withProviders(user) : undefined);
    },
    listUsers: (orgId, limit, cursor, q) => {
      const needle = q?.toLowerCase();
      const after = (u: AuthUserRow) =>
        !cursor ||
        u.createdAt < cursor.createdAt ||
        (u.createdAt.getTime() === cursor.createdAt.getTime() && u.id < cursor.id);
      const matches = (u: AuthUserRow) =>
        !needle || u.email.includes(needle) || (u.name ?? '').toLowerCase().includes(needle);
      const rows = store.users
        .filter((u) => u.orgId === orgId && after(u) && matches(u))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (b.id < a.id ? -1 : 1))
        .slice(0, limit);
      return Promise.resolve(rows.map(withProviders));
    },
    deleteUser: (orgId, id) => {
      if (!findUser(orgId, id)) return Promise.resolve(false);
      // The foreign keys cascade in Postgres; do the same here.
      store.users = store.users.filter((u) => u.id !== id);
      store.identities = store.identities.filter((i) => i.userId !== id);
      store.sessions = store.sessions.filter((s) => s.userId !== id);
      store.challenges = store.challenges.filter((c) => c.userId !== id);
      return Promise.resolve(true);
    },
    recordSignIn: (orgId, userId, at) => {
      const user = findUser(orgId, userId);
      if (!user) return Promise.resolve(undefined);
      const firstSignIn = user.lastSignInAt === null;
      user.lastSignInAt = at;
      return Promise.resolve({ firstSignIn });
    },

    createChallenge: (orgId, input) => {
      store.challenges.push({
        provider: null,
        ...input,
        orgId,
        attempts: 0,
        consumedAt: null,
        createdAt: new Date(Date.now() + store.challenges.length),
      });
      return Promise.resolve();
    },
    deleteChallenge: (orgId, id) => {
      store.challenges = store.challenges.filter((c) => !(c.orgId === orgId && c.id === id));
      return Promise.resolve();
    },
    countEmailedSince: (orgId, email, since) =>
      Promise.resolve(
        store.challenges.filter(
          (c) =>
            c.orgId === orgId &&
            c.email === email &&
            c.kind !== 'oauth_code' &&
            c.createdAt >= since,
        ).length,
      ),
    redeemCode: (orgId, tokenHash, now) => {
      const row = store.challenges.find(
        (c) =>
          c.orgId === orgId &&
          c.tokenHash === tokenHash &&
          c.kind !== 'email_otp' &&
          !c.consumedAt &&
          c.expiresAt > now,
      );
      if (row) row.consumedAt = now;
      return Promise.resolve(row ? { ...row } : undefined);
    },
    supersedeOtps: (orgId, email, now) => {
      for (const c of store.challenges) {
        if (c.orgId === orgId && c.email === email && c.kind === 'email_otp' && !c.consumedAt) {
          c.consumedAt = now;
        }
      }
      return Promise.resolve();
    },
    findActiveOtp: (orgId, email, now) =>
      Promise.resolve(
        store.challenges
          .filter(
            (c) =>
              c.orgId === orgId &&
              c.email === email &&
              c.kind === 'email_otp' &&
              !c.consumedAt &&
              c.expiresAt > now,
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0],
      ),
    countOtpAttempt: (orgId, id) => {
      const row = findChallenge(orgId, id);
      if (row) row.attempts += 1;
      return Promise.resolve(row?.attempts ?? 0);
    },
    consumeChallenge: (orgId, id, now) => {
      const row = findChallenge(orgId, id);
      if (!row || row.consumedAt) return Promise.resolve(false);
      row.consumedAt = now;
      return Promise.resolve(true);
    },

    createSession: (orgId, input) => {
      const row: AuthSessionRow = {
        id: nextId(),
        orgId,
        ...input,
        revokedAt: null,
        createdAt: new Date(),
      };
      store.sessions.push(row);
      return Promise.resolve(row);
    },
    findSessionByHash: (orgId, tokenHash) =>
      Promise.resolve(store.sessions.find((s) => s.orgId === orgId && s.tokenHash === tokenHash)),
    revokeSession: (orgId, id, at) => {
      const row = store.sessions.find((s) => s.orgId === orgId && s.id === id);
      if (row) row.revokedAt ??= at;
      return Promise.resolve();
    },
    revokeUserSessions: (orgId, userId, at) => {
      const live = store.sessions.filter(
        (s) => s.orgId === orgId && s.userId === userId && !s.revokedAt && s.expiresAt > at,
      );
      for (const s of live) s.revokedAt = at;
      return Promise.resolve(live.length);
    },

    latestSigningKey: (orgId) =>
      Promise.resolve(store.signingKeys.filter((k) => k.orgId === orgId).at(-1)),
    createSigningKey: (orgId, input) => {
      const row: AuthSigningKeyRow = { ...input, orgId, createdAt: new Date() };
      store.signingKeys.push(row);
      return Promise.resolve(row);
    },
    listSigningKeys: (orgId) =>
      Promise.resolve(store.signingKeys.filter((k) => k.orgId === orgId).reverse()),
  };
  return store;
}

// ---------- contacts ----------

export interface InMemoryContactStore extends ContactStore {
  rows: ContactRow[];
  lists: ContactListRow[];
  members: Array<{ orgId: string; listId: string; contactId: string }>;
}

/** `suppressions` is the email store's array, so a contact shows as suppressed when it is. */
export function inMemoryContactStore(suppressions: SuppressionRow[] = []): InMemoryContactStore {
  const find = (orgId: string, id: string) =>
    store.rows.find((r) => r.orgId === orgId && r.id === id);
  const findList = (orgId: string, id: string) =>
    store.lists.find((l) => l.orgId === orgId && l.id === id);
  const view = (row: ContactRow) => ({
    ...row,
    listIds: store.members.filter((m) => m.contactId === row.id).map((m) => m.listId),
    suppressed: suppressions.some((s) => s.orgId === row.orgId && s.email === row.email),
  });
  const listView = (list: ContactListRow) => ({
    ...list,
    contactCount: store.members.filter((m) => m.listId === list.id).length,
  });
  /** Like the real one: ids that are not this org's are ignored. */
  const addMembers = (orgId: string, contactIds: string[], listIds: string[]) => {
    let added = 0;
    for (const listId of listIds.filter((id) => findList(orgId, id))) {
      for (const contactId of contactIds.filter((id) => find(orgId, id))) {
        if (store.members.some((m) => m.listId === listId && m.contactId === contactId)) continue;
        store.members.push({ orgId, listId, contactId });
        added += 1;
      }
    }
    return added;
  };
  const upsertRow = (orgId: string, input: ContactInput) => {
    const existing = store.rows.find((r) => r.orgId === orgId && r.email === input.email);
    if (existing) {
      existing.properties = { ...existing.properties, ...input.properties };
      existing.updatedAt = new Date();
      return { row: existing, created: false };
    }
    const row: ContactRow = {
      id: nextId(),
      orgId,
      ...input,
      // Strictly increasing so keyset pagination has a deterministic order.
      createdAt: new Date(Date.now() + store.rows.length),
      updatedAt: new Date(),
    };
    store.rows.push(row);
    return { row, created: true };
  };
  /** The CONFLICT the real repo raises from the unique index, or undefined when free. */
  const nameConflict = (orgId: string, name: string, exceptId?: string) =>
    store.lists.some((l) => l.orgId === orgId && l.name === name && l.id !== exceptId)
      ? AppError.conflict(`a list named "${name}" already exists`)
      : undefined;

  const store: InMemoryContactStore = {
    rows: [],
    lists: [],
    members: [],

    upsert: (orgId, input, listIds) => {
      const { row, created } = upsertRow(orgId, input);
      addMembers(orgId, [row.id], listIds);
      return Promise.resolve({ contact: view(row), created });
    },
    get: (orgId, id) => {
      const row = find(orgId, id);
      return Promise.resolve(row ? view(row) : undefined);
    },
    list: (orgId, limit, cursor, filters = {}) => {
      const q = filters.q?.toLowerCase();
      const after = (r: ContactRow) =>
        !cursor ||
        r.createdAt < cursor.createdAt ||
        (r.createdAt.getTime() === cursor.createdAt.getTime() && r.id < cursor.id);
      const onList = (r: ContactRow) =>
        !filters.listId ||
        store.members.some((m) => m.listId === filters.listId && m.contactId === r.id);
      const rows = store.rows
        .filter((r) => r.orgId === orgId && after(r) && onList(r) && (!q || r.email.includes(q)))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (b.id < a.id ? -1 : 1))
        .slice(0, limit);
      return Promise.resolve(rows.map(view));
    },
    update: (orgId, id, patch) => {
      const row = find(orgId, id);
      if (!row) return Promise.resolve(undefined);
      if (patch.properties) row.properties = patch.properties;
      row.updatedAt = new Date();
      if (patch.listIds) {
        store.members = store.members.filter((m) => m.contactId !== id);
        addMembers(orgId, [id], patch.listIds);
      }
      return Promise.resolve(view(row));
    },
    remove: (orgId, id) => {
      if (!find(orgId, id)) return Promise.resolve(false);
      store.rows = store.rows.filter((r) => r.id !== id);
      store.members = store.members.filter((m) => m.contactId !== id);
      return Promise.resolve(true);
    },
    importMany: (orgId, rows, listId) => {
      const results = rows.map((row) => upsertRow(orgId, row));
      if (listId) {
        addMembers(
          orgId,
          results.map((r) => r.row.id),
          [listId],
        );
      }
      const created = results.filter((r) => r.created).length;
      return Promise.resolve({ created, updated: results.length - created });
    },

    listLists: (orgId) =>
      Promise.resolve(
        store.lists
          .filter((l) => l.orgId === orgId)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(listView),
      ),
    getList: (orgId, id) => {
      const list = findList(orgId, id);
      return Promise.resolve(list ? listView(list) : undefined);
    },
    createList: (orgId, name) => {
      const taken = nameConflict(orgId, name);
      if (taken) return Promise.reject(taken);
      const list: ContactListRow = {
        id: nextId(),
        orgId,
        name,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.lists.push(list);
      return Promise.resolve(listView(list));
    },
    renameList: (orgId, id, name) => {
      const list = findList(orgId, id);
      if (!list) return Promise.resolve(undefined);
      const taken = nameConflict(orgId, name, id);
      if (taken) return Promise.reject(taken);
      list.name = name;
      return Promise.resolve(listView(list));
    },
    removeList: (orgId, id) => {
      if (!findList(orgId, id)) return Promise.resolve(false);
      store.lists = store.lists.filter((l) => l.id !== id);
      store.members = store.members.filter((m) => m.listId !== id);
      return Promise.resolve(true);
    },
    addToList: (orgId, listId, contactIds) =>
      Promise.resolve(addMembers(orgId, contactIds, [listId])),
    removeFromList: (orgId, listId, contactId) => {
      const before = store.members.length;
      store.members = store.members.filter(
        (m) => !(m.orgId === orgId && m.listId === listId && m.contactId === contactId),
      );
      return Promise.resolve(store.members.length < before);
    },
  };
  return store;
}

// ---------- broadcasts ----------

export interface InMemoryBroadcastStore extends BroadcastStore {
  rows: BroadcastRow[];
  recipientRows: RecipientRow[];
}

/** Reads the other fakes it depends on, the way the real repo joins their tables. */
export function inMemoryBroadcastStore(deps: {
  contacts: InMemoryContactStore;
  emails: InMemoryEmailStore;
  mailboxes: InMemoryMailboxStore;
}): InMemoryBroadcastStore {
  const find = (orgId: string, id: string) =>
    store.rows.find((r) => r.orgId === orgId && r.id === id);
  const view = (row: BroadcastRow) => ({
    ...row,
    templateSlug: deps.emails.templates.find((t) => t.id === row.templateId)?.slug ?? null,
    listName: deps.contacts.lists.find((l) => l.id === row.listId)?.name ?? null,
  });
  const messageStatus = (messageId: string | null) =>
    deps.emails.rows.find((m) => m.id === messageId)?.status ?? null;
  const waiting = (r: RecipientRow) => r.state === 'pending' || r.state === 'dispatching';

  const store: InMemoryBroadcastStore = {
    rows: [],
    recipientRows: [],

    create: (orgId, input) => {
      const row: BroadcastRow = {
        id: nextId(),
        orgId,
        ...input,
        status: 'draft',
        subject: null,
        html: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(Date.now() + store.rows.length),
        updatedAt: new Date(),
      };
      store.rows.push(row);
      return Promise.resolve(view(row));
    },
    list: (orgId) =>
      Promise.resolve(
        store.rows
          .filter((r) => r.orgId === orgId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map(view),
      ),
    get: (orgId, id) => {
      const row = find(orgId, id);
      return Promise.resolve(row ? view(row) : undefined);
    },
    updateDraft: (orgId, id, patch) => {
      const row = find(orgId, id);
      if (row?.status !== 'draft') return Promise.resolve(undefined);
      Object.assign(row, patch, { updatedAt: new Date() });
      return Promise.resolve(view(row));
    },
    remove: (orgId, id) => {
      const row = find(orgId, id);
      if (!row || row.status === 'sending') return Promise.resolve(false);
      store.rows = store.rows.filter((r) => r.id !== id);
      store.recipientRows = store.recipientRows.filter((r) => r.broadcastId !== id);
      return Promise.resolve(true);
    },
    start: (orgId, id, content, now) => {
      const row = find(orgId, id);
      if (row?.status !== 'draft') return Promise.resolve(undefined);
      Object.assign(row, content, { status: 'sending', startedAt: now, updatedAt: now });
      const members = deps.contacts.members.filter(
        (m) => m.orgId === orgId && m.listId === row.listId,
      );
      for (const member of members) {
        const contact = deps.contacts.rows.find((c) => c.id === member.contactId);
        if (!contact) continue;
        store.recipientRows.push({
          id: nextId(),
          orgId,
          broadcastId: id,
          contactId: contact.id,
          email: contact.email,
          properties: { ...contact.properties },
          state: 'pending',
          messageId: null,
          error: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      return Promise.resolve(members.length);
    },
    cancel: (orgId, id, now) => {
      const row = find(orgId, id);
      if (row?.status !== 'sending') return Promise.resolve(false);
      Object.assign(row, { status: 'canceled', completedAt: now, updatedAt: now });
      for (const r of store.recipientRows.filter((r) => r.broadcastId === id && waiting(r))) {
        Object.assign(r, { state: 'skipped', error: 'broadcast canceled', updatedAt: now });
      }
      return Promise.resolve(true);
    },
    complete: (orgId, id, now) => {
      const row = find(orgId, id);
      if (row?.status === 'sending') {
        Object.assign(row, { status: 'sent', completedAt: now, updatedAt: now });
      }
      return Promise.resolve();
    },
    counts: (orgId, ids) => {
      const byId = new Map<string, RecipientCounts>();
      for (const id of ids) {
        const rows = store.recipientRows.filter((r) => r.orgId === orgId && r.broadcastId === id);
        if (rows.length === 0) continue;
        const tally = (status: string) =>
          rows.filter((r) => recipientStatus(r.state, messageStatus(r.messageId)) === status)
            .length;
        byId.set(id, {
          total: rows.length,
          pending: tally('pending'),
          queued: tally('queued'),
          sent: tally('sent'),
          failed: tally('failed'),
          skipped: tally('skipped'),
        });
      }
      return Promise.resolve(byId);
    },

    claimRecipients: (orgId, broadcastId, limit, leaseMs, now) => {
      const stale = (r: RecipientRow) =>
        r.state === 'dispatching' && r.updatedAt.getTime() < now.getTime() - leaseMs;
      const claimed = store.recipientRows
        .filter((r) => r.orgId === orgId && r.broadcastId === broadcastId)
        .filter((r) => r.state === 'pending' || stale(r))
        .sort((a, b) => a.email.localeCompare(b.email))
        .slice(0, limit);
      for (const r of claimed) Object.assign(r, { state: 'dispatching', updatedAt: now });
      return Promise.resolve(claimed.map((r) => ({ ...r })));
    },
    settleRecipient: (orgId, id, outcome) => {
      const row = store.recipientRows.find((r) => r.orgId === orgId && r.id === id);
      if (row) {
        Object.assign(
          row,
          outcome.state === 'queued'
            ? { state: 'queued', messageId: outcome.messageId, error: null }
            : { state: outcome.state, error: outcome.error },
        );
      }
      return Promise.resolve();
    },
    releaseRecipients: (orgId, ids) => {
      for (const r of store.recipientRows) {
        if (r.orgId === orgId && ids.includes(r.id) && r.state === 'dispatching') {
          r.state = 'pending';
        }
      }
      return Promise.resolve();
    },
    countWaiting: (orgId, broadcastId) =>
      Promise.resolve(
        store.recipientRows.filter(
          (r) => r.orgId === orgId && r.broadcastId === broadcastId && waiting(r),
        ).length,
      ),
    mailboxRoom: (orgId) =>
      Promise.resolve(
        deps.mailboxes.rows
          .filter((m) => m.orgId === orgId && m.status === 'active')
          .map((m) => ({
            email: m.email,
            remaining: broadcastRoom(
              m.dailyLimit,
              m.sentToday,
              deps.emails.rows.filter(
                (e) => e.mailboxId === m.id && (e.status === 'queued' || e.status === 'sending'),
              ).length,
            ),
          }))
          .filter((m) => m.remaining > 0),
      ),
    recipients: (orgId, broadcastId, limit, afterEmail) =>
      Promise.resolve(
        store.recipientRows
          .filter((r) => r.orgId === orgId && r.broadcastId === broadcastId)
          .filter((r) => !afterEmail || r.email > afterEmail)
          .sort((a, b) => (a.email < b.email ? -1 : 1))
          .slice(0, limit)
          .map((r) => ({
            id: r.id,
            email: r.email,
            status: recipientStatus(r.state, messageStatus(r.messageId)),
            messageId: r.messageId,
            error: r.error ?? deps.emails.rows.find((m) => m.id === r.messageId)?.error ?? null,
          })),
      ),
    listSending: () =>
      Promise.resolve(
        store.rows.filter((r) => r.status === 'sending').map((r) => ({ orgId: r.orgId, id: r.id })),
      ),
  };
  return store;
}

// ---------- orgs ----------

export interface InMemoryOrgStore extends OrgStore {
  orgs: OrgRow[];
  members: Array<{ orgId: string; userId: string; role: MemberRole; joinedAt: Date }>;
  users: Map<string, { email: string; name: string }>;
  invites: InviteRow[];
  addUser: (id: string, email: string, name?: string) => void;
  addMember: (orgId: string, userId: string, role: MemberRole) => void;
}

export function inMemoryOrgStore(): InMemoryOrgStore {
  const store: InMemoryOrgStore = {
    orgs: [],
    members: [],
    users: new Map(),
    invites: [],

    addUser: (id, email, name = '') => {
      store.users.set(id, { email, name });
    },
    addMember: (orgId, userId, role) => {
      store.members.push({ orgId, userId, role, joinedAt: new Date() });
    },

    createOrgWithOwner: (userId, name) => {
      const org: OrgRow = { id: nextId(), name, createdAt: new Date(), updatedAt: new Date() };
      store.orgs.push(org);
      store.addMember(org.id, userId, 'owner');
      return Promise.resolve(org);
    },
    getOrg: (orgId) => Promise.resolve(store.orgs.find((o) => o.id === orgId)),
    updateOrg: (orgId, patch) => {
      const org = store.orgs.find((o) => o.id === orgId);
      if (org) Object.assign(org, patch, { updatedAt: new Date() });
      return Promise.resolve(org);
    },
    deleteOrg: (orgId) => {
      const before = store.orgs.length;
      store.orgs = store.orgs.filter((o) => o.id !== orgId);
      store.members = store.members.filter((m) => m.orgId !== orgId);
      return Promise.resolve(store.orgs.length < before);
    },
    listForUser: (userId) =>
      Promise.resolve(
        store.members
          .filter((m) => m.userId === userId)
          .flatMap((m) => {
            const org = store.orgs.find((o) => o.id === m.orgId);
            return org ? [{ org, role: m.role }] : [];
          }),
      ),
    getMembership: (userId, orgId) => {
      const m = store.members.find((x) => x.userId === userId && x.orgId === orgId);
      return Promise.resolve(m ? { role: m.role } : undefined);
    },
    listMembers: (orgId) =>
      Promise.resolve(
        store.members
          .filter((m) => m.orgId === orgId)
          .map((m) => {
            const u = store.users.get(m.userId) ?? { email: `${m.userId}@example.com`, name: '' };
            return {
              userId: m.userId,
              email: u.email,
              name: u.name,
              role: m.role,
              joinedAt: m.joinedAt,
            };
          }),
      ),
    countOwners: (orgId) =>
      Promise.resolve(store.members.filter((m) => m.orgId === orgId && m.role === 'owner').length),
    updateMemberRole: (orgId, userId, role) => {
      const m = store.members.find((x) => x.orgId === orgId && x.userId === userId);
      if (m) m.role = role;
      return Promise.resolve(m !== undefined);
    },
    removeMember: (orgId, userId) => {
      const before = store.members.length;
      store.members = store.members.filter((m) => !(m.orgId === orgId && m.userId === userId));
      return Promise.resolve(store.members.length < before);
    },
    createInvite: (orgId, input) => {
      const row: InviteRow = {
        id: nextId(),
        orgId,
        ...input,
        acceptedAt: null,
        createdAt: new Date(),
      };
      store.invites.push(row);
      return Promise.resolve(row);
    },
    listPendingInvites: (orgId, now) =>
      Promise.resolve(
        store.invites.filter((i) => i.orgId === orgId && !i.acceptedAt && i.expiresAt > now),
      ),
    deleteInvite: (orgId, id) => {
      const before = store.invites.length;
      store.invites = store.invites.filter((i) => !(i.orgId === orgId && i.id === id));
      return Promise.resolve(store.invites.length < before);
    },
    findInviteByTokenHash: (tokenHash) => {
      const invite = store.invites.find((i) => i.tokenHash === tokenHash);
      const org = invite ? store.orgs.find((o) => o.id === invite.orgId) : undefined;
      return Promise.resolve(invite && org ? { ...invite, orgName: org.name } : undefined);
    },
    acceptInvite: (orgId, inviteId, userId, role, now) => {
      const invite = store.invites.find((i) => i.id === inviteId);
      if (invite) invite.acceptedAt = now;
      const existing = store.members.find((m) => m.orgId === orgId && m.userId === userId);
      if (existing) existing.role = role;
      else store.addMember(orgId, userId, role);
      return Promise.resolve();
    },
  };
  return store;
}

export interface FakeMailer extends SystemMailer {
  sent: Array<{ to: string; subject: string; html: string; text: string }>;
}

export function fakeMailer(): FakeMailer {
  const mailer: FakeMailer = {
    sent: [],
    send: (input) => {
      mailer.sent.push(input);
      return Promise.resolve();
    },
  };
  return mailer;
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
    upsertMany: (orgId, emails, reason) => {
      let added = 0;
      for (const email of emails) {
        if (find(orgId, email)) continue;
        store.rows.push({ orgId, email, reason, createdAt: new Date() });
        added += 1;
      }
      return Promise.resolve(added);
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
      store.bodies.set(row.id, {
        messageId: row.id,
        orgId,
        sensitive: false,
        ...body,
        createdAt: new Date(),
      });
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

    purgeBody: (orgId, id) => {
      if (store.bodies.get(id)?.orgId === orgId) store.bodies.delete(id);
      return Promise.resolve();
    },

    markSent: (orgId, id, providerMessageId, sentAt) => {
      const row = find(orgId, id);
      if (row) Object.assign(row, { status: 'sent', providerMessageId, sentAt, error: null });
      return Promise.resolve();
    },

    markFailed: (orgId, id, error) => {
      const row = find(orgId, id);
      if (row) Object.assign(row, { status: 'failed', error });
      return Promise.resolve();
    },

    scheduleRetry: (orgId, id, error, now) => {
      const row = find(orgId, id);
      if (row) Object.assign(row, { status: 'queued', error, updatedAt: now });
      return Promise.resolve();
    },

    get: (orgId, id) => Promise.resolve(find(orgId, id)),

    list: (orgId, limit, cursor?: ListCursor, filters: EmailListFilters = {}) => {
      const after = (r: MessageRow) =>
        !cursor ||
        r.createdAt < cursor.createdAt ||
        (r.createdAt.getTime() === cursor.createdAt.getTime() && r.id < cursor.id);
      const q = filters.q?.toLowerCase();
      const matches = (r: MessageRow) =>
        (!filters.status || r.status === filters.status) &&
        (!filters.mailboxId || r.mailboxId === filters.mailboxId) &&
        (!filters.from || r.createdAt >= filters.from) &&
        (!filters.to || r.createdAt < filters.to) &&
        (!q || r.toEmail.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q));
      const rows = store.rows
        .filter((r) => r.orgId === orgId && after(r) && matches(r))
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

/** Overview aggregates computed from the in-memory email and mailbox rows. */
export function inMemoryOverviewStore(
  emails: InMemoryEmailStore,
  mailboxes: InMemoryMailboxStore,
): OverviewStore {
  return {
    countByStatus: (orgId, status, from, to) =>
      Promise.resolve(
        emails.rows.filter(
          (r) =>
            r.orgId === orgId && r.status === status && r.createdAt >= from && r.createdAt < to,
        ).length,
      ),
    dailyCounts: (orgId, from) => {
      const byDate = new Map<string, { date: string; sent: number; failed: number }>();
      for (const r of emails.rows) {
        if (r.orgId !== orgId || r.createdAt < from) continue;
        const date = r.createdAt.toISOString().slice(0, 10);
        const entry = byDate.get(date) ?? { date, sent: 0, failed: 0 };
        if (r.status === 'sent') entry.sent += 1;
        if (r.status === 'failed') entry.failed += 1;
        byDate.set(date, entry);
      }
      return Promise.resolve([...byDate.values()]);
    },
    mailboxUsage: (orgId) =>
      Promise.resolve(
        mailboxes.rows
          .filter((m) => m.orgId === orgId)
          .map((m) => ({
            id: m.id,
            email: m.email,
            status: m.status,
            sentToday: m.sentToday,
            dailyLimit: m.dailyLimit,
          })),
      ),
    recentFailures: (orgId, limit) =>
      Promise.resolve(
        emails.rows
          .filter((r) => r.orgId === orgId && r.status === 'failed')
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit),
      ),
  };
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
    updateSecret: (orgId, id, secretEnc) => {
      const row = findEndpoint(orgId, id);
      if (row) row.secret = secretEnc;
      return Promise.resolve(row !== undefined);
    },

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
    getDelivery: (orgId, id) => Promise.resolve(findDelivery(orgId, id)),
    requeueDelivery: (orgId, id) => {
      const row = findDelivery(orgId, id);
      if (row) Object.assign(row, { status: 'pending', nextRetryAt: null, updatedAt: new Date() });
      return Promise.resolve();
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
