import { describe, expect, it, vi } from 'vitest';
import { CloudTasksQueue } from './cloud-tasks';
import { type Job, QueueError } from './types';

const config = {
  projectId: 'proj',
  region: 'us-central1',
  queueName: 'send-email',
  workerUrl: 'https://api.example.com/internal/tasks/send-email',
  serviceAccountEmail: 'tasks@proj.iam.gserviceaccount.com',
};
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const job: Job = { kind: 'send-email', orgId: ORG, messageId: MESSAGE };
const t0 = new Date('2026-09-29T12:00:00Z');

interface TaskBody {
  task: {
    name: string;
    scheduleTime?: string;
    httpRequest: {
      url: string;
      body: string;
      oidcToken: { audience: string; serviceAccountEmail: string };
    };
  };
}

function queueWith(status: number) {
  const fetchImpl = vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(new Response('{}', { status })),
  );
  const queue = new CloudTasksQueue(config, {
    getAccessToken: () => Promise.resolve('access-token'),
    fetchImpl,
    now: () => t0,
  });
  const lastBody = () => JSON.parse(fetchImpl.mock.calls.at(-1)?.[1]?.body as string) as TaskBody;
  return { queue, fetchImpl, lastBody };
}

describe('CloudTasksQueue', () => {
  it('creates a named task that POSTs the job to the worker with an OIDC token', async () => {
    const { queue, fetchImpl, lastBody } = queueWith(200);
    await queue.enqueue(job, { taskId: `${MESSAGE}-1`, delaySeconds: 120 });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://cloudtasks.googleapis.com/v2/projects/proj/locations/us-central1/queues/send-email/tasks',
    );
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer access-token');

    const { task } = lastBody();
    expect(task.name).toBe(
      `projects/proj/locations/us-central1/queues/send-email/tasks/${MESSAGE}-1`,
    );
    expect(task.scheduleTime).toBe('2026-09-29T12:02:00.000Z');
    expect(task.httpRequest.url).toBe(config.workerUrl);
    expect(task.httpRequest.oidcToken).toEqual({
      audience: config.workerUrl,
      serviceAccountEmail: config.serviceAccountEmail,
    });
    expect(JSON.parse(Buffer.from(task.httpRequest.body, 'base64').toString())).toEqual(job);
  });

  it('routes each job kind to its own internal endpoint and audience', async () => {
    const { queue, lastBody } = queueWith(200);
    await queue.enqueue(
      { kind: 'deliver-webhook', orgId: ORG, deliveryId: MESSAGE },
      { taskId: 'w' },
    );
    const { task } = lastBody();
    expect(task.httpRequest.url).toBe('https://api.example.com/internal/tasks/deliver-webhook');
    expect(task.httpRequest.oidcToken.audience).toBe(task.httpRequest.url);
    expect(task).not.toHaveProperty('scheduleTime');
  });

  it('treats 409 ALREADY_EXISTS as success and other failures as errors', async () => {
    await expect(queueWith(409).queue.enqueue(job, { taskId: 'dup' })).resolves.toBeUndefined();
    await expect(queueWith(500).queue.enqueue(job, { taskId: 'x' })).rejects.toBeInstanceOf(
      QueueError,
    );
  });
});
