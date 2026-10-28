import { sql } from 'drizzle-orm';
import { type PublicJwk } from '@postrail/shared';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { authChallengeKind, authProvider } from './enums';
import { orgScoped, tenantPolicy } from './tenancy';
import { timestamps } from './timestamps';

// End-user authentication (ADR 0011). These are the tenant's users, not Postrail's: the
// dashboard's own users live in `users` and belong to Better Auth.

/** One row per org, created on the first save. No row means every default applies. */
export const authSettings = pgTable(
  'auth_settings',
  {
    ...orgScoped,
    /** Name shown in sign-in emails. Null falls back to the org name. */
    appName: text('app_name'),
    redirectUrls: text('redirect_urls')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    googleEnabled: boolean('google_enabled').notNull().default(true),
    magicLinkEnabled: boolean('magic_link_enabled').notNull().default(true),
    emailOtpEnabled: boolean('email_otp_enabled').notNull().default(true),
    /** The tenant's own Google OAuth client. Both null means Postrail's shared client. */
    googleClientId: text('google_client_id'),
    googleClientSecretEnc: text('google_client_secret_enc'),
    // GitHub has no shared client, so it starts off and needs the tenant's OAuth app.
    githubEnabled: boolean('github_enabled').notNull().default(false),
    githubClientId: text('github_client_id'),
    githubClientSecretEnc: text('github_client_secret_enc'),
    /** False closes registration: only existing users can sign in. */
    signupsEnabled: boolean('signups_enabled').notNull().default(true),
    /** Template slugs for the sign-in emails. Null uses the built-in wording. */
    magicLinkTemplate: text('magic_link_template'),
    otpTemplate: text('otp_template'),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.orgId] }), tenantPolicy('auth_settings')],
).enableRLS();

export const authUsers = pgTable(
  'auth_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    /** Lowercased. The identity of an end user within an org. */
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name'),
    image: text('image'),
    lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
    ...timestamps,
    // Millisecond precision for the same reason as messages: the list cursor is
    // (created_at, id) and passes through a JavaScript Date.
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_users_org_created_idx').on(t.orgId, t.createdAt.desc()),
    unique('auth_users_org_email_uq').on(t.orgId, t.email),
    tenantPolicy('auth_users'),
  ],
).enableRLS();

/** A provider account linked to an end user. `provider_user_id` is Google's stable `sub`. */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    provider: authProvider('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_identities_org_user_idx').on(t.orgId, t.userId),
    unique('auth_identities_org_provider_uq').on(t.orgId, t.provider, t.providerUserId),
    tenantPolicy('auth_identities'),
  ],
).enableRLS();

/** The raw session token is returned once; lookups hash the presented token. */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_sessions_org_user_idx').on(t.orgId, t.userId), tenantPolicy('auth_sessions')],
).enableRLS();

/**
 * The key pair an org's access tokens are signed with. The id is the JWT `kid`; the public
 * half is published as JWKS, the private half is encrypted with TOKEN_ENCRYPTION_KEY.
 * Rows are only ever added, so tokens signed by an older key keep verifying.
 */
export const authSigningKeys = pgTable(
  'auth_signing_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    publicJwk: jsonb('public_jwk').$type<PublicJwk>().notNull(),
    privateKeyEnc: text('private_key_enc').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_signing_keys_org_created_idx').on(t.orgId, t.createdAt.desc()),
    tenantPolicy('auth_signing_keys'),
  ],
).enableRLS();

/**
 * A one-time proof waiting to be redeemed: an emailed link, an emailed code, or the code
 * a Google sign-in hands back to the tenant's app. Only a hash of the secret is stored.
 */
export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    kind: authChallengeKind('kind').notNull(),
    email: text('email').notNull(),
    /** Set for `oauth_code`, where the user already exists. Email kinds create on redeem. */
    userId: uuid('user_id').references(() => authUsers.id, { onDelete: 'cascade' }),
    /** Which provider an `oauth_code` came from, so the sign-in can say how it happened. */
    provider: authProvider('provider'),
    tokenHash: text('token_hash').notNull(),
    /** Wrong guesses so far. Only emailed codes can be guessed. */
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_challenges_org_token_idx').on(t.orgId, t.tokenHash),
    index('auth_challenges_org_email_created_idx').on(t.orgId, t.email, t.createdAt.desc()),
    tenantPolicy('auth_challenges'),
  ],
).enableRLS();
