import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalQueue } from './local';
import { type Job } from './types';

const job = (n: number): Job => ({
  kind: 'send-email',
  orgId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  messageId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
});

describe('LocalQueue (drain mode)', () => {
  it('runs jobs in order, including ones enqueued while draining', async () => {
    const queue = new LocalQueue({ autoRun: false });
    const seen: string[] = [];
    queue.setHandler(async (j) => {
      seen.push(j.kind === 'send-email' ? j.messageId : j.deliveryId);
      if (seen.length === 1) await queue.enqueue(job(3), { taskId: 'three' });
    });
    await queue.enqueue(job(1), { taskId: 'one' });
    await queue.enqueue(job(2), { taskId: 'two' });
    await queue.drain();
    expect(seen.map((id) => id.slice(-1))).toEqual(['1', '2', '3']);
    expect(queue.size).toBe(0);
  });

  it('deduplicates task ids like Cloud Tasks does', async () => {
    const queue = new LocalQueue({ autoRun: false });
    const handler = vi.fn(() => Promise.resolve());
    queue.setHandler(handler);
    await queue.enqueue(job(1), { taskId: 'same' });
    await queue.enqueue(job(1), { taskId: 'same' });
    await queue.drain();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('surfaces handler errors to the test', async () => {
    const queue = new LocalQueue({ autoRun: false });
    queue.setHandler(() => Promise.reject(new Error('boom')));
    await queue.enqueue(job(1), { taskId: 'x' });
    await expect(queue.drain()).rejects.toThrow('boom');
  });
});

describe('LocalQueue (auto-run mode)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('honours delays and redelivers a failed job a few times', async () => {
    const queue = new LocalQueue();
    const handler = vi.fn(() => Promise.reject(new Error('flaky')));
    queue.setHandler(handler);

    await queue.enqueue(job(1), { taskId: 'delayed', delaySeconds: 30 });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(handler).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(handler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(handler).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(handler).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(handler).toHaveBeenCalledTimes(3);
    queue.close();
  });
});
