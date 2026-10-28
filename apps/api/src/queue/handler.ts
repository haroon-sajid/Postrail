import { type BroadcastWorker } from '../modules/broadcasts/worker';
import { type EmailWorker } from '../modules/emails/worker';
import { type WebhookWorker } from '../modules/webhooks/worker';
import { type JobHandler } from './types';

export interface Workers {
  worker: EmailWorker;
  webhookWorker: WebhookWorker;
  broadcastWorker: BroadcastWorker;
}

/** Routes a job to its worker when the queue runs in-process (local mode and tests). */
export function createJobHandler(workers: Workers): JobHandler {
  return (job) => {
    switch (job.kind) {
      case 'send-email':
        return workers.worker.processSendJob(job);
      case 'deliver-webhook':
        return workers.webhookWorker.processDelivery(job);
      case 'dispatch-broadcast':
        return workers.broadcastWorker.processDispatch(job);
    }
  };
}
