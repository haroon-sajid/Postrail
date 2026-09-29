import {
  acceptInviteResponseSchema,
  errorResponseSchema,
  inviteSchema,
  meResponseSchema,
  memberListResponseSchema,
  orgSchema,
} from '@postrail/shared';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/app';
import { defaultOrgName } from './service';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function setup() {
  const t = createTestApp();
  const call = (
    user: Parameters<typeof t.sessionHeaders>[0],
    method: string,
    path: string,
    body?: unknown,
    extra: Record<string, string> = {},
  ) =>
    t.app.request(path, {
      method,
      headers: { ...t.sessionHeaders(user), ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { ...t, call };
}

async function errorCode(res: Response) {
  const body: unknown = await res.json();
  return errorResponseSchema.parse(body).error.code;
}

describe('defaultOrgName', () => {
  it('uses the company domain, or a neutral name for consumer mail', () => {
    expect(defaultOrgName('ada@acme.io')).toBe('Acme');
    expect(defaultOrgName('ada@gmail.com')).toBe('My workspace');
    expect(defaultOrgName('nonsense')).toBe('My workspace');
  });
});

describe('sessions and first sign-in', () => {
  it('rejects dashboard routes without a session and API keys alike', async () => {
    const t = setup();
    expect((await t.app.request('/app/me')).status).toBe(401);
    const withKey = await t.app.request('/app/me', { headers: t.authHeaders(ORG) });
    expect(withKey.status).toBe(401);
  });

  it('creates a default org with an owner membership on first sign-in', async () => {
    const t = setup();
    const user = {
      id: '10000000-0000-4000-8000-000000000099',
      email: 'ada@acme.io',
      name: 'Ada',
      image: null,
    };
    t.orgStore.addUser(user.id, user.email, user.name);
    await t.orgs.ensureDefaultOrg(user);
    await t.orgs.ensureDefaultOrg(user);

    const res = await t.call(user, 'GET', '/app/me');
    expect(res.status).toBe(200);
    const me = meResponseSchema.parse(await res.json());
    expect(me.user.email).toBe('ada@acme.io');
    expect(me.orgs).toHaveLength(1);
    expect(me.orgs[0]).toMatchObject({ name: 'Acme', role: 'owner' });
    expect(t.audit.entries).toEqual([expect.objectContaining({ action: 'org.created' })]);
  });

  it('lets a user create more orgs and switch between them', async () => {
    const t = setup();
    const user = t.member(ORG, 'member');
    const res = await t.call(user, 'POST', '/app/orgs', { name: 'Side project' });
    expect(res.status).toBe(201);
    expect(orgSchema.parse(await res.json())).toMatchObject({
      name: 'Side project',
      role: 'owner',
    });
    const me = meResponseSchema.parse(await (await t.call(user, 'GET', '/app/me')).json());
    expect(me.orgs.map((o) => o.role).sort()).toEqual(['member', 'owner']);
  });

  it('hides orgs the user is not a member of', async () => {
    const t = setup();
    t.member(ORG, 'owner');
    const outsider = t.member('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'owner');
    const res = await t.call(outsider, 'GET', `/app/orgs/${ORG}/members`);
    expect(res.status).toBe(404);
  });
});

describe('CSRF', () => {
  it('blocks state-changing session requests without the dashboard origin', async () => {
    const t = setup();
    const user = t.member(ORG, 'owner');
    const noOrigin = await t.app.request('/app/orgs', {
      method: 'POST',
      headers: { 'x-test-user': JSON.stringify(user), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(noOrigin.status).toBe(403);
    const wrongOrigin = await t.call(
      user,
      'POST',
      '/app/orgs',
      { name: 'x' },
      { origin: 'https://evil.example' },
    );
    expect(wrongOrigin.status).toBe(403);
    expect(await errorCode(wrongOrigin)).toBe('FORBIDDEN');
    const get = await t.app.request('/app/me', {
      headers: { 'x-test-user': JSON.stringify(user) },
    });
    expect(get.status).toBe(200);
  });
});

describe('members and roles', () => {
  it('lists members, changes roles and enforces owner rules', async () => {
    const t = setup();
    const owner = t.member(ORG, 'owner');
    const admin = t.member(ORG, 'admin');
    const member = t.member(ORG, 'member');

    const list = await t.call(owner, 'GET', `/app/orgs/${ORG}/members`);
    expect(memberListResponseSchema.parse(await list.json()).data).toHaveLength(3);

    // A member cannot manage; an admin can promote members but not mint owners.
    expect(
      (await t.call(member, 'PATCH', `/app/orgs/${ORG}/members/${admin.id}`, { role: 'member' }))
        .status,
    ).toBe(403);
    expect(
      (await t.call(admin, 'PATCH', `/app/orgs/${ORG}/members/${member.id}`, { role: 'admin' }))
        .status,
    ).toBe(204);
    expect(
      (await t.call(admin, 'PATCH', `/app/orgs/${ORG}/members/${member.id}`, { role: 'owner' }))
        .status,
    ).toBe(403);
    expect(
      (await t.call(admin, 'PATCH', `/app/orgs/${ORG}/members/${owner.id}`, { role: 'member' }))
        .status,
    ).toBe(403);

    // The last owner cannot be demoted or removed.
    expect(
      (await t.call(owner, 'PATCH', `/app/orgs/${ORG}/members/${owner.id}`, { role: 'admin' }))
        .status,
    ).toBe(400);
    expect((await t.call(owner, 'DELETE', `/app/orgs/${ORG}/members/${owner.id}`)).status).toBe(
      400,
    );

    // An admin removes a member; a plain member cannot remove anyone. (`member` was
    // promoted above, so use a fresh one here.)
    const viewer = t.member(ORG, 'member');
    expect((await t.call(viewer, 'DELETE', `/app/orgs/${ORG}/members/${admin.id}`)).status).toBe(
      403,
    );
    expect((await t.call(admin, 'DELETE', `/app/orgs/${ORG}/members/${viewer.id}`)).status).toBe(
      204,
    );
    expect(t.audit.entries.map((e) => e.action)).toContain('member.removed');
  });
});

describe('invites', () => {
  it('sends a signed link and lets the invited address join', async () => {
    const t = setup();
    const admin = t.member(ORG, 'admin');
    const res = await t.call(admin, 'POST', `/app/orgs/${ORG}/invites`, {
      email: 'New@Example.org',
      role: 'member',
    });
    expect(res.status).toBe(201);
    const invite = inviteSchema.parse(await res.json());
    expect(invite.email).toBe('new@example.org');

    expect(t.mailer.sent).toHaveLength(1);
    const token = /\/invite\/([A-Za-z0-9_-]+)/.exec(t.mailer.sent[0]?.text ?? '')?.[1] ?? '';
    expect(token.length).toBeGreaterThan(20);

    const preview = await t.app.request(`/app/invites/${token}`, {
      headers: t.sessionHeaders(admin),
    });
    expect(preview.status).toBe(200);

    const stranger = {
      id: '10000000-0000-4000-8000-000000000777',
      email: 'other@example.org',
      name: '',
      image: null,
    };
    const wrongUser = await t.call(stranger, 'POST', '/app/invites/accept', { token });
    expect(wrongUser.status).toBe(403);

    const invitee = {
      id: '10000000-0000-4000-8000-000000000778',
      email: 'new@example.org',
      name: '',
      image: null,
    };
    t.orgStore.addUser(invitee.id, invitee.email);
    const accepted = await t.call(invitee, 'POST', '/app/invites/accept', { token });
    expect(accepted.status).toBe(200);
    expect(acceptInviteResponseSchema.parse(await accepted.json()).org).toMatchObject({
      id: ORG,
      role: 'member',
    });

    const again = await t.call(invitee, 'POST', '/app/invites/accept', { token });
    expect(again.status).toBe(400);
    expect((await t.call(admin, 'GET', `/app/orgs/${ORG}/invites`)).status).toBe(200);
  });

  it('expires, can be revoked, and respects roles', async () => {
    const clock = { now: new Date('2026-09-29T12:00:00Z') };
    const t = createTestApp({ now: () => clock.now });
    const owner = t.member(ORG, 'owner');
    const member = t.member(ORG, 'member');
    const call = (user: typeof owner, method: string, path: string, body?: unknown) =>
      t.app.request(path, {
        method,
        headers: t.sessionHeaders(user),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    expect(
      (await call(member, 'POST', `/app/orgs/${ORG}/invites`, { email: 'x@example.org' })).status,
    ).toBe(403);
    expect(
      (await call(owner, 'POST', `/app/orgs/${ORG}/invites`, { email: owner.email })).status,
    ).toBe(409);

    const created = inviteSchema.parse(
      await (
        await call(owner, 'POST', `/app/orgs/${ORG}/invites`, { email: 'late@example.org' })
      ).json(),
    );
    const token = /\/invite\/([A-Za-z0-9_-]+)/.exec(t.mailer.sent[0]?.text ?? '')?.[1] ?? '';
    clock.now = new Date(clock.now.getTime() + 8 * 24 * 60 * 60 * 1000);
    const late = {
      id: '10000000-0000-4000-8000-000000000779',
      email: 'late@example.org',
      name: '',
      image: null,
    };
    const expired = await call(late, 'POST', '/app/invites/accept', { token });
    expect(expired.status).toBe(400);
    expect(await errorCode(expired)).toBe('VALIDATION_ERROR');

    expect((await call(owner, 'DELETE', `/app/orgs/${ORG}/invites/${created.id}`)).status).toBe(
      204,
    );
    expect((await call(owner, 'DELETE', `/app/orgs/${ORG}/invites/${created.id}`)).status).toBe(
      404,
    );
  });
});

describe('org settings', () => {
  it('renames (admin) and deletes with type-to-confirm (owner)', async () => {
    const t = setup();
    const owner = t.member(ORG, 'owner');
    const admin = t.member(ORG, 'admin');
    const member = t.member(ORG, 'member');

    expect((await t.call(member, 'PATCH', `/app/orgs/${ORG}`, { name: 'Nope' })).status).toBe(403);
    const renamed = await t.call(admin, 'PATCH', `/app/orgs/${ORG}`, { name: 'Renamed Org' });
    expect(renamed.status).toBe(200);
    expect(orgSchema.parse(await renamed.json()).name).toBe('Renamed Org');

    expect(
      (await t.call(admin, 'POST', `/app/orgs/${ORG}/delete`, { confirm_name: 'Renamed Org' }))
        .status,
    ).toBe(403);
    expect(
      (await t.call(owner, 'POST', `/app/orgs/${ORG}/delete`, { confirm_name: 'wrong' })).status,
    ).toBe(400);
    expect(
      (await t.call(owner, 'POST', `/app/orgs/${ORG}/delete`, { confirm_name: 'Renamed Org' }))
        .status,
    ).toBe(204);
    expect((await t.call(owner, 'GET', `/app/orgs/${ORG}/members`)).status).toBe(404);
  });
});
