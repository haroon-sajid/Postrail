import { z } from 'zod';
import { MAILBOX_STATUSES } from '../constants';
import { uuidSchema } from './common';
import { emailSchema } from './emails';

export const overviewSchema = z.object({
  stats: z.object({
    sent_today: z.number().int(),
    sent_yesterday: z.number().int(),
    sent_7d: z.number().int(),
    sent_prev_7d: z.number().int(),
    failed_7d: z.number().int(),
    failed_prev_7d: z.number().int(),
    active_mailboxes: z.number().int(),
    total_mailboxes: z.number().int(),
  }),
  /** One entry per day for the last 30 days, oldest first, zero-filled. */
  series: z.array(z.object({ date: z.string(), sent: z.number().int(), failed: z.number().int() })),
  mailbox_usage: z.array(
    z.object({
      id: uuidSchema,
      email: z.email(),
      status: z.enum(MAILBOX_STATUSES),
      sent_today: z.number().int(),
      daily_limit: z.number().int(),
    }),
  ),
  recent_failures: z.array(emailSchema),
});
export type Overview = z.infer<typeof overviewSchema>;
