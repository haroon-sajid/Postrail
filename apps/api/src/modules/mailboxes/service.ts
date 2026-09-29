import {
  type MailboxProvider,
  type TokenCipher,
  oauthStateSchema,
  signState,
  verifyState,
} from '@postrail/shared';
import { type AuthContext } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type GoogleClient } from '../../providers/google-client';
import { GoogleProvider } from '../../providers/google';
import { type EmailProvider, type TokenStore } from '../../providers/types';
import { type GoogleCallbackQuery, type Mailbox } from './schemas';
import { type MailboxStore, type MailboxSummary } from './repo';

export interface MailboxServiceDeps {
  store: MailboxStore;
  google: GoogleClient;
  cipher: TokenCipher;
  /** HMAC secret for the OAuth state. Any long random string; the token key works. */
  stateSecret: string;
  now?: () => Date;
}

export interface ConnectResult {
  orgId: string;
  mailbox: Mailbox;
}

export interface MailboxService {
  /** Where to send the browser to start connecting a Google mailbox to `orgId`. */
  googleConnectUrl: (orgId: string) => string;
  /** Finishes the OAuth dance: verifies state, swaps the code, stores encrypted tokens. */
  completeGoogleConnect: (query: GoogleCallbackQuery) => Promise<ConnectResult>;
  list: (orgId: string) => Promise<Mailbox[]>;
  remove: (auth: AuthContext, id: string) => Promise<void>;
  providerFor: (provider: MailboxProvider) => EmailProvider;
  /** Daily cron: zero every mailbox's sent_today. Returns the number touched. */
  resetDailyCounters: () => Promise<number>;
}

export function createMailboxService(deps: MailboxServiceDeps): MailboxService {
  const { store, google, cipher, stateSecret } = deps;
  const now = deps.now ?? (() => new Date());

  // Providers persist refreshed tokens through the store, always inside the mailbox's org.
  const tokens: TokenStore = {
    saveAccessToken: (m, enc, expiresAt) => store.saveAccessToken(m.orgId, m.id, enc, expiresAt),
    markDisconnected: (m) => store.setStatus(m.orgId, m.id, 'disconnected'),
  };
  const googleProvider = new GoogleProvider({ client: google, cipher, tokens, now });

  return {
    googleConnectUrl(orgId) {
      // TODO(auth): the caller must be a member of orgId. Until sessions exist, anyone
      // holding an org id can start this flow. See ADR 0003.
      return google.authUrl({ state: signState({ orgId }, stateSecret, { now }) });
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

    async remove(auth, id) {
      const removed = await store.remove(auth.orgId, id, {
        actor: `api-key:${auth.apiKeyId}`,
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
