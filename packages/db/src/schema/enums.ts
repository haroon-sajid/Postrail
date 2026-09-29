import {
  MAILBOX_PROVIDERS,
  MAILBOX_STATUSES,
  MEMBER_ROLES,
  MESSAGE_STATUSES,
  WEBHOOK_DELIVERY_STATUSES,
} from '@postrail/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

export const memberRole = pgEnum('member_role', MEMBER_ROLES);
export const mailboxProvider = pgEnum('mailbox_provider', MAILBOX_PROVIDERS);
export const mailboxStatus = pgEnum('mailbox_status', MAILBOX_STATUSES);
export const messageStatus = pgEnum('message_status', MESSAGE_STATUSES);
export const webhookDeliveryStatus = pgEnum('webhook_delivery_status', WEBHOOK_DELIVERY_STATUSES);
