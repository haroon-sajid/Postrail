import { createRoute } from '@hono/zod-openapi';
import { getAuth } from '../../lib/context';
import { ERROR_RESPONSES, jsonBody, jsonContent, type RouteBase } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import {
  addListContactsRequestSchema,
  addListContactsResponseSchema,
  contactListRequestSchema,
  contactListSchema,
  contactListsResponseSchema,
  contactSchema,
  contactsQuerySchema,
  contactsResponseSchema,
  createContactRequestSchema,
  idParamSchema,
  importContactsRequestSchema,
  importContactsResponseSchema,
  listContactParamSchema,
  updateContactRequestSchema,
} from './schemas';
import { type ContactService } from './service';

export function contactRoutes(service: ContactService, base: RouteBase) {
  const tags = [`Contacts${base.tagSuffix}`];
  const security = base.security;
  const path = (p: string) => `${base.prefix}${p}`;

  const listRoute = createRoute({
    method: 'get',
    path: path('/contacts'),
    tags,
    summary: 'List contacts',
    description: 'Newest first. Pass next_cursor from the previous page to continue.',
    security,
    request: { params: base.params(), query: contactsQuerySchema },
    responses: {
      200: jsonContent(contactsResponseSchema, 'A page of contacts'),
      ...ERROR_RESPONSES,
    },
  });

  const upsertRoute = createRoute({
    method: 'post',
    path: path('/contacts'),
    tags,
    summary: 'Add a contact, or update the one with that address',
    description:
      'An existing contact keeps its other properties and lists: the properties given are merged in and the lists given are added.',
    security,
    request: {
      params: base.params(),
      body: jsonBody(createContactRequestSchema, 'The contact'),
    },
    responses: {
      201: jsonContent(contactSchema, 'Contact created'),
      200: jsonContent(contactSchema, 'An existing contact was updated'),
      ...ERROR_RESPONSES,
    },
  });

  const importRoute = createRoute({
    method: 'post',
    path: path('/contacts/import'),
    tags,
    summary: 'Add or update up to 1000 contacts',
    security,
    request: {
      params: base.params(),
      body: jsonBody(importContactsRequestSchema, 'Contacts, and optionally a list to put them on'),
    },
    responses: {
      200: jsonContent(importContactsResponseSchema, 'How many were new and how many updated'),
      ...ERROR_RESPONSES,
    },
  });

  const getRoute = createRoute({
    method: 'get',
    path: path('/contacts/{id}'),
    tags,
    summary: 'Get one contact',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 200: jsonContent(contactSchema, 'The contact'), ...ERROR_RESPONSES },
  });

  const updateRoute = createRoute({
    method: 'patch',
    path: path('/contacts/{id}'),
    tags,
    summary: 'Replace a contact’s properties or lists',
    security,
    request: {
      params: base.params(idParamSchema),
      body: jsonBody(updateContactRequestSchema, 'Fields to replace'),
    },
    responses: { 200: jsonContent(contactSchema, 'The updated contact'), ...ERROR_RESPONSES },
  });

  const deleteRoute = createRoute({
    method: 'delete',
    path: path('/contacts/{id}'),
    tags,
    summary: 'Delete a contact',
    description: 'Messages already sent to the address keep their history in Logs.',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 204: { description: 'Contact deleted' }, ...ERROR_RESPONSES },
  });

  const listListsRoute = createRoute({
    method: 'get',
    path: path('/contact-lists'),
    tags,
    summary: 'List contact lists with their sizes',
    security,
    request: { params: base.params() },
    responses: { 200: jsonContent(contactListsResponseSchema, 'The lists'), ...ERROR_RESPONSES },
  });

  const createListRoute = createRoute({
    method: 'post',
    path: path('/contact-lists'),
    tags,
    summary: 'Create a contact list',
    security,
    request: { params: base.params(), body: jsonBody(contactListRequestSchema, 'A name') },
    responses: { 201: jsonContent(contactListSchema, 'List created'), ...ERROR_RESPONSES },
  });

  const renameListRoute = createRoute({
    method: 'patch',
    path: path('/contact-lists/{id}'),
    tags,
    summary: 'Rename a contact list',
    security,
    request: {
      params: base.params(idParamSchema),
      body: jsonBody(contactListRequestSchema, 'The new name'),
    },
    responses: { 200: jsonContent(contactListSchema, 'The renamed list'), ...ERROR_RESPONSES },
  });

  const deleteListRoute = createRoute({
    method: 'delete',
    path: path('/contact-lists/{id}'),
    tags,
    summary: 'Delete a contact list',
    description: 'The contacts on it are kept.',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 204: { description: 'List deleted' }, ...ERROR_RESPONSES },
  });

  const addToListRoute = createRoute({
    method: 'post',
    path: path('/contact-lists/{id}/contacts'),
    tags,
    summary: 'Put contacts on a list',
    security,
    request: {
      params: base.params(idParamSchema),
      body: jsonBody(addListContactsRequestSchema, 'Contact ids'),
    },
    responses: {
      200: jsonContent(addListContactsResponseSchema, 'How many were not on it before'),
      ...ERROR_RESPONSES,
    },
  });

  const removeFromListRoute = createRoute({
    method: 'delete',
    path: path('/contact-lists/{id}/contacts/{contactId}'),
    tags,
    summary: 'Take a contact off a list',
    security,
    request: { params: base.params(listContactParamSchema) },
    responses: { 204: { description: 'Removed from the list' }, ...ERROR_RESPONSES },
  });

  return createRouter()
    .openapi(listRoute, async (c) => {
      const { data, nextCursor } = await service.list(getAuth(c), c.req.valid('query'));
      return c.json({ data, next_cursor: nextCursor }, 200);
    })
    .openapi(upsertRoute, async (c) => {
      const { contact, created } = await service.upsert(getAuth(c), c.req.valid('json'));
      return c.json(contact, created ? 201 : 200);
    })
    .openapi(importRoute, async (c) =>
      c.json(await service.importMany(getAuth(c), c.req.valid('json')), 200),
    )
    .openapi(getRoute, async (c) =>
      c.json(await service.get(getAuth(c), c.req.valid('param').id), 200),
    )
    .openapi(updateRoute, async (c) =>
      c.json(await service.update(getAuth(c), c.req.valid('param').id, c.req.valid('json')), 200),
    )
    .openapi(deleteRoute, async (c) => {
      await service.remove(getAuth(c), c.req.valid('param').id);
      return c.body(null, 204);
    })
    .openapi(listListsRoute, async (c) =>
      c.json({ data: await service.listLists(getAuth(c)) }, 200),
    )
    .openapi(createListRoute, async (c) =>
      c.json(await service.createList(getAuth(c), c.req.valid('json').name), 201),
    )
    .openapi(renameListRoute, async (c) =>
      c.json(
        await service.renameList(getAuth(c), c.req.valid('param').id, c.req.valid('json').name),
        200,
      ),
    )
    .openapi(deleteListRoute, async (c) => {
      await service.removeList(getAuth(c), c.req.valid('param').id);
      return c.body(null, 204);
    })
    .openapi(addToListRoute, async (c) => {
      const added = await service.addToList(
        getAuth(c),
        c.req.valid('param').id,
        c.req.valid('json').contact_ids,
      );
      return c.json({ added }, 200);
    })
    .openapi(removeFromListRoute, async (c) => {
      const { id, contactId } = c.req.valid('param');
      await service.removeFromList(getAuth(c), id, contactId);
      return c.body(null, 204);
    });
}
