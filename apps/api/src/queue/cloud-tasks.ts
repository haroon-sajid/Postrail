import { GoogleAuth } from 'google-auth-library';
import { type EnqueueOptions, type Job, JOB_PATHS, type Queue, QueueError } from './types';

export interface CloudTasksConfig {
  projectId: string;
  region: string;
  queueName: string;
  /** Where Cloud Tasks POSTs the job; also the OIDC audience the worker checks. */
  workerUrl: string;
  /** Service account the task's OIDC token is minted for. Needs run.invoker on the API. */
  serviceAccountEmail: string;
}

export interface CloudTasksDeps {
  /** Access token for the Cloud Tasks API (cloud-platform scope). */
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const API_BASE = 'https://cloudtasks.googleapis.com/v2';

/**
 * Google Cloud Tasks over its REST API: four fields of JSON per task, no gRPC client to
 * bundle. Task names carry the message id so a duplicate enqueue is rejected by Google
 * (409) instead of producing a second delivery.
 */
export class CloudTasksQueue implements Queue {
  private readonly parent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(
    private readonly config: CloudTasksConfig,
    private readonly deps: CloudTasksDeps,
  ) {
    const { projectId, region, queueName } = config;
    this.parent = `projects/${projectId}/locations/${region}/queues/${queueName}`;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.now = deps.now ?? (() => new Date());
  }

  enqueue = async (job: Job, { taskId, delaySeconds = 0 }: EnqueueOptions): Promise<void> => {
    const scheduleTime =
      delaySeconds > 0
        ? { scheduleTime: new Date(this.now().getTime() + delaySeconds * 1000).toISOString() }
        : {};
    // WORKER_URL names the send-email endpoint; other kinds live next to it on the same host.
    const url = new URL(JOB_PATHS[job.kind], this.config.workerUrl).toString();
    const task = {
      name: `${this.parent}/tasks/${sanitizeTaskId(taskId)}`,
      ...scheduleTime,
      httpRequest: {
        httpMethod: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(job), 'utf8').toString('base64'),
        oidcToken: {
          serviceAccountEmail: this.config.serviceAccountEmail,
          audience: url,
        },
      },
    };

    const res = await this.fetchImpl(`${API_BASE}/${this.parent}/tasks`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await this.deps.getAccessToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ task }),
    });

    // ALREADY_EXISTS: same task name, so the job is already on its way. That is the point.
    if (res.status === 409) return;
    if (!res.ok) throw new QueueError(`cloud tasks createTask responded ${res.status}`);
  };
}

/** Task ids allow letters, digits, hyphens and underscores, up to 500 chars. */
function sanitizeTaskId(taskId: string): string {
  return taskId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 500);
}

/** Application Default Credentials: the Cloud Run service account in production. */
export function googleAccessTokenProvider(): () => Promise<string> {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  return async () => {
    const token = await auth.getAccessToken();
    if (!token) throw new QueueError('could not obtain a Google access token');
    return token;
  };
}
