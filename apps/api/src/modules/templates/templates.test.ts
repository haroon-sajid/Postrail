import {
  errorResponseSchema,
  sendEmailResponseSchema,
  templateListResponseSchema,
  templateSchema,
} from '@postrail/shared';
import { describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../../test/app';
import { fakeGoogleClient } from '../../test/fakes';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function setup() {
  const sendRaw = vi.fn((_t: string, _r: string) => Promise.resolve({ id: 'gmail-1' }));
  const t = createTestApp({ google: fakeGoogleClient({ sendRaw }) });
  const headers = t.authHeaders(ORG);
  const call = (method: string, path: string, body?: unknown) =>
    t.app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { ...t, headers, call, sendRaw };
}

const welcome = {
  slug: 'welcome',
  subject: 'Hi {{ name }}',
  html: '<p>{{name}}, code {{code}}</p>',
};

describe('/v1/templates', () => {
  it('creates a template and derives its variables', async () => {
    const t = setup();
    const res = await t.call('POST', '/v1/templates', welcome);
    expect(res.status).toBe(201);
    const template = templateSchema.parse(await res.json());
    expect(template).toMatchObject({ slug: 'welcome', variables: ['name', 'code'] });

    const list = await t.call('GET', '/v1/templates');
    expect(templateListResponseSchema.parse(await list.json()).data).toHaveLength(1);
    const one = await t.call('GET', `/v1/templates/${template.id}`);
    expect(templateSchema.parse(await one.json()).id).toBe(template.id);
  });

  it('rejects a duplicate slug within the org with CONFLICT', async () => {
    const t = setup();
    await t.call('POST', '/v1/templates', welcome);
    const dup = await t.call('POST', '/v1/templates', welcome);
    expect(dup.status).toBe(409);
    expect(errorResponseSchema.parse(await dup.json()).error.code).toBe('CONFLICT');

    const other = await t.app.request('/v1/templates', {
      method: 'POST',
      headers: t.authHeaders(ORG_B),
      body: JSON.stringify(welcome),
    });
    expect(other.status).toBe(201);
  });

  it('validates slug and body', async () => {
    const t = setup();
    expect((await t.call('POST', '/v1/templates', { ...welcome, slug: 'Bad Slug' })).status).toBe(
      400,
    );
    expect((await t.call('POST', '/v1/templates', { slug: 'x' })).status).toBe(400);
  });

  it('updates and re-derives variables, deletes, and 404s across orgs', async () => {
    const t = setup();
    const { id } = templateSchema.parse(
      await (await t.call('POST', '/v1/templates', welcome)).json(),
    );
    const patched = await t.call('PATCH', `/v1/templates/${id}`, { html: '<p>{{name}} only</p>' });
    expect(templateSchema.parse(await patched.json())).toMatchObject({
      subject: 'Hi {{ name }}',
      variables: ['name'],
    });

    const foreign = await t.app.request(`/v1/templates/${id}`, { headers: t.authHeaders(ORG_B) });
    expect(foreign.status).toBe(404);
    expect((await t.call('DELETE', `/v1/templates/${id}`)).status).toBe(204);
    expect((await t.call('GET', `/v1/templates/${id}`)).status).toBe(404);
  });

  it('is used by POST /v1/emails with variables, safely rendered', async () => {
    const t = setup();
    t.store.add(ORG);
    await t.call('POST', '/v1/templates', welcome);

    const res = await t.call('POST', '/v1/emails', {
      to: 'dest@example.org',
      template: 'welcome',
      variables: { name: '<b>Ada</b>', code: '{{constructor}}' },
    });
    expect(res.status).toBe(201);
    const { id } = sendEmailResponseSchema.parse(await res.json());
    expect(t.emailStore.rows[0]?.subject).toBe('Hi <b>Ada</b>');
    expect(t.emailStore.bodies.get(id)?.html).toBe(
      '<p>&#60;b&#62;Ada&#60;/b&#62;, code {{constructor}}</p>',
    );

    const missing = await t.call('POST', '/v1/emails', {
      to: 'dest@example.org',
      template: 'welcome',
      variables: { name: 'x' },
    });
    expect(missing.status).toBe(400);
    expect(errorResponseSchema.parse(await missing.json()).error.message).toContain('code');
  });
});
