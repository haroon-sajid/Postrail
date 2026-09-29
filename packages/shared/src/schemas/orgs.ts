import { z } from 'zod';
import { MEMBER_ROLES } from '../constants';
import { uuidSchema } from './common';

export const orgNameSchema = z.string().trim().min(1).max(80);

export const orgSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  /** The calling user's role in this org. */
  role: z.enum(MEMBER_ROLES),
  created_at: z.iso.datetime(),
});
export type Org = z.infer<typeof orgSchema>;

export const sessionUserSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  name: z.string(),
  image: z.string().nullable(),
});
export type SessionUserView = z.infer<typeof sessionUserSchema>;

export const meResponseSchema = z.object({
  user: sessionUserSchema,
  orgs: z.array(orgSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const createOrgRequestSchema = z.object({ name: orgNameSchema });
export const updateOrgRequestSchema = z.object({ name: orgNameSchema });
/** Type-to-confirm: the name must be echoed back exactly. */
export const deleteOrgRequestSchema = z.object({ confirm_name: z.string() });

export const memberSchema = z.object({
  user_id: uuidSchema,
  email: z.email(),
  name: z.string(),
  role: z.enum(MEMBER_ROLES),
  joined_at: z.iso.datetime(),
});
export type Member = z.infer<typeof memberSchema>;
export const memberListResponseSchema = z.object({ data: z.array(memberSchema) });

export const updateMemberRoleRequestSchema = z.object({ role: z.enum(MEMBER_ROLES) });

export const createInviteRequestSchema = z.object({
  email: z.email(),
  role: z.enum(MEMBER_ROLES).default('member'),
});
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

export const inviteSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  role: z.enum(MEMBER_ROLES),
  expires_at: z.iso.datetime(),
  created_at: z.iso.datetime(),
});
export type Invite = z.infer<typeof inviteSchema>;
export const inviteListResponseSchema = z.object({ data: z.array(inviteSchema) });

export const acceptInviteRequestSchema = z.object({ token: z.string().min(1) });
export const acceptInviteResponseSchema = z.object({ org: orgSchema });

/** What the dashboard shows on GET /app/invites/{token} before the user accepts. */
export const invitePreviewSchema = z.object({
  org_name: z.string(),
  email: z.email(),
  role: z.enum(MEMBER_ROLES),
  expires_at: z.iso.datetime(),
});
