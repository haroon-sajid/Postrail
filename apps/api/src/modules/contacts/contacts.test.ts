import {
  contactListSchema,
  contactListsResponseSchema,
  contactSchema,
  contactsResponseSchema,
  errorResponseSchema,
} from '@postrail/shared';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/app';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function setup() {
  const t = createTestApp();
  const headers = t.authHeaders(ORG);
  const call = (method: string, path: string, body?: unknown, as = headers) =>
    t.app.request(path, {
      method,
      headers: as,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const list = async (name: string, as = headers) =>
    contactListSchema.parse(await (await call('POST', '/v1/contact-lists', { name }, as)).json());
  const contact = async (body: unknown) =>
    contactSchema.parse(await (await call('POST', '/v1/contacts', body)).json());
  const page = async (query = '', as = headers) =>
    contactsResponseSchema.parse(
      await (await call('GET', `/v1/contacts${query}`, undefined, as)).json(),
    );
  return { ...t, headers, call, list, contact, page };
}

async function errorOf(res: Response) {
  return errorResponseSchema.parse(await res.json()).error;
}

describe('/v1/contacts', () => {
  it('creates a contact with a lowercased address, properties and lists', async () => {
    const t = setup();
    const news = await t.list('Newsletter');
    const res = await t.call('POST', '/v1/contacts', {
      email: 'Ada@Example.com',
      properties: { first_name: 'Ada' },
      list_ids: [news.id],
    });
    expect(res.status).toBe(201);
    expect(contactSchema.parse(await res.json())).toMatchObject({
      email: 'ada@example.com',
      properties: { first_name: 'Ada' },
      list_ids: [news.id],
      suppressed: false,
    });
  });

  it('updates the contact that already has the address instead of duplicating it', async () => {
    const t = setup();
    const news = await t.list('Newsletter');
    const beta = await t.list('Beta');
    const first = await t.contact({
      email: 'ada@example.com',
      properties: { first_name: 'Ada', plan: 'free' },
      list_ids: [news.id],
    });

    const res = await t.call('POST', '/v1/contacts', {
      email: 'ADA@example.com',
      properties: { plan: 'pro' },
      list_ids: [beta.id],
    });
    // 200, not 201: nothing new was made. Properties merge and lists add up.
    expect(res.status).toBe(200);
    const merged = contactSchema.parse(await res.json());
    expect(merged.id).toBe(first.id);
    expect(merged.properties).toEqual({ first_name: 'Ada', plan: 'pro' });
    expect(merged.list_ids.sort()).toEqual([news.id, beta.id].sort());
    expect(t.contactStore.rows).toHaveLength(1);
  });

  it('replaces properties and lists on PATCH', async () => {
    const t = setup();
    const news = await t.list('Newsletter');
    const beta = await t.list('Beta');
    const ada = await t.contact({
      email: 'ada@example.com',
      properties: { first_name: 'Ada', plan: 'free' },
      list_ids: [news.id],
    });

    const res = await t.call('PATCH', `/v1/contacts/${ada.id}`, {
      properties: { first_name: 'Augusta' },
      list_ids: [beta.id],
    });
    expect(contactSchema.parse(await res.json())).toMatchObject({
      properties: { first_name: 'Augusta' },
      list_ids: [beta.id],
    });
    const cleared = await t.call('PATCH', `/v1/contacts/${ada.id}`, { list_ids: [] });
    expect(contactSchema.parse(await cleared.json()).list_ids).toEqual([]);
    expect((await t.call('PATCH', `/v1/contacts/${ada.id}`, {})).status).toBe(400);
  });

  it('rejects property names a template could not use, and unknown lists', async () => {
    const t = setup();
    const badName = await t.call('POST', '/v1/contacts', {
      email: 'ada@example.com',
      properties: { 'first name': 'Ada' },
    });
    expect(badName.status).toBe(400);

    const stray = await t.call('POST', '/v1/contacts', {
      email: 'ada@example.com',
      list_ids: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
    });
    expect(stray.status).toBe(400);
    expect((await errorOf(stray)).message).toMatch(/does not exist/);
    expect(t.contactStore.rows).toHaveLength(0);
  });

  it('lists newest first with a cursor, searches, and filters by list', async () => {
    const t = setup();
    const news = await t.list('Newsletter');
    for (const email of ['a@example.com', 'b@example.com', 'c@example.org']) {
      await t.contact({ email, ...(email.startsWith('b') ? { list_ids: [news.id] } : {}) });
    }

    const first = await t.page('?limit=2');
    expect(first.data.map((c) => c.email)).toEqual(['c@example.org', 'b@example.com']);
    const second = await t.page(`?limit=2&cursor=${first.next_cursor}`);
    expect(second.data.map((c) => c.email)).toEqual(['a@example.com']);
    expect(second.next_cursor).toBeNull();

    expect((await t.page('?q=EXAMPLE.org')).data.map((c) => c.email)).toEqual(['c@example.org']);
    expect((await t.page(`?list_id=${news.id}`)).data.map((c) => c.email)).toEqual([
      'b@example.com',
    ]);
  });

  it('shows a contact as suppressed while its address is on the suppression list', async () => {
    const t = setup();
    const ada = await t.contact({ email: 'ada@example.com' });
    await t.call('POST', '/v1/suppressions', { email: 'ADA@example.com', reason: 'unsubscribe' });
    const got = await t.call('GET', `/v1/contacts/${ada.id}`);
    expect(contactSchema.parse(await got.json()).suppressed).toBe(true);

    await t.call('DELETE', '/v1/suppressions/ada@example.com');
    expect((await t.page()).data[0]?.suppressed).toBe(false);
  });

  it('keeps contacts apart per org', async () => {
    const t = setup();
    const ada = await t.contact({ email: 'ada@example.com' });
    const other = t.authHeaders(ORG_B);
    expect((await t.page('', other)).data).toEqual([]);
    expect((await t.call('GET', `/v1/contacts/${ada.id}`, undefined, other)).status).toBe(404);
    expect((await t.call('DELETE', `/v1/contacts/${ada.id}`, undefined, other)).status).toBe(404);
    expect((await t.call('DELETE', `/v1/contacts/${ada.id}`)).status).toBe(204);
    expect((await t.call('GET', `/v1/contacts/${ada.id}`)).status).toBe(404);
  });

  it('is available to dashboard members and needs credentials', async () => {
    const t = setup();
    const member = t.sessionHeaders(t.member(ORG, 'member'));
    const res = await t.call(
      'POST',
      `/app/orgs/${ORG}/contacts`,
      { email: 'ada@example.com' },
      member,
    );
    expect(res.status).toBe(201);
    expect((await t.call('GET', '/v1/contacts', undefined, {})).status).toBe(401);
  });
});

describe('POST /v1/contacts/import', () => {
  it('adds new contacts, updates existing ones and puts them all on a list', async () => {
    const t = setup();
    const news = await t.list('Newsletter');
    await t.contact({ email: 'ada@example.com', properties: { plan: 'free' } });

    const res = await t.call('POST', '/v1/contacts/import', {
      contacts: [
        { email: 'Ada@Example.com', properties: { first_name: 'Ada' } },
        { email: 'grace@example.com', properties: { first_name: 'Grace' } },
        // The same address twice in one file: the rows merge, the later value wins.
        { email: 'GRACE@example.com', properties: { first_name: 'Grace H' } },
      ],
      list_id: news.id,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: 1, updated: 1 });

    const all = await t.page(`?list_id=${news.id}`);
    expect(all.data).toHaveLength(2);
    const byEmail = Object.fromEntries(all.data.map((c) => [c.email, c.properties]));
    expect(byEmail['ada@example.com']).toEqual({ plan: 'free', first_name: 'Ada' });
    expect(byEmail['grace@example.com']).toEqual({ first_name: 'Grace H' });
  });

  it('refuses a list that is not this org’s, an empty file and a bad address', async () => {
    const t = setup();
    const foreign = await t.list('Theirs', t.authHeaders(ORG_B));
    const row = { email: 'ada@example.com' };
    const stray = await t.call('POST', '/v1/contacts/import', {
      contacts: [row],
      list_id: foreign.id,
    });
    expect(stray.status).toBe(404);
    expect((await t.call('POST', '/v1/contacts/import', { contacts: [] })).status).toBe(400);
    const bad = await t.call('POST', '/v1/contacts/import', { contacts: [{ email: 'nope' }] });
    expect(bad.status).toBe(400);
    expect(t.contactStore.rows).toHaveLength(0);
  });
});

describe('/v1/contact-lists', () => {
  it('creates, counts, renames and deletes lists without touching the contacts', async () => {
    const t = setup();
    const news = await t.list('Newsletter');
    expect(news.contact_count).toBe(0);
    await t.contact({ email: 'ada@example.com', list_ids: [news.id] });

    const lists = contactListsResponseSchema.parse(
      await (await t.call('GET', '/v1/contact-lists')).json(),
    );
    expect(lists.data).toEqual([expect.objectContaining({ name: 'Newsletter', contact_count: 1 })]);

    const renamed = await t.call('PATCH', `/v1/contact-lists/${news.id}`, { name: 'Weekly' });
    expect(contactListSchema.parse(await renamed.json())).toMatchObject({
      name: 'Weekly',
      contact_count: 1,
    });

    expect((await t.call('DELETE', `/v1/contact-lists/${news.id}`)).status).toBe(204);
    expect((await t.call('DELETE', `/v1/contact-lists/${news.id}`)).status).toBe(404);
    // The people are still there, just on no list.
    expect((await t.page()).data).toEqual([expect.objectContaining({ list_ids: [] })]);
  });

  it('answers CONFLICT for a name that is taken, per org', async () => {
    const t = setup();
    const news = await t.list('Newsletter');
    const beta = await t.list('Beta');
    const dup = await t.call('POST', '/v1/contact-lists', { name: 'Newsletter' });
    expect(dup.status).toBe(409);
    expect((await errorOf(dup)).code).toBe('CONFLICT');
    expect(
      (await t.call('PATCH', `/v1/contact-lists/${beta.id}`, { name: 'Newsletter' })).status,
    ).toBe(409);
    // Renaming a list to its own name is not a conflict.
    expect(
      (await t.call('PATCH', `/v1/contact-lists/${news.id}`, { name: 'Newsletter' })).status,
    ).toBe(200);
    // Another org may use the same name.
    expect((await t.list('Newsletter', t.authHeaders(ORG_B))).name).toBe('Newsletter');
  });

  it('adds and removes members, ignoring ids that belong to another org', async () => {
    const t = setup();
    const news = await t.list('Newsletter');
    const ada = await t.contact({ email: 'ada@example.com' });
    const grace = await t.contact({ email: 'grace@example.com' });
    const theirs = contactSchema.parse(
      await (
        await t.call('POST', '/v1/contacts', { email: 'x@example.com' }, t.authHeaders(ORG_B))
      ).json(),
    );

    const add = (ids: string[]) =>
      t.call('POST', `/v1/contact-lists/${news.id}/contacts`, { contact_ids: ids });
    expect(await (await add([ada.id, grace.id, theirs.id])).json()).toEqual({ added: 2 });
    // Already on it: nothing new.
    expect(await (await add([ada.id])).json()).toEqual({ added: 0 });
    expect(t.contactStore.members.some((m) => m.contactId === theirs.id)).toBe(false);

    const remove = () => t.call('DELETE', `/v1/contact-lists/${news.id}/contacts/${ada.id}`);
    expect((await remove()).status).toBe(204);
    expect((await remove()).status).toBe(404);
    expect((await t.page(`?list_id=${news.id}`)).data.map((c) => c.email)).toEqual([
      'grace@example.com',
    ]);

    const foreignList = await t.call(
      'POST',
      `/v1/contact-lists/${news.id}/contacts`,
      { contact_ids: [theirs.id] },
      t.authHeaders(ORG_B),
    );
    expect(foreignList.status).toBe(404);
  });
});
