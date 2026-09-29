import {
  apiKeyCreatedSchema,
  apiKeyListResponseSchema,
  errorResponseSchema,
} from '@postrail/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import { createTestApp } from '../../test/app';
import { inMemoryApiKeyStore } from '../../test/fakes';
import { createApiKeyService, LAST_USED_THROTTLE_MS } from './service';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('api key service', () => {
  const t0 = new Date('2026-09-29T12:00:00Z');

  function setup(nowMs = t0.getTime()) {
    const store = inMemoryApiKeyStore();
    const clock = { now: nowMs };
    const service = createApiKeyService({ store, now: () => new Date(clock.now) });
    return { store, service, clock };
  }

  it('rejects a missing, malformed or non-postrail bearer token', async () => {
    const { service } = setup();
    for (const header of [undefined, '', 'Basic abc', 'Bearer', 'Bearer sk_other']) {
      await expect(service.authenticate(header)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
  });

  it('rejects unknown and revoked keys with the same message', async () => {
    const { service, store } = setup();
    const revoked = store.create0(ORG, { revoked: true });
    const unknown = service.authenticate('Bearer pr_live_nope').catch((e: unknown) => e);
    const dead = service.authenticate(`Bearer ${revoked.raw}`).catch((e: unknown) => e);
    const [a, b] = await Promise.all([unknown, dead]);
    expect(a).toBeInstanceOf(AppError);
    expect((a as AppError).message).toBe((b as AppError).message);
  });

  it('resolves a valid key to its org and key id', async () => {
    const { service, store } = setup();
    const key = store.create0(ORG);
    await expect(service.authenticate(`Bearer ${key.raw}`)).resolves.toEqual({
      orgId: ORG,
      actor: `api-key:${key.id}`,
      apiKeyId: key.id,
    });
  });

  it('updates last_used_at at most once per minute', async () => {
    const { service, store, clock } = setup();
    const key = store.create0(ORG);

    await service.authenticate(`Bearer ${key.raw}`);
    clock.now += 1000;
    await service.authenticate(`Bearer ${key.raw}`);
    expect(store.touches).toHaveLength(1);

    clock.now += LAST_USED_THROTTLE_MS;
    await service.authenticate(`Bearer ${key.raw}`);
    expect(store.touches).toHaveLength(2);
    expect(store.touches[1]?.at.getTime()).toBe(clock.now);
  });
});

describe('requireApiKey middleware', () => {
  it('blocks /v1 routes without a key and admits with one', async () => {
    const { app, authHeaders } = createTestApp();

    const anon = await app.request('/v1/mailboxes');
    expect(anon.status).toBe(401);
    const body: unknown = await anon.json();
    expect(errorResponseSchema.parse(body).error.code).toBe('UNAUTHORIZED');

    const ok = await app.request('/v1/mailboxes', { headers: authHeaders(ORG) });
    expect(ok.status).toBe(200);
  });

  it('leaves the health route public', async () => {
    const { app } = createTestApp();
    expect((await app.request('/')).status).toBe(200);
  });
});

describe('/app/orgs/:orgId/api-keys', () => {
  it('lets admins create a key that is shown once, and the key then works on /v1', async () => {
    const t = createTestApp();
    const admin = t.member(ORG, 'admin');
    const res = await t.app.request(`/app/orgs/${ORG}/api-keys`, {
      method: 'POST',
      headers: t.sessionHeaders(admin),
      body: JSON.stringify({ name: 'Production' }),
    });
    expect(res.status).toBe(201);
    const created = apiKeyCreatedSchema.parse(await res.json());
    expect(created.key).toMatch(/^pr_live_/);
    expect(created.prefix).toBe(created.key.slice(0, created.prefix.length));
    expect(created.created_by?.id).toBe(admin.id);

    const list = await t.app.request(`/app/orgs/${ORG}/api-keys`, {
      headers: t.sessionHeaders(admin),
    });
    const listBody: unknown = await list.json();
    expect(apiKeyListResponseSchema.parse(listBody).data).toHaveLength(1);
    expect(JSON.stringify(listBody)).not.toContain(created.key);

    const viaKey = await t.app.request('/v1/mailboxes', {
      headers: { authorization: `Bearer ${created.key}` },
    });
    expect(viaKey.status).toBe(200);
    expect(t.audit.entries.map((e) => e.action)).toContain('api_key.created');
  });

  it('forbids members from creating or revoking, and revocation stops the key', async () => {
    const t = createTestApp();
    const member = t.member(ORG, 'member');
    const admin = t.member(ORG, 'admin');
    const forbidden = await t.app.request(`/app/orgs/${ORG}/api-keys`, {
      method: 'POST',
      headers: t.sessionHeaders(member),
      body: JSON.stringify({ name: 'x' }),
    });
    expect(forbidden.status).toBe(403);

    const created = apiKeyCreatedSchema.parse(
      await (
        await t.app.request(`/app/orgs/${ORG}/api-keys`, {
          method: 'POST',
          headers: t.sessionHeaders(admin),
          body: JSON.stringify({ name: 'x' }),
        })
      ).json(),
    );
    const memberRevoke = await t.app.request(`/app/orgs/${ORG}/api-keys/${created.id}`, {
      method: 'DELETE',
      headers: t.sessionHeaders(member),
    });
    expect(memberRevoke.status).toBe(403);
    const revoke = await t.app.request(`/app/orgs/${ORG}/api-keys/${created.id}`, {
      method: 'DELETE',
      headers: t.sessionHeaders(admin),
    });
    expect(revoke.status).toBe(204);
    const dead = await t.app.request('/v1/mailboxes', {
      headers: { authorization: `Bearer ${created.key}` },
    });
    expect(dead.status).toBe(401);
  });
});
