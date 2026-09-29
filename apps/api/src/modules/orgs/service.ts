import { randomBytes } from 'node:crypto';
import {
  INVITE_TTL_DAYS,
  MEMBER_ROLE_RANK,
  type MemberRole,
  PERSONAL_EMAIL_DOMAINS,
  sha256Hex,
} from '@postrail/shared';
import { type AuthContext, type SessionUser, requireRole } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type AuditStore } from '../audit/repo';
import { type InviteRow, type MemberWithUser, type OrgRow, type OrgStore } from './repo';
import {
  type CreateInviteRequest,
  type Invite,
  type Member,
  type MeResponse,
  type Org,
} from './schemas';

/** Sends transactional mail on Postrail's own behalf (invites, magic links). */
export interface SystemMailer {
  send: (input: { to: string; subject: string; html: string; text: string }) => Promise<void>;
}

export interface OrgServiceDeps {
  store: OrgStore;
  audit: AuditStore;
  mailer: SystemMailer;
  dashboardOrigin: string;
  now?: () => Date;
}

export interface OrgService {
  me: (user: SessionUser) => Promise<MeResponse>;
  /** First sign-in: give the user a workspace so the dashboard has somewhere to land. */
  ensureDefaultOrg: (user: SessionUser) => Promise<void>;
  createOrg: (user: SessionUser, name: string) => Promise<Org>;
  updateOrg: (auth: AuthContext, name: string) => Promise<Org>;
  deleteOrg: (auth: AuthContext, confirmName: string) => Promise<void>;
  listMembers: (auth: AuthContext) => Promise<Member[]>;
  changeRole: (auth: AuthContext, userId: string, role: MemberRole) => Promise<void>;
  removeMember: (auth: AuthContext, userId: string) => Promise<void>;
  invite: (auth: AuthContext, input: CreateInviteRequest) => Promise<Invite>;
  listInvites: (auth: AuthContext) => Promise<Invite[]>;
  revokeInvite: (auth: AuthContext, inviteId: string) => Promise<void>;
  previewInvite: (
    token: string,
  ) => Promise<{ orgName: string; email: string; role: MemberRole; expiresAt: Date }>;
  acceptInvite: (user: SessionUser, token: string) => Promise<Org>;
}

export function createOrgService(deps: OrgServiceDeps): OrgService {
  const { store, audit, mailer } = deps;
  const now = deps.now ?? (() => new Date());

  async function orgView(orgId: string, role: MemberRole): Promise<Org> {
    const org = await store.getOrg(orgId);
    if (!org) throw AppError.notFound('org');
    return toOrg(org, role);
  }

  async function findInvite(token: string): Promise<InviteRow & { orgName: string }> {
    const invite = await store.findInviteByTokenHash(sha256Hex(token));
    if (!invite) throw AppError.notFound('invite');
    if (invite.acceptedAt) throw AppError.validation('this invite has already been used');
    if (invite.expiresAt.getTime() <= now().getTime()) {
      throw AppError.validation('this invite has expired; ask for a new one');
    }
    return invite;
  }

  return {
    async me(user) {
      const orgs = await store.listForUser(user.id);
      return { user, orgs: orgs.map((m) => toOrg(m.org, m.role)) };
    },

    async ensureDefaultOrg(user) {
      if ((await store.listForUser(user.id)).length > 0) return;
      const org = await store.createOrgWithOwner(user.id, defaultOrgName(user.email));
      await audit.record(org.id, {
        actor: `user:${user.id}`,
        action: 'org.created',
        target: org.id,
      });
    },

    async createOrg(user, name) {
      const org = await store.createOrgWithOwner(user.id, name);
      await audit.record(org.id, {
        actor: `user:${user.id}`,
        action: 'org.created',
        target: org.id,
      });
      return toOrg(org, 'owner');
    },

    async updateOrg(auth, name) {
      requireRole(auth, 'admin');
      const org = await store.updateOrg(auth.orgId, { name });
      if (!org) throw AppError.notFound('org');
      await audit.record(auth.orgId, { actor: auth.actor, action: 'org.renamed', meta: { name } });
      return toOrg(org, auth.role ?? 'owner');
    },

    async deleteOrg(auth, confirmName) {
      requireRole(auth, 'owner');
      const org = await store.getOrg(auth.orgId);
      if (!org) throw AppError.notFound('org');
      if (confirmName !== org.name)
        throw AppError.validation('type the org name exactly to confirm');
      // The audit row goes with the org; the deletion itself is the record.
      await store.deleteOrg(auth.orgId);
    },

    async listMembers(auth) {
      return (await store.listMembers(auth.orgId)).map(toMember);
    },

    async changeRole(auth, userId, role) {
      requireRole(auth, 'admin');
      const target = await targetMember(store, auth.orgId, userId);
      if (target.role === 'owner' || role === 'owner') requireRole(auth, 'owner');
      if (target.role === 'owner' && role !== 'owner') await assertNotLastOwner(store, auth.orgId);
      await store.updateMemberRole(auth.orgId, userId, role);
      await audit.record(auth.orgId, {
        actor: auth.actor,
        action: 'member.role_changed',
        target: userId,
        meta: { role, previous: target.role },
      });
    },

    async removeMember(auth, userId) {
      const self = auth.userId === userId;
      if (!self) requireRole(auth, 'admin');
      const target = await targetMember(store, auth.orgId, userId);
      if (target.role === 'owner') {
        if (!self) requireRole(auth, 'owner');
        await assertNotLastOwner(store, auth.orgId);
      }
      await store.removeMember(auth.orgId, userId);
      await audit.record(auth.orgId, {
        actor: auth.actor,
        action: self ? 'member.left' : 'member.removed',
        target: userId,
      });
    },

    async invite(auth, input) {
      requireRole(auth, 'admin');
      if (input.role === 'owner') requireRole(auth, 'owner');
      const email = input.email.toLowerCase();
      const existing = await store.listMembers(auth.orgId);
      if (existing.some((m) => m.email.toLowerCase() === email)) {
        throw AppError.conflict(`${email} is already a member`);
      }
      // 192 random bits; only the hash is stored, the link carries the raw token once.
      const token = randomBytes(24).toString('base64url');
      const expiresAt = new Date(now().getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      const org = await store.getOrg(auth.orgId);
      if (!org) throw AppError.notFound('org');
      const row = await store.createInvite(auth.orgId, {
        email,
        role: input.role,
        tokenHash: sha256Hex(token),
        invitedBy: auth.userId ?? '',
        expiresAt,
      });
      const url = `${deps.dashboardOrigin}/invite/${token}`;
      await mailer.send({
        to: email,
        subject: `You've been invited to ${org.name} on Postrail`,
        text: `You have been invited to join ${org.name} as ${input.role}.\n\nAccept: ${url}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
        html: `<p>You have been invited to join <strong>${escapeHtml(org.name)}</strong> as ${input.role}.</p><p><a href="${url}">Accept the invitation</a></p><p>This link expires in ${INVITE_TTL_DAYS} days.</p>`,
      });
      await audit.record(auth.orgId, {
        actor: auth.actor,
        action: 'member.invited',
        target: row.id,
        meta: { email, role: input.role },
      });
      return toInvite(row);
    },

    async listInvites(auth) {
      return (await store.listPendingInvites(auth.orgId, now())).map(toInvite);
    },

    async revokeInvite(auth, inviteId) {
      requireRole(auth, 'admin');
      if (!(await store.deleteInvite(auth.orgId, inviteId))) throw AppError.notFound('invite');
      await audit.record(auth.orgId, {
        actor: auth.actor,
        action: 'member.invite_revoked',
        target: inviteId,
      });
    },

    async previewInvite(token) {
      const invite = await findInvite(token);
      return {
        orgName: invite.orgName,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      };
    },

    async acceptInvite(user, token) {
      const invite = await findInvite(token);
      if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
        throw AppError.forbidden(
          `this invite was sent to ${invite.email}; sign in with that address`,
        );
      }
      await store.acceptInvite(invite.orgId, invite.id, user.id, invite.role, now());
      await audit.record(invite.orgId, {
        actor: `user:${user.id}`,
        action: 'member.joined',
        target: user.id,
        meta: { role: invite.role, invite: invite.id },
      });
      return orgView(invite.orgId, invite.role);
    },
  };
}

async function targetMember(
  store: OrgStore,
  orgId: string,
  userId: string,
): Promise<MemberWithUser> {
  const target = (await store.listMembers(orgId)).find((m) => m.userId === userId);
  if (!target) throw AppError.notFound('member');
  return target;
}

async function assertNotLastOwner(store: OrgStore, orgId: string): Promise<void> {
  if ((await store.countOwners(orgId)) <= 1) {
    throw AppError.validation('an org must keep at least one owner');
  }
}

/** "acme" for ada@acme.io; "My workspace" for consumer mail domains. */
export function defaultOrgName(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) return 'My workspace';
  const label = domain.split('.')[0] ?? domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function canManageMembers(role: MemberRole): boolean {
  return MEMBER_ROLE_RANK[role] >= MEMBER_ROLE_RANK.admin;
}

function toOrg(org: OrgRow, role: MemberRole): Org {
  return { id: org.id, name: org.name, role, created_at: org.createdAt.toISOString() };
}

function toMember(m: MemberWithUser): Member {
  return {
    user_id: m.userId,
    email: m.email,
    name: m.name,
    role: m.role,
    joined_at: m.joinedAt.toISOString(),
  };
}

function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expires_at: row.expiresAt.toISOString(),
    created_at: row.createdAt.toISOString(),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
