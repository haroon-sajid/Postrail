import { createRouter } from '../../lib/router';
import { type BroadcastWorker } from '../broadcasts/worker';
import { type EmailWorker } from '../emails/worker';
import { type WebhookWorker } from '../webhooks/worker';
import { deliverWebhookJobSchema, dispatchBroadcastJobSchema, sendEmailJobSchema } from './schemas';

export interface InternalRouteDeps {
  worker: EmailWorker;
  webhookWorker: WebhookWorker;
  broadcastWorker: BroadcastWorker;
}

/**
 * Endpoints for our own infrastructure (Cloud Tasks). Guarded by `requireInternalAuth` in
 * app.ts and deliberately absent from the OpenAPI document. Always 200 once a job was
 * understood: the workers own retries. A non-2xx here would make Cloud Tasks redeliver on
 * top of our own schedule. The cron endpoints live in modules/scheduler.
 */
export function internalRoutes(deps: InternalRouteDeps) {
  const { worker, webhookWorker, broadcastWorker } = deps;
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

  return router;
}
