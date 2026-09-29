import { type OutboundMessage, type TokenCipher } from '@postrail/shared';
import { type GoogleClient, GoogleOAuthError } from './google-client';
import { buildRawMessage } from './mime';
import {
  type EmailProvider,
  MailboxDisconnectedError,
  type ProviderMailbox,
  type SendResult,
  type TokenStore,
} from './types';

/** Refresh this long before expiry so a token never dies mid-request. */
const EXPIRY_MARGIN_MS = 60_000;

export interface GoogleProviderDeps {
  client: GoogleClient;
  cipher: TokenCipher;
  tokens: TokenStore;
  now?: () => Date;
}

export class GoogleProvider implements EmailProvider {
  private readonly now: () => Date;

  constructor(private readonly deps: GoogleProviderDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async send(mailbox: ProviderMailbox, message: OutboundMessage): Promise<SendResult> {
    const accessToken = await this.accessTokenFor(mailbox);
    const raw = buildRawMessage({ ...message, from: mailbox.email });
    const { id } = await this.deps.client.sendRaw(accessToken, raw);
    return { providerMessageId: id };
  }

  /** Uses the cached access token while it is fresh, otherwise refreshes and caches. */
  private async accessTokenFor(mailbox: ProviderMailbox): Promise<string> {
    const { cipher, client, tokens } = this.deps;
    const nowMs = this.now().getTime();

    if (
      mailbox.accessTokenEnc &&
      mailbox.accessExpiresAt &&
      mailbox.accessExpiresAt.getTime() - nowMs > EXPIRY_MARGIN_MS
    ) {
      return cipher.decrypt(mailbox.accessTokenEnc);
    }

    try {
      const refreshed = await client.refreshAccessToken(cipher.decrypt(mailbox.refreshTokenEnc));
      const expiresAt = new Date(nowMs + refreshed.expiresIn * 1000);
      await tokens.saveAccessToken(mailbox, cipher.encrypt(refreshed.accessToken), expiresAt);
      return refreshed.accessToken;
    } catch (error) {
      // invalid_grant means the refresh token is dead: revoked, password change, 6-month
      // inactivity. Nothing we retry will fix it, so flag the mailbox for a reconnect.
      if (error instanceof GoogleOAuthError && error.code === 'invalid_grant') {
        await tokens.markDisconnected(mailbox);
        throw new MailboxDisconnectedError(mailbox.id);
      }
      throw error;
    }
  }
}
