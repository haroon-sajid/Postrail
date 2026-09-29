import { DEFAULT_MAILBOX_DAILY_LIMIT } from '@postrail/shared';
import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { mailboxProvider, mailboxStatus } from './enums';
import { orgScoped, tenantPolicy } from './tenancy';
import { timestamps } from './timestamps';

/** A tenant's connected Gmail or Outlook account. Tokens are stored encrypted, never raw. */
export const mailboxes = pgTable(
  'mailboxes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    email: text('email').notNull(),
    provider: mailboxProvider('provider').notNull(),
    refreshTokenEnc: text('refresh_token_enc').notNull(),
    accessTokenEnc: text('access_token_enc'),
    accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }),
    dailyLimit: integer('daily_limit').notNull().default(DEFAULT_MAILBOX_DAILY_LIMIT),
    sentToday: integer('sent_today').notNull().default(0),
    status: mailboxStatus('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    index('mailboxes_org_id_idx').on(t.orgId),
    unique('mailboxes_org_email_uq').on(t.orgId, t.email),
    tenantPolicy('mailboxes'),
  ],
).enableRLS();
