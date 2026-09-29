import { createTokenCipher } from '@postrail/shared';
import { describe, expect, it, vi } from 'vitest';
import { type GoogleClient, GoogleOAuthError } from './google-client';
import { GoogleProvider } from './google';
import { MailboxDisconnectedError, type ProviderMailbox, type TokenStore } from './types';

const cipher = createTokenCipher('ab'.repeat(32));
const t0 = new Date('2026-09-29T12:00:00Z');
const MAILBOX_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';

function mailbox(overrides: Partial<ProviderMailbox> = {}): ProviderMailbox {
  return {
    id: MAILBOX_ID,
    orgId: ORG_ID,
    email: 'sender@example.com',
    provider: 'google',
    refreshTokenEnc: cipher.encrypt('refresh-1'),
    accessTokenEnc: null,
    accessExpiresAt: null,
    ...overrides,
  };
}

function fakeClient(overrides: Partial<GoogleClient> = {}) {
  const client = {
    authUrl: vi.fn(() => 'https://accounts.google.com/x'),
    exchangeCode: vi.fn(() =>
      Promise.resolve({ accessToken: 'access-x', refreshToken: 'refresh-x', expiresIn: 3600 }),
    ),
    refreshAccessToken: vi.fn(() =>
      Promise.resolve({ accessToken: 'access-new', expiresIn: 3600 }),
    ),
    getEmail: vi.fn(() => Promise.resolve('sender@example.com')),
    sendRaw: vi.fn((_accessToken: string, _raw: string) => Promise.resolve({ id: 'gmail-msg-1' })),
  };
  return Object.assign(client, overrides);
}

function fakeStore() {
  const saved: Array<{ id: string; enc: string; expiresAt: Date }> = [];
  const disconnected: string[] = [];
  const store: TokenStore = {
    saveAccessToken: (m, enc, expiresAt) => {
      saved.push({ id: m.id, enc, expiresAt });
      return Promise.resolve();
    },
    markDisconnected: (m) => {
      disconnected.push(m.id);
      return Promise.resolve();
    },
  };
  return { store, saved, disconnected };
}

const message = { to: 'someone@example.org', subject: 'Hi', text: 'hello' };

describe('GoogleProvider', () => {
  it('uses the cached access token while it is fresh', async () => {
    const client = fakeClient();
    const { store } = fakeStore();
    const provider = new GoogleProvider({ client, cipher, tokens: store, now: () => t0 });

    const result = await provider.send(
      mailbox({
        accessTokenEnc: cipher.encrypt('access-cached'),
        accessExpiresAt: new Date(t0.getTime() + 30 * 60_000),
      }),
      message,
    );

    expect(result).toEqual({ providerMessageId: 'gmail-msg-1' });
    expect(client.refreshAccessToken).not.toHaveBeenCalled();
    expect(client.sendRaw).toHaveBeenCalledWith('access-cached', expect.any(String));
  });

  it('refreshes when the cached token is missing or about to expire, and caches it', async () => {
    const client = fakeClient();
    const { store, saved } = fakeStore();
    const provider = new GoogleProvider({ client, cipher, tokens: store, now: () => t0 });

    await provider.send(
      mailbox({
        accessTokenEnc: cipher.encrypt('access-old'),
        accessExpiresAt: new Date(t0.getTime() + 30_000),
      }),
      message,
    );

    expect(client.refreshAccessToken).toHaveBeenCalledWith('refresh-1');
    expect(client.sendRaw).toHaveBeenCalledWith('access-new', expect.any(String));
    expect(saved).toHaveLength(1);
    expect(cipher.decrypt(saved[0]?.enc ?? '')).toBe('access-new');
    expect(saved[0]?.expiresAt).toEqual(new Date(t0.getTime() + 3600_000));
  });

  it('marks the mailbox disconnected on invalid_grant', async () => {
    const client = fakeClient({
      refreshAccessToken: () =>
        Promise.reject(new GoogleOAuthError('invalid_grant', 'Token has been revoked')),
    });
    const { store, disconnected } = fakeStore();
    const provider = new GoogleProvider({ client, cipher, tokens: store, now: () => t0 });

    await expect(provider.send(mailbox(), message)).rejects.toBeInstanceOf(
      MailboxDisconnectedError,
    );
    expect(disconnected).toEqual([MAILBOX_ID]);
    expect(client.sendRaw).not.toHaveBeenCalled();
  });

  it('propagates other refresh failures without touching the mailbox', async () => {
    const client = fakeClient({
      refreshAccessToken: () => Promise.reject(new GoogleOAuthError('temporarily_unavailable')),
    });
    const { store, disconnected } = fakeStore();
    const provider = new GoogleProvider({ client, cipher, tokens: store, now: () => t0 });

    await expect(provider.send(mailbox(), message)).rejects.toThrow(/temporarily_unavailable/);
    expect(disconnected).toEqual([]);
  });

  it('sends a well-formed raw message from the mailbox address', async () => {
    const client = fakeClient();
    const provider = new GoogleProvider({
      client,
      cipher,
      tokens: fakeStore().store,
      now: () => t0,
    });

    await provider.send(mailbox(), { ...message, subject: 'Héllo', html: '<b>hi</b>' });

    const raw = client.sendRaw.mock.calls[0]?.[1] ?? '';
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toContain('From: sender@example.com\r\n');
    expect(mime).toContain('To: someone@example.org\r\n');
    expect(mime).toContain('Subject: =?UTF-8?B?SMOpbGxv?=\r\n');
    expect(mime).toContain('Content-Type: multipart/alternative');
    expect(mime).toContain('text/plain');
    expect(mime).toContain('text/html');
  });
});
