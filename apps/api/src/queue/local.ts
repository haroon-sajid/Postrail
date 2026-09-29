import { type Logger } from '../lib/logger';
import { type EnqueueOptions, type Job, type JobHandler, type Queue } from './types';

export interface LocalQueueOptions {
  /** Deliver on timers as jobs arrive (dev). `false` lets tests call `drain()` instead. */
  autoRun?: boolean;
  logger?: Logger;
}

interface Entry {
  job: Job;
  taskId: string;
  delaySeconds: number;
  deliveries: number;
}

/** Like Cloud Tasks: retry a delivery whose handler threw, a few times, then give up. */
const MAX_DELIVERIES = 3;
const REDELIVERY_DELAY_MS = 5_000;

/**
 * In-process queue for development and tests. Same contract as Cloud Tasks: named
 * tasks deduplicate, delays are honoured, at-least-once delivery, handler errors redeliver.
 */
export class LocalQueue implements Queue {
  private handler: JobHandler | undefined;
  private readonly pending: Entry[] = [];
  private readonly seen = new Set<string>();
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(private readonly options: LocalQueueOptions = {}) {}

  setHandler(handler: JobHandler): void {
    this.handler = handler;
  }

  /** Jobs waiting to run, in order. Tests inspect this. */
  get size(): number {
    return this.pending.length;
  }

  get taskIds(): string[] {
    return this.pending.map((e) => e.taskId);
  }

  enqueue = (job: Job, { taskId, delaySeconds = 0 }: EnqueueOptions): Promise<void> => {
    if (this.seen.has(taskId)) return Promise.resolve();
    this.seen.add(taskId);
    const entry: Entry = { job, taskId, delaySeconds, deliveries: 0 };
    this.pending.push(entry);
    if (this.options.autoRun !== false) this.schedule(entry, delaySeconds * 1000);
    return Promise.resolve();
  };

  /** Tests: run everything pending, ignoring delays, including work enqueued meanwhile. */
  async drain(): Promise<void> {
    for (let entry = this.pending.shift(); entry; entry = this.pending.shift()) {
      await this.deliver(entry);
    }
  }

  /** Tests: run exactly one pending job, so intermediate state (a scheduled retry) is visible. */
  async step(): Promise<boolean> {
    const entry = this.pending.shift();
    if (!entry) return false;
    await this.deliver(entry);
    return true;
  }

  close(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private schedule(entry: Entry, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const index = this.pending.indexOf(entry);
      if (index >= 0) this.pending.splice(index, 1);
      void this.deliver(entry);
    }, delayMs);
    // Never keep the process alive just for a pending job.
    timer.unref();
    this.timers.add(timer);
  }

  private async deliver(entry: Entry): Promise<void> {
    if (!this.handler) throw new Error('LocalQueue has no handler');
    entry.deliveries += 1;
    try {
      await this.handler(entry.job);
    } catch (error) {
      // drain() mode: surface the error to the test. autoRun mode: behave like a queue.
      if (this.options.autoRun === false) throw error;
      this.options.logger?.error(
        { err: error, taskId: entry.taskId, deliveries: entry.deliveries },
        'local queue delivery failed',
      );
      if (entry.deliveries < MAX_DELIVERIES) {
        this.pending.push(entry);
        this.schedule(entry, REDELIVERY_DELAY_MS);
      }
    }
  }
}
