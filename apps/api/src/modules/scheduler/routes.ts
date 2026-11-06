import { createRouter } from '../../lib/router';
import { type SchedulerService } from './service';

/**
 * Called by a clock outside the API: the dashboard Worker's Cron Trigger, or Cloud
 * Scheduler. Guarded by `requireInternalAuth` in app.ts, which for these paths also
 * accepts CRON_SECRET, and deliberately absent from the OpenAPI document.
 */
export function schedulerRoutes(scheduler: SchedulerService) {
  const router = createRouter();

  // Every few minutes. A 500 when any part failed, so the caller's own logs show it.
  router.post('/internal/cron/tick', async (c) => {
    const report = await scheduler.tick();
    return c.json(report, report.failed.length > 0 ? 500 : 200);
  });

  // The original daily target, kept for Cloud Scheduler jobs that already call it.
  router.post('/internal/cron/reset-daily-counters', async (c) =>
    c.json(await scheduler.resetDaily(), 200),
  );

  return router;
}
