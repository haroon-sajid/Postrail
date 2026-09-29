import { index, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { orgScoped, tenantPolicy } from './tenancy';
import { timestamps } from './timestamps';

export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    slug: text('slug').notNull(),
    subject: text('subject').notNull(),
    html: text('html').notNull(),
    /** Names of the placeholders the template expects, so sends can be validated up front. */
    variables: jsonb('variables').$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    index('templates_org_id_idx').on(t.orgId),
    unique('templates_org_slug_uq').on(t.orgId, t.slug),
    tenantPolicy('templates'),
  ],
).enableRLS();
