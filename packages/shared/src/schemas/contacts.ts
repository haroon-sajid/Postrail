import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  MAX_CONTACT_IMPORT,
  MAX_CONTACT_PROPERTIES,
  MAX_CONTACT_PROPERTY_CHARS,
  MAX_PAGE_SIZE,
} from '../constants';
import { uuidSchema } from './common';

/**
 * What a broadcast can put into a template for this contact. Names follow the same rule
 * as template placeholders, so `{{first_name}}` finds the property `first_name`.
 */
export const contactPropertiesSchema = z
  .record(
    z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'property names are identifiers'),
    z.string().max(MAX_CONTACT_PROPERTY_CHARS),
  )
  .refine((p) => Object.keys(p).length <= MAX_CONTACT_PROPERTIES, {
    message: `at most ${MAX_CONTACT_PROPERTIES} properties`,
  });
export type ContactProperties = z.infer<typeof contactPropertiesSchema>;

const listIdsSchema = z.array(uuidSchema).max(50);

/** Public shape of a contact (snake_case on the wire). */
export const contactSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  properties: z.record(z.string(), z.string()),
  list_ids: z.array(uuidSchema),
  /** On the suppression list, so sends and broadcasts skip this address. */
  suppressed: z.boolean(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export type Contact = z.infer<typeof contactSchema>;

/** Adds a contact, or updates the one with that address: properties merge, lists are added. */
export const createContactRequestSchema = z.object({
  email: z.email(),
  properties: contactPropertiesSchema.optional(),
  list_ids: listIdsSchema.optional(),
});
export type CreateContactRequest = z.infer<typeof createContactRequestSchema>;

/** Each field given replaces what is stored: all properties, or all list memberships. */
export const updateContactRequestSchema = z
  .object({
    properties: contactPropertiesSchema.optional(),
    list_ids: listIdsSchema.optional(),
  })
  .refine((p) => p.properties !== undefined || p.list_ids !== undefined, {
    message: 'nothing to update',
  });
export type UpdateContactRequest = z.infer<typeof updateContactRequestSchema>;

export const contactsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
  /** Case-insensitive substring match on the email. */
  q: z.string().trim().min(1).max(200).optional(),
  /** Only contacts on this list. */
  list_id: uuidSchema.optional(),
});
export type ContactsQuery = z.infer<typeof contactsQuerySchema>;

export const contactsResponseSchema = z.object({
  data: z.array(contactSchema),
  next_cursor: z.string().nullable(),
});

export const importContactsRequestSchema = z.object({
  contacts: z
    .array(z.object({ email: z.email(), properties: contactPropertiesSchema.optional() }))
    .min(1)
    .max(MAX_CONTACT_IMPORT),
  /** Put every imported contact on this list as well. */
  list_id: uuidSchema.optional(),
});
export type ImportContactsRequest = z.infer<typeof importContactsRequestSchema>;

export const importContactsResponseSchema = z.object({
  created: z.number().int(),
  updated: z.number().int(),
});
export type ImportContactsResponse = z.infer<typeof importContactsResponseSchema>;

export const contactListNameSchema = z.string().trim().min(1).max(80);

/** A named group of contacts: what a broadcast is sent to. */
export const contactListSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  contact_count: z.number().int(),
  created_at: z.iso.datetime(),
});
export type ContactList = z.infer<typeof contactListSchema>;

export const contactListsResponseSchema = z.object({ data: z.array(contactListSchema) });

export const contactListRequestSchema = z.object({ name: contactListNameSchema });
export type ContactListRequest = z.infer<typeof contactListRequestSchema>;

export const addListContactsRequestSchema = z.object({
  contact_ids: z.array(uuidSchema).min(1).max(MAX_CONTACT_IMPORT),
});

export const addListContactsResponseSchema = z.object({ added: z.number().int() });

export const listContactParamSchema = z.object({ id: uuidSchema, contactId: uuidSchema });

/** What a signed unsubscribe link carries. */
export const unsubscribeTokenSchema = z.object({ orgId: uuidSchema, email: z.email() });
