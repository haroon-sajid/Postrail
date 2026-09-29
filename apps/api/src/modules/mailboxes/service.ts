import {
  type MailboxProvider,
  type TokenCipher,
  type UpdateMailboxRequest,
  oauthStateSchema,
  signState,
  verifyState,
} from '@postrail/shared';
import { type AuthContext, requireRole } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type GoogleClient } from '../../providers/google-client';
import { GoogleProvider } from '../../providers/google';
import { type EmailProvider, type TokenStore } from '../../providers/types';
import { type AuditStore } from '../audit/repo';
import { type GoogleCallbackQuery, type Mailbox } from './schemas';
import { type MailboxStore, type MailboxSummary } from './repo';

export interface MailboxServiceDeps {
  store: MailboxStore;
  google: GoogleClient;
  cipher: TokenCipher;
  /** HMAC secret for the OAuth state. Any long random string; the token key works. */
  stateSecret: string;
  audit?: AuditStore;
  now?: () => Date;
}

export interface ConnectResult {
  orgId: string;
  mailbox: Mailbox;
}

export interface MailboxService {
  /** Where to send the browser to connect a Google mailbox. Caller must be an org admin. */
  googleConnectUrl: (auth: AuthContext) => string;
  /** Finishes the OAuth dance: verifies state, swaps the code, stores encrypted tokens. */
  completeGoogleConnect: (query: GoogleCallbackQuery) => Promise<ConnectResult>;
  list: (orgId: string) => Promise<Mailbox[]>;
  update: (auth: AuthContext, id: string, patch: UpdateMailboxRequest) => Promise<Mailbox>;
  remove: (auth: AuthContext, id: string) => Promise<void>;
  providerFor: (provider: MailboxProvider) => EmailProvider;
  /** Daily cron: zero every mailbox's sent_today. Returns the number touched. */
  resetDailyCounters: () => Promise<number>;
}

export function createMailboxService(deps: MailboxServiceDeps): MailboxService {
  const { store, google, cipher, stateSecret, audit } = deps;
  const now = deps.now ?? (() => new Date());

  // Providers persist refreshed tokens through the store, always inside the mailbox's org.
  const tokens: TokenStore = {
    saveAccessToken: (m, enc, expiresAt) => store.saveAccessToken(m.orgId, m.id, enc, expiresAt),
    markDisconnected: (m) => store.setStatus(m.orgId, m.id, 'disconnected'),
  };
  const googleProvider = new GoogleProvider({ client: google, cipher, tokens, now });

  return {
    googleConnectUrl(auth) {
      // Only an admin of the org may attach a mailbox to it; the signed state carries the org.
      requireRole(auth, 'admin');
      return google.authUrl({ state: signState({ orgId: auth.orgId }, stateSecret, { now }) });
    },

    async completeGoogleConnect(query) {
      const state = verifyState(query.state, stateSecret, oauthStateSchema, { now });
      if (!state.ok) throw AppError.validation(`invalid oauth state (${state.reason})`);
      if (query.error) throw AppError.validation(`google refused the request: ${query.error}`);
      if (!query.code) throw AppError.validation('missing authorization code');

      const granted = await google.exchangeCode(query.code);
      if (!granted.refreshToken) {
        // Happens when the user skipped the consent screen because the app was already
        // authorised. Removing the app from their Google account resets that.
        throw AppError.validation(
          'google did not return a refresh token; remove Postrail from your Google account and try again',
        );
      }
      const email = await google.getEmail(granted.accessToken);
      const { orgId } = state.payload;

      const summary = await store.upsertConnected(
        orgId,
        {
          email,
          provider: 'google',
          refreshTokenEnc: cipher.encrypt(granted.refreshToken),
          accessTokenEnc: cipher.encrypt(granted.accessToken),
          accessExpiresAt: new Date(now().getTime() + granted.expiresIn * 1000),
        },
        { actor: 'google-oauth', action: 'mailbox.connected', meta: { email, provider: 'google' } },
      );
      return { orgId, mailbox: toMailbox(summary) };
    },

    async list(orgId) {
      return (await store.list(orgId)).map(toMailbox);
    },

    async update(auth, id, patch) {
      const row = await store.update(auth.orgId, id, {
        ...(patch.daily_limit !== undefined ? { dailyLimit: patch.daily_limit } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      });
      if (!row) throw AppError.notFound('mailbox');
      await audit?.record(auth.orgId, {
        actor: auth.actor,
        action: 'mailbox.updated',
        target: id,
        meta: { ...patch },
      });
      return toMailbox(row);
    },

    async remove(auth, id) {
      requireRole(auth, 'admin');
      const removed = await store.remove(auth.orgId, id, {
        actor: auth.actor,
        action: 'mailbox.removed',
      });
      if (!removed) throw AppError.notFound('mailbox');
    },

    providerFor(provider) {
      if (provider === 'google') return googleProvider;
      throw new Error(`provider ${provider} is not implemented yet`);
    },

    resetDailyCounters: () => store.resetDailyCounters(),
  };
}

/** Internal camelCase summary to the snake_case wire shape. */
function toMailbox(summary: MailboxSummary): Mailbox {
  return {
    id: summary.id,
    email: summary.email,
    provider: summary.provider,
    status: summary.status,
    daily_limit: summary.dailyLimit,
    sent_today: summary.sentToday,
    created_at: summary.createdAt.toISOString(),
  };
}
