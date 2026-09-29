import { createRoute, z } from '@hono/zod-openapi';
import { uuidSchema } from '@postrail/shared';
import { getAuth, getUser } from '../../lib/context';
import { COOKIE_SECURITY, ERROR_RESPONSES, jsonBody, jsonContent } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import {
  acceptInviteRequestSchema,
  acceptInviteResponseSchema,
  createInviteRequestSchema,
  createOrgRequestSchema,
  deleteOrgRequestSchema,
  invitePreviewSchema,
  inviteListResponseSchema,
  inviteSchema,
  meResponseSchema,
  memberListResponseSchema,
  orgSchema,
  updateMemberRoleRequestSchema,
  updateOrgRequestSchema,
} from './schemas';
import { type OrgService } from './service';

const TAG = 'Account (dashboard)';
const orgParams = z.object({ orgId: uuidSchema });
const memberParams = orgParams.extend({ userId: uuidSchema });
const inviteParams = orgParams.extend({ id: uuidSchema });
const tokenParams = z.object({ token: z.string().min(1) });

const me = createRoute({
  method: 'get',
  path: '/app/me',
  tags: [TAG],
  summary: 'Current user and their orgs',
  security: COOKIE_SECURITY,
  responses: { 200: jsonContent(meResponseSchema, 'Session user'), ...ERROR_RESPONSES },
});

const createOrg = createRoute({
  method: 'post',
  path: '/app/orgs',
  tags: [TAG],
  summary: 'Create an org; the caller becomes owner',
  security: COOKIE_SECURITY,
  request: { body: jsonBody(createOrgRequestSchema, 'Name') },
  responses: { 201: jsonContent(orgSchema, 'Created'), ...ERROR_RESPONSES },
});

const previewInvite = createRoute({
  method: 'get',
  path: '/app/invites/{token}',
  tags: [TAG],
  summary: 'Look at an invite before accepting it',
  security: COOKIE_SECURITY,
  request: { params: tokenParams },
  responses: { 200: jsonContent(invitePreviewSchema, 'Invite'), ...ERROR_RESPONSES },
});

const acceptInvite = createRoute({
  method: 'post',
  path: '/app/invites/accept',
  tags: [TAG],
  summary: 'Accept an invite for the signed-in user',
  security: COOKIE_SECURITY,
  request: { body: jsonBody(acceptInviteRequestSchema, 'Token from the link') },
  responses: { 200: jsonContent(acceptInviteResponseSchema, 'Joined'), ...ERROR_RESPONSES },
});

/** Routes that only need a session, mounted before the org-member middleware. */
export function accountRoutes(service: OrgService) {
  return createRouter()
    .openapi(me, async (c) => c.json(await service.me(getUser(c)), 200))
    .openapi(createOrg, async (c) =>
      c.json(await service.createOrg(getUser(c), c.req.valid('json').name), 201),
    )
    .openapi(previewInvite, async (c) => {
      const p = await service.previewInvite(c.req.valid('param').token);
      return c.json(
        {
          org_name: p.orgName,
          email: p.email,
          role: p.role,
          expires_at: p.expiresAt.toISOString(),
        },
        200,
      );
    })
    .openapi(acceptInvite, async (c) =>
      c.json({ org: await service.acceptInvite(getUser(c), c.req.valid('json').token) }, 200),
    );
}

const ORG_TAG = 'Org settings (dashboard)';

const updateOrg = createRoute({
  method: 'patch',
  path: '/app/orgs/{orgId}',
  tags: [ORG_TAG],
  summary: 'Rename the org (admin)',
  security: COOKIE_SECURITY,
  request: { params: orgParams, body: jsonBody(updateOrgRequestSchema, 'New name') },
  responses: { 200: jsonContent(orgSchema, 'Updated'), ...ERROR_RESPONSES },
});

const deleteOrg = createRoute({
  method: 'post',
  path: '/app/orgs/{orgId}/delete',
  tags: [ORG_TAG],
  summary: 'Delete the org and everything in it (owner, type-to-confirm)',
  security: COOKIE_SECURITY,
  request: { params: orgParams, body: jsonBody(deleteOrgRequestSchema, 'The org name, exactly') },
  responses: { 204: { description: 'Deleted' }, ...ERROR_RESPONSES },
});

const listMembers = createRoute({
  method: 'get',
  path: '/app/orgs/{orgId}/members',
  tags: [ORG_TAG],
  summary: 'List members',
  security: COOKIE_SECURITY,
  request: { params: orgParams },
  responses: { 200: jsonContent(memberListResponseSchema, 'Members'), ...ERROR_RESPONSES },
});

const changeRole = createRoute({
  method: 'patch',
  path: '/app/orgs/{orgId}/members/{userId}',
  tags: [ORG_TAG],
  summary: 'Change a member role (admin; owner for owner changes)',
  security: COOKIE_SECURITY,
  request: { params: memberParams, body: jsonBody(updateMemberRoleRequestSchema, 'Role') },
  responses: { 204: { description: 'Changed' }, ...ERROR_RESPONSES },
});

const removeMember = createRoute({
  method: 'delete',
  path: '/app/orgs/{orgId}/members/{userId}',
  tags: [ORG_TAG],
  summary: 'Remove a member (admin) or leave (self)',
  security: COOKIE_SECURITY,
  request: { params: memberParams },
  responses: { 204: { description: 'Removed' }, ...ERROR_RESPONSES },
});

const listInvites = createRoute({
  method: 'get',
  path: '/app/orgs/{orgId}/invites',
  tags: [ORG_TAG],
  summary: 'List pending invites',
  security: COOKIE_SECURITY,
  request: { params: orgParams },
  responses: { 200: jsonContent(inviteListResponseSchema, 'Pending invites'), ...ERROR_RESPONSES },
});

const createInvite = createRoute({
  method: 'post',
  path: '/app/orgs/{orgId}/invites',
  tags: [ORG_TAG],
  summary: 'Invite by email (admin)',
  security: COOKIE_SECURITY,
  request: { params: orgParams, body: jsonBody(createInviteRequestSchema, 'Email and role') },
  responses: { 201: jsonContent(inviteSchema, 'Invite sent'), ...ERROR_RESPONSES },
});

const revokeInvite = createRoute({
  method: 'delete',
  path: '/app/orgs/{orgId}/invites/{id}',
  tags: [ORG_TAG],
  summary: 'Revoke a pending invite (admin)',
  security: COOKIE_SECURITY,
  request: { params: inviteParams },
  responses: { 204: { description: 'Revoked' }, ...ERROR_RESPONSES },
});

/** Routes inside an org, mounted behind requireOrgMember. */
export function orgRoutes(service: OrgService) {
  return createRouter()
    .openapi(updateOrg, async (c) =>
      c.json(await service.updateOrg(getAuth(c), c.req.valid('json').name), 200),
    )
    .openapi(deleteOrg, async (c) => {
      await service.deleteOrg(getAuth(c), c.req.valid('json').confirm_name);
      return c.body(null, 204);
    })
    .openapi(listMembers, async (c) => c.json({ data: await service.listMembers(getAuth(c)) }, 200))
    .openapi(changeRole, async (c) => {
      await service.changeRole(getAuth(c), c.req.valid('param').userId, c.req.valid('json').role);
      return c.body(null, 204);
    })
    .openapi(removeMember, async (c) => {
      await service.removeMember(getAuth(c), c.req.valid('param').userId);
      return c.body(null, 204);
    })
    .openapi(listInvites, async (c) => c.json({ data: await service.listInvites(getAuth(c)) }, 200))
    .openapi(createInvite, async (c) =>
      c.json(await service.invite(getAuth(c), c.req.valid('json')), 201),
    )
    .openapi(revokeInvite, async (c) => {
      await service.revokeInvite(getAuth(c), c.req.valid('param').id);
      return c.body(null, 204);
    });
}
