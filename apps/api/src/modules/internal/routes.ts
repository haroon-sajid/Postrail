import { createRouter } from '../../lib/router';
import { type EmailWorker } from '../emails/worker';
import { type MailboxService } from '../mailboxes/service';
import { type WebhookWorker } from '../webhooks/worker';
import { deliverWebhookJobSchema, sendEmailJobSchema } from './schemas';

export interface InternalRouteDeps {
  worker: EmailWorker;
  webhookWorker: WebhookWorker;
  mailboxes: MailboxService;
}

/**
 * Endpoints for our own infrastructure (Cloud Tasks, Cloud Scheduler). Guarded by
 * `requireInternalAuth` in app.ts and deliberately absent from the OpenAPI document.
 * Always 200 once a job was understood: the workers own retries. A non-2xx here would
 * make Cloud Tasks redeliver on top of our own schedule.
 */
export function internalRoutes({ worker, webhookWorker, mailboxes }: InternalRouteDeps) {
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

  router.post('/internal/cron/reset-daily-counters', async (c) => {
    const reset = await mailboxes.resetDailyCounters();
    return c.json({ reset }, 200);
  });

  return router;
}
