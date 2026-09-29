import { type OutboundMessage, type WorkerOutcome } from '@postrail/shared';
import { type EventBus } from '../../lib/events';
import { type Logger } from '../../lib/logger';
import { classifySendError, looksLikeInvalidRecipient } from '../../providers/retry';
import { type EmailProvider, type MailboxRow } from '../../providers/types';
import { type Queue } from '../../queue/types';
import { type MailboxStore } from '../mailboxes/repo';
import { type SuppressionStore } from '../suppressions/repo';
import { normalize } from '../suppressions/service';
import { type EmailStore, type MessageBodyRow, type MessageRow } from './repo';
import { toEmail } from './service';

/** Total tries per message, including the first. */
export const MAX_SEND_ATTEMPTS = 5;

/** Delay before attempt n+1, indexed by n (attempts so far). Roughly 4x growth. */
export const RETRY_DELAYS_SECONDS = [30, 120, 480, 1800];

/**
 * A message stuck in `sending` longer than this is assumed to belong to a worker that
 * died mid-send and may be claimed again. Long enough that a slow Gmail call never
 * overlaps with a second sender.
 */
export const SENDING_LEASE_MS = 10 * 60_000;

const MAX_STORED_ERROR_CHARS = 500;

export interface EmailWorkerDeps {
  messages: EmailStore;
  mailboxes: MailboxStore;
  suppressions: SuppressionStore;
  events: EventBus;
  providerFor: (provider: MailboxRow['provider']) => EmailProvider;
  queue: Queue;
  logger: Logger;
  now?: () => Date;
}

export interface EmailWorker {
  /** Runs one delivery attempt. Safe to call any number of times for the same job. */
  processSendJob: (job: { orgId: string; messageId: string }) => Promise<WorkerOutcome>;
}

export function createEmailWorker(deps: EmailWorkerDeps): EmailWorker {
  const { messages, mailboxes, suppressions, events, providerFor, queue, logger } = deps;
  const now = deps.now ?? (() => new Date());

  async function fail(row: MessageRow, reason: string): Promise<WorkerOutcome> {
    const error = reason.slice(0, MAX_STORED_ERROR_CHARS);
    await messages.markFailed(row.orgId, row.id, error);
    logger.warn(
      { messageId: row.id, orgId: row.orgId, attempts: row.attempts, reason },
      'send failed',
    );
    await events.emit(row.orgId, 'email.failed', toEmail({ ...row, status: 'failed', error }));
    return 'failed';
  }

  async function retryLater(row: MessageRow, reason: string): Promise<WorkerOutcome> {
    if (row.attempts >= MAX_SEND_ATTEMPTS) {
      return fail(row, `${reason} (gave up after ${row.attempts} attempts)`);
    }
    const delaySeconds = RETRY_DELAYS_SECONDS[row.attempts - 1] ?? RETRY_DELAYS_SECONDS.at(-1) ?? 0;
    await messages.scheduleRetry(row.orgId, row.id, reason.slice(0, MAX_STORED_ERROR_CHARS), now());
    // A fresh task id per attempt: the original name is taken, and Cloud Tasks would drop it.
    await queue.enqueue(
      { kind: 'send-email', orgId: row.orgId, messageId: row.id },
      { taskId: `${row.id}-${row.attempts}`, delaySeconds },
    );
    logger.info(
      { messageId: row.id, orgId: row.orgId, attempts: row.attempts, delaySeconds, reason },
      'send retry scheduled',
    );
    return 'retry-scheduled';
  }

  return {
    async processSendJob({ orgId, messageId }) {
      // The claim is the idempotency guard: exactly one caller flips queued -> sending.
      const row = await messages.claimForSending(orgId, messageId, SENDING_LEASE_MS, now());
      if (!row) {
        logger.info({ messageId, orgId }, 'send skipped: not claimable');
        return 'skipped';
      }

      const body = await messages.getBody(orgId, messageId);
      if (!body) return fail(row, 'message body missing');
      if (!row.mailboxId) return fail(row, 'message has no mailbox');

      const mailbox = await mailboxes.get(orgId, row.mailboxId);
      if (!mailbox) return fail(row, 'mailbox no longer exists');
      if (mailbox.status !== 'active') return fail(row, `mailbox is ${mailbox.status}`);

      try {
        const result = await providerFor(mailbox.provider).send(mailbox, toOutbound(row, body));
        const sentAt = now();
        await messages.markSent(orgId, row.id, result.providerMessageId, sentAt);
        await mailboxes.incrementSentToday(orgId, mailbox.id);
        logger.info({ messageId: row.id, orgId, attempts: row.attempts }, 'send succeeded');
        await events.emit(
          orgId,
          'email.sent',
          toEmail({
            ...row,
            status: 'sent',
            providerMessageId: result.providerMessageId,
            sentAt,
            error: null,
          }),
        );
        return 'sent';
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'send failed';
        switch (classifySendError(error)) {
          case 'disconnected': {
            // The provider already flagged the mailbox; nothing will fix this message.
            const outcome = await fail(row, 'mailbox disconnected; reconnect it');
            await events.emit(orgId, 'mailbox.disconnected', {
              id: mailbox.id,
              email: mailbox.email,
              provider: mailbox.provider,
              status: 'disconnected',
            });
            return outcome;
          }
          case 'transient':
            return retryLater(row, reason);
          default:
            if (looksLikeInvalidRecipient(error)) {
              // A hard refusal of the address: stop future sends to it automatically.
              await suppressions.upsert(orgId, normalize(row.toEmail), 'hard_bounce');
            }
            return fail(row, reason);
        }
      }
    },
  };
}

function toOutbound(row: MessageRow, body: MessageBodyRow): OutboundMessage {
  return {
    to: row.toEmail,
    subject: row.subject,
    ...(body.html !== null ? { html: body.html } : {}),
    ...(body.text !== null ? { text: body.text } : {}),
    ...(body.replyTo !== null ? { replyTo: body.replyTo } : {}),
    ...(body.headers !== null ? { headers: body.headers } : {}),
  };
}
