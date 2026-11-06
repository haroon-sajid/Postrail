import {
  RETENTION_BATCH_SIZE,
  RETENTION_DAYS,
  SWEEP_BATCH_SIZE,
  SWEEP_GRACE_MINUTES,
} from '@postrail/shared';
import { type Logger } from '../../lib/logger';
import { type Queue } from '../../queue/types';
import { type AuthStore } from '../auth/repo';
import { type BroadcastService } from '../broadcasts/service';
import { type BroadcastStore } from '../broadcasts/repo';
import { DISPATCH_LEASE_MS, dispatchTaskId } from '../broadcasts/worker';
import { type EmailStore } from '../emails/repo';
import { SENDING_LEASE_MS } from '../emails/worker';
import { type MailboxService } from '../mailboxes/service';
import { type RateLimitStore } from '../rate-limits/repo';
import { type WebhookStore } from '../webhooks/repo';
import { WEBHOOK_LEASE_MS } from '../webhooks/worker';
import { type SchedulerStore } from './repo';
import { type ResetCountersResponse, type TickResponse } from './schemas';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** A daily run that has not finished after this long is assumed dead and may be retried. */
export const DAILY_CLAIM_LEASE_MS = 10 * MINUTE_MS;
export const DAILY_RESET_JOB = 'daily-reset';

export interface SchedulerServiceDeps {
  store: SchedulerStore;
  mailboxes: Pick<MailboxService, 'resetDailyCounters'>;
  broadcasts: Pick<BroadcastService, 'resumeAll'>;
  emailStore: Pick<EmailStore, 'findStalled' | 'purgeBodiesBefore'>;
  webhookStore: Pick<WebhookStore, 'findStalledDeliveries' | 'deleteDeliveriesBefore'>;
  broadcastStore: Pick<BroadcastStore, 'listStalled'>;
  authStore: Pick<AuthStore, 'deleteExpired'>;
  rateLimitStore: Pick<RateLimitStore, 'deleteIdle'>;
  queue: Queue;
  logger: Logger;
  now?: () => Date;
}

export interface SchedulerService {
  /**
   * Runs whatever is due (ADR 0014). Safe to call as often and from as many places as
   * you like: the daily part is claimed per UTC day, the sweep only re-queues work whose
   * task is evidently lost, and retention only deletes what is past its date.
   */
  tick: () => Promise<TickResponse>;
  /** The daily part on its own, still at most once per UTC day. */
  resetDaily: () => Promise<ResetCountersResponse>;
}

type Part = TickResponse['failed'][number];

export function createSchedulerService(deps: SchedulerServiceDeps): SchedulerService {
  const { store, mailboxes, broadcasts, queue, logger } = deps;
  const now = deps.now ?? (() => new Date());

  /** Zeroes every mailbox's daily count and restarts paced broadcasts, once per UTC day. */
  async function daily(at: Date): Promise<{ reset: number; resumed: number } | null> {
    const period = at.toISOString().slice(0, 10);
    if (!(await store.claim(DAILY_RESET_JOB, period, at, DAILY_CLAIM_LEASE_MS))) return null;
    let reset: number;
    try {
      reset = await mailboxes.resetDailyCounters();
      await store.complete(DAILY_RESET_JOB, period, at);
    } catch (error) {
      await store.release(DAILY_RESET_JOB, period);
      throw error;
    }
    // After the claim is complete on purpose: a second reset in one day would hand the
    // mailboxes capacity they already used. Resuming only queues work, and the sweep
    // catches any broadcast this misses.
    const resumed = await broadcasts.resumeAll();
    logger.info({ period, reset, resumed }, 'daily reset done');
    return { reset, resumed };
  }

  /** Puts work back on the queue whose task was lost: a restart, a dropped task. */
  async function sweep(at: Date): Promise<TickResponse['requeued']> {
    const graceMs = SWEEP_GRACE_MINUTES * MINUTE_MS;
    // Fresh task names: the originals may be remembered by Cloud Tasks and refused.
    const suffix = `sweep-${at.getTime()}`;

    const emails = await deps.emailStore.findStalled(
      at,
      graceMs,
      SENDING_LEASE_MS,
      SWEEP_BATCH_SIZE,
    );
    for (const { orgId, id } of emails) {
      await queue.enqueue(
        { kind: 'send-email', orgId, messageId: id },
        { taskId: `${id}-${suffix}` },
      );
    }
    const deliveries = await deps.webhookStore.findStalledDeliveries(
      at,
      graceMs,
      WEBHOOK_LEASE_MS,
      SWEEP_BATCH_SIZE,
    );
    for (const { orgId, id } of deliveries) {
      await queue.enqueue(
        { kind: 'deliver-webhook', orgId, deliveryId: id },
        { taskId: `${id}-${suffix}` },
      );
    }
    // A broadcast waiting for tomorrow's capacity is listed too; its round just reports
    // `waiting` again, which costs a few queries and keeps the rule simple.
    const stalled = await deps.broadcastStore.listStalled(at, DISPATCH_LEASE_MS);
    for (const { orgId, id } of stalled) {
      await queue.enqueue(
        { kind: 'dispatch-broadcast', orgId, broadcastId: id },
        { taskId: dispatchTaskId(id) },
      );
    }
    const requeued = {
      emails: emails.length,
      webhooks: deliveries.length,
      broadcasts: stalled.length,
    };
    if (emails.length + deliveries.length > 0) logger.warn(requeued, 'sweep re-queued lost work');
    return requeued;
  }

  /** Deletes what has done its job. Bounded per tick; a backlog drains over several. */
  async function retention(at: Date): Promise<TickResponse['deleted']> {
    const daysAgo = (days: number) => new Date(at.getTime() - days * DAY_MS);
    const auth = await deps.authStore.deleteExpired(
      daysAgo(RETENTION_DAYS.authChallenges),
      daysAgo(RETENTION_DAYS.authSessions),
      RETENTION_BATCH_SIZE,
    );
    return {
      message_bodies: await deps.emailStore.purgeBodiesBefore(
        daysAgo(RETENTION_DAYS.messageBodies),
        RETENTION_BATCH_SIZE,
      ),
      webhook_deliveries: await deps.webhookStore.deleteDeliveriesBefore(
        daysAgo(RETENTION_DAYS.webhookDeliveries),
        RETENTION_BATCH_SIZE,
      ),
      auth_sessions: auth.sessions,
      auth_challenges: auth.challenges,
      rate_limits: await deps.rateLimitStore.deleteIdle(
        daysAgo(RETENTION_DAYS.rateLimits),
        RETENTION_BATCH_SIZE,
      ),
    };
  }

  /** Runs one part, logging and recording a failure instead of abandoning the tick. */
  async function attempt<T>(part: Part, failed: Part[], fn: () => Promise<T>, fallback: T) {
    try {
      return await fn();
    } catch (error) {
      logger.error({ err: error, part }, 'scheduler part failed');
      failed.push(part);
      return fallback;
    }
  }

  return {
    async tick() {
      const at = now();
      const failed: Part[] = [];
      const result = {
        daily: await attempt('daily', failed, () => daily(at), null),
        requeued: await attempt('sweep', failed, () => sweep(at), {
          emails: 0,
          webhooks: 0,
          broadcasts: 0,
        }),
        deleted: await attempt('retention', failed, () => retention(at), {
          message_bodies: 0,
          webhook_deliveries: 0,
          auth_sessions: 0,
          auth_challenges: 0,
          rate_limits: 0,
        }),
      };
      return { ...result, failed };
    },

    async resetDaily() {
      const done = await daily(now());
      return done ? { ...done, skipped: false } : { reset: 0, resumed: 0, skipped: true };
    },
  };
}
