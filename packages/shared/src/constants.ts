export const APP_NAME = 'postrail';

/** Marker file that identifies the monorepo root when walking up from a package directory. */
export const WORKSPACE_ROOT_MARKER = 'pnpm-workspace.yaml';

// Enum values are defined once here so the Postgres enums (packages/db) and the zod
// schemas (this package) can never drift apart.
export const MEMBER_ROLES = ['owner', 'admin', 'member'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Higher wins. Used for "at least admin" checks. */
export const MEMBER_ROLE_RANK: Record<MemberRole, number> = { member: 0, admin: 1, owner: 2 };

export const INVITE_TTL_DAYS = 7;

/** Consumer mail domains that should not become a workspace name. */
export const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
]);

export const MAILBOX_PROVIDERS = ['google', 'microsoft'] as const;
export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number];

export const MAILBOX_STATUSES = ['active', 'disconnected', 'paused'] as const;
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

export const MESSAGE_STATUSES = ['queued', 'sending', 'sent', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'sending', 'delivered', 'failed'] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export const WEBHOOK_EVENTS = [
  'email.sent',
  'email.failed',
  'mailbox.disconnected',
  'user.created',
  'user.signed_in',
  'user.deleted',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Total delivery tries per webhook event, including the first. */
export const MAX_WEBHOOK_ATTEMPTS = 8;

/** Receivers should reject signatures whose timestamp is older than this. */
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export const SUPPRESSION_REASONS = ['manual', 'hard_bounce', 'complaint', 'unsubscribe'] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/** Gmail's free-account sending cap is ~500/day; 400 leaves room for the tenant's own mail. */
export const DEFAULT_MAILBOX_DAILY_LIMIT = 400;

// End-user authentication (ADR 0011): the people who sign in to a tenant's app.
export const AUTH_PROVIDERS = ['google', 'github'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/** Every way a user can sign in. Reported on `user.signed_in` and switchable per workspace. */
export const AUTH_METHODS = [...AUTH_PROVIDERS, 'magic_link', 'email_otp'] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

/** One-time proofs: an emailed link, an emailed code, or the code a Google sign-in ends with. */
export const AUTH_CHALLENGE_KINDS = ['magic_link', 'email_otp', 'oauth_code'] as const;
export type AuthChallengeKind = (typeof AUTH_CHALLENGE_KINDS)[number];

export const AUTH_SESSION_TTL_DAYS = 30;
/**
 * Lifetime of the signed access token a tenant verifies offline. Also how long a revoked
 * session can keep passing an offline check, so it is short.
 */
export const AUTH_ACCESS_TOKEN_TTL_MINUTES = 15;
export const AUTH_MAGIC_LINK_TTL_MINUTES = 15;
export const AUTH_OTP_TTL_MINUTES = 10;
/** The code only has to survive one redirect and one server-to-server call. */
export const AUTH_OAUTH_CODE_TTL_MINUTES = 5;
export const AUTH_OTP_LENGTH = 6;
/** Wrong guesses allowed per emailed code; six digits must not be brute-forceable. */
export const AUTH_OTP_MAX_ATTEMPTS = 5;
/** Sign-in emails one address may be sent per window, so a login form cannot be used to spam. */
export const AUTH_EMAILS_PER_WINDOW = 5;
export const AUTH_EMAIL_WINDOW_MINUTES = 15;
export const AUTH_MAX_REDIRECT_URLS = 20;

/**
 * What Postrail fills in when a workspace uses its own template for a sign-in email. The
 * first name in each list is the one the template cannot do without.
 */
export const AUTH_TEMPLATE_VARIABLES = {
  magic_link: ['url', 'app_name', 'email', 'expires_in_minutes'],
  email_otp: ['code', 'app_name', 'email', 'expires_in_minutes'],
} as const;
export type AuthEmailKind = keyof typeof AUTH_TEMPLATE_VARIABLES;

// Contacts and broadcasts (ADR 0012, ADR 0013).
export const MAX_CONTACT_IMPORT = 1000;
export const MAX_CONTACT_PROPERTIES = 50;
export const MAX_CONTACT_PROPERTY_CHARS = 1000;

/** `sent` means every recipient was handed to delivery; each message then has its own status. */
export const BROADCAST_STATUSES = ['draft', 'sending', 'sent', 'canceled'] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

/** Stored per recipient. `dispatching` is the claim a worker holds while it queues one. */
export const BROADCAST_RECIPIENT_STATES = [
  'pending',
  'dispatching',
  'queued',
  'skipped',
  'failed',
] as const;
export type BroadcastRecipientState = (typeof BROADCAST_RECIPIENT_STATES)[number];

/** What the API reports per recipient: the stored state folded with the message's own status. */
export const BROADCAST_RECIPIENT_STATUSES = [
  'pending',
  'queued',
  'sent',
  'failed',
  'skipped',
] as const;
export type BroadcastRecipientStatus = (typeof BROADCAST_RECIPIENT_STATUSES)[number];

/**
 * A broadcast may fill a mailbox to this share of its daily limit and no further, so
 * password resets and sign-in emails still go out on the day of a big send.
 */
export const BROADCAST_CAPACITY_SHARE = 0.8;
/** Recipients handed to delivery per worker round. */
export const BROADCAST_BATCH_SIZE = 50;

/** Public API limits. Documented in ADR 0004 and enforced by the shared schemas. */
export const MAX_BATCH_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_BODY_CHARS = 500_000;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
