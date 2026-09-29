import { type Job } from '@postrail/shared';

export type { Job };

export interface EnqueueOptions {
  /**
   * Stable name for the task. Enqueuing the same name twice is a no-op, which is how a
   * request retried by the client cannot create two deliveries. Retries of the same
   * job use `<id>-<attempt>` so they get their own slot.
   */
  taskId: string;
  delaySeconds?: number;
}

/** Hands a job to whatever will eventually call a worker. Both drivers implement this. */
export interface Queue {
  enqueue: (job: Job, options: EnqueueOptions) => Promise<void>;
}

export type JobHandler = (job: Job) => Promise<unknown>;

/** Internal route each job kind is delivered to. Cloud Tasks targets these URLs. */
export const JOB_PATHS: Record<Job['kind'], string> = {
  'send-email': '/internal/tasks/send-email',
  'deliver-webhook': '/internal/tasks/deliver-webhook',
};

export class QueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueError';
  }
}
