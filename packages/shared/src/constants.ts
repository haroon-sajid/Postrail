export const APP_NAME = 'postrail';

/** Marker file that identifies the monorepo root when walking up from a package directory. */
export const WORKSPACE_ROOT_MARKER = 'pnpm-workspace.yaml';

// Enum values are defined once here so the Postgres enums (packages/db) and the zod
// schemas (this package) can never drift apart.
export const MEMBER_ROLES = ['owner', 'admin', 'member'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MAILBOX_PROVIDERS = ['google', 'microsoft'] as const;
export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number];

export const MAILBOX_STATUSES = ['active', 'disconnected', 'paused'] as const;
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

export const MESSAGE_STATUSES = ['queued', 'sending', 'sent', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'sending', 'delivered', 'failed'] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export const WEBHOOK_EVENTS = ['email.sent', 'email.failed', 'mailbox.disconnected'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Total delivery tries per webhook event, including the first. */
export const MAX_WEBHOOK_ATTEMPTS = 8;

/** Receivers should reject signatures whose timestamp is older than this. */
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export const SUPPRESSION_REASONS = ['manual', 'hard_bounce', 'complaint', 'unsubscribe'] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/** Gmail's free-account sending cap is ~500/day; 400 leaves room for the tenant's own mail. */
export const DEFAULT_MAILBOX_DAILY_LIMIT = 400;

/** Public API limits. Documented in ADR 0004 and enforced by the shared schemas. */
export const MAX_BATCH_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_BODY_CHARS = 500_000;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
