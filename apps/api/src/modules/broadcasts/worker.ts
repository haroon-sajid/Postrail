import { randomUUID } from 'node:crypto';
import {
  BROADCAST_BATCH_SIZE,
  extractVariables,
  renderTemplate,
  TemplateRenderError,
} from '@postrail/shared';
import { type AuthContext } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type Logger } from '../../lib/logger';
import { type UnsubscribeLinks } from '../../lib/unsubscribe';
import { type Queue } from '../../queue/types';
import { type EmailService } from '../emails/service';
import { type BroadcastStore, type MailboxRoom, type RecipientRow } from './repo';
import { type BroadcastOutcome } from './schemas';

/**
 * A recipient claimed longer ago than this belongs to a round that died and may be taken
 * again. Queuing a batch takes seconds, so ten minutes never overlaps a live round.
 */
export const DISPATCH_LEASE_MS = 10 * 60_000;

/**
 * Every round is its own task. A random name, because Cloud Tasks refuses a name it has
 * seen before and rounds have nothing stable to be named after; the claim on recipients
 * is what makes a duplicate round harmless.
 */
export const dispatchTaskId = (broadcastId: string) => `broadcast-${broadcastId}-${randomUUID()}`;

/** Added when the template has no `{{unsubscribe_url}}` of its own. */
const UNSUBSCRIBE_FOOTER =
  '<p style="font-size:12px;color:#6b7280;margin-top:32px">You are receiving this because you are on our list. <a href="{{unsubscribe_url}}">Unsubscribe</a></p>';

export interface BroadcastWorkerDeps {
  store: BroadcastStore;
  /** Recipients become ordinary messages: queued here, delivered by the email worker. */
  emails: Pick<EmailService, 'send'>;
  links: UnsubscribeLinks;
  queue: Queue;
  logger: Logger;
  now?: () => Date;
}

export interface BroadcastWorker {
  /** Runs one round. Safe to call any number of times for the same job. */
  processDispatch: (job: { orgId: string; broadcastId: string }) => Promise<BroadcastOutcome>;
}

/**
 * Paces a broadcast: each round hands at most a batch of recipients to delivery, never
 * more than the mailboxes have room for today, and queues the next round while room
 * remains. When it runs out the broadcast simply waits; the daily reset starts it again.
 */
export function createBroadcastWorker(deps: BroadcastWorkerDeps): BroadcastWorker {
  const { store, emails, links, queue, logger } = deps;
  const now = deps.now ?? (() => new Date());

  /** The mailbox with the most room left, so a broadcast spreads instead of filling one. */
  const roomiest = (room: MailboxRoom[]) =>
    room.reduce<MailboxRoom | undefined>(
      (best, box) => (box.remaining > (best?.remaining ?? 0) ? box : best),
      undefined,
    );

  function render(orgId: string, content: { subject: string; html: string }, to: RecipientRow) {
    const unsubscribeUrl = links.urlFor(orgId, to.email);
    const html = extractVariables(content.html).includes('unsubscribe_url')
      ? content.html
      : content.html + UNSUBSCRIBE_FOOTER;
    return {
      ...renderTemplate(
        { subject: content.subject, html },
        { ...to.properties, email: to.email, unsubscribe_url: unsubscribeUrl },
      ),
      // What mail clients use for their own "Unsubscribe" button (RFC 8058).
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    };
  }

  return {
    async processDispatch({ orgId, broadcastId }) {
      const broadcast = await store.get(orgId, broadcastId);
      if (
        broadcast?.status !== 'sending' ||
        broadcast.subject === null ||
        broadcast.html === null
      ) {
        logger.info({ broadcastId, orgId }, 'broadcast dispatch skipped: not sending');
        return 'skipped';
      }
      const content = { subject: broadcast.subject, html: broadcast.html };
      const auth: AuthContext = { orgId, actor: 'system' };

      const room = await store.mailboxRoom(orgId);
      const capacity = room.reduce((sum, box) => sum + box.remaining, 0);
      // Claim first: a second delivery of this job takes different recipients or none.
      const claimed = await store.claimRecipients(
        orgId,
        broadcastId,
        Math.min(BROADCAST_BATCH_SIZE, capacity),
        DISPATCH_LEASE_MS,
        now(),
      );

      const released: string[] = [];
      try {
        for (const [index, recipient] of claimed.entries()) {
          const mailbox = roomiest(room);
          if (!mailbox) {
            released.push(recipient.id);
            continue;
          }
          try {
            const message = render(orgId, content, recipient);
            // The key makes a recipient claimed twice (a stale lease) one message, not two.
            const outcome = await emails.send(
              auth,
              { to: recipient.email, from: mailbox.email, ...message },
              `broadcast:${recipient.id}`,
            );
            await store.settleRecipient(orgId, recipient.id, {
              state: 'queued',
              messageId: outcome.id,
            });
            mailbox.remaining -= 1;
          } catch (error) {
            if (error instanceof TemplateRenderError) {
              // The contact lacks a property the template needs. Retrying cannot fix that.
              await store.settleRecipient(orgId, recipient.id, {
                state: 'failed',
                error: error.message,
              });
            } else if (error instanceof AppError && error.code === 'SUPPRESSED') {
              await store.settleRecipient(orgId, recipient.id, {
                state: 'skipped',
                error: 'suppressed',
              });
            } else if (error instanceof AppError && error.code === 'NO_MAILBOX') {
              // The mailbox filled up or was paused since we looked. Try the others.
              mailbox.remaining = 0;
              released.push(recipient.id);
            } else {
              released.push(...claimed.slice(index).map((r) => r.id));
              throw error;
            }
          }
        }
      } finally {
        await store.releaseRecipients(orgId, released);
      }

      if ((await store.countWaiting(orgId, broadcastId)) === 0) {
        await store.complete(orgId, broadcastId, now());
        logger.info({ broadcastId, orgId }, 'broadcast completed');
        return 'completed';
      }
      if (!roomiest(room)) {
        logger.info({ broadcastId, orgId }, 'broadcast waiting for mailbox capacity');
        return 'waiting';
      }
      await queue.enqueue(
        { kind: 'dispatch-broadcast', orgId, broadcastId },
        {
          taskId: dispatchTaskId(broadcastId),
          // Nothing to take means another round still holds the rest. Look again once
          // its claim has lapsed, instead of spinning until then.
          ...(claimed.length === 0 ? { delaySeconds: DISPATCH_LEASE_MS / 1000 } : {}),
        },
      );
      return 'dispatched';
    },
  };
}
