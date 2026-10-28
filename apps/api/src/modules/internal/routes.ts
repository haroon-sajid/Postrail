import { createRouter } from '../../lib/router';
import { type BroadcastService } from '../broadcasts/service';
import { type BroadcastWorker } from '../broadcasts/worker';
import { type EmailWorker } from '../emails/worker';
import { type MailboxService } from '../mailboxes/service';
import { type WebhookWorker } from '../webhooks/worker';
import { deliverWebhookJobSchema, dispatchBroadcastJobSchema, sendEmailJobSchema } from './schemas';

export interface InternalRouteDeps {
  worker: EmailWorker;
  webhookWorker: WebhookWorker;
  broadcastWorker: BroadcastWorker;
  mailboxes: MailboxService;
  broadcasts: BroadcastService;
}

/**
 * Endpoints for our own infrastructure (Cloud Tasks, Cloud Scheduler). Guarded by
 * `requireInternalAuth` in app.ts and deliberately absent from the OpenAPI document.
 * Always 200 once a job was understood: the workers own retries. A non-2xx here would
 * make Cloud Tasks redeliver on top of our own schedule.
 */
export function internalRoutes(deps: InternalRouteDeps) {
  const { worker, webhookWorker, broadcastWorker, mailboxes, broadcasts } = deps;
  const router = createRouter();

  router.post('/internal/tasks/send-email', async (c) => {
    const raw: unknown = await c.req.json();
    const outcome = await worker.processSendJob(sendEmailJobSchema.parse(raw));
    return c.json({ outcome }, 200);
  });

  router.post('/internal/tasks/deliver-webhook', async (c) => {
    const raw: unknown = await c.req.json();
    const outcome = await webhookWorker.processDelivery(deliverWebhookJobSchema.parse(raw));
    return c.json({ outcome }, 200);
  });

  router.post('/internal/tasks/dispatch-broadcast', async (c) => {
    const raw: unknown = await c.req.json();
    const outcome = await broadcastWorker.processDispatch(dispatchBroadcastJobSchema.parse(raw));
    return c.json({ outcome }, 200);
  });

  router.post('/internal/cron/reset-daily-counters', async (c) => {
    const reset = await mailboxes.resetDailyCounters();
    // The reset is what gives a paced broadcast its next day of capacity.
    const resumed = await broadcasts.resumeAll();
    return c.json({ reset, resumed }, 200);
  });

  return router;
}
