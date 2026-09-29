import { type mailboxes } from '@postrail/db';
import { type OutboundMessage } from '@postrail/shared';

export type MailboxRow = typeof mailboxes.$inferSelect;

/** The slice of a mailbox row a provider needs. Tokens arrive encrypted and stay that way. */
export type ProviderMailbox = Pick<
  MailboxRow,
  'id' | 'orgId' | 'email' | 'provider' | 'refreshTokenEnc' | 'accessTokenEnc' | 'accessExpiresAt'
>;

export interface SendResult {
  providerMessageId: string;
}

/** One implementation per mail provider. Callers never see provider-specific errors. */
export interface EmailProvider {
  send: (mailbox: ProviderMailbox, message: OutboundMessage) => Promise<SendResult>;
}

/** How a provider persists what it learns about a mailbox mid-send. */
export interface TokenStore {
  saveAccessToken: (
    mailbox: ProviderMailbox,
    accessTokenEnc: string,
    expiresAt: Date,
  ) => Promise<void>;
  markDisconnected: (mailbox: ProviderMailbox) => Promise<void>;
}

/** The mailbox's grant is gone (revoked, password changed, expired). Needs a reconnect. */
export class MailboxDisconnectedError extends Error {
  constructor(readonly mailboxId: string) {
    super('mailbox is disconnected and must be reconnected');
    this.name = 'MailboxDisconnectedError';
  }
}
