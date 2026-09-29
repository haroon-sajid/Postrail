import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './timestamps';

/**
 * The tenant. Every other table points here through `org_id`, which is why this is the
 * only table allowed to lack that column (see schema.test.ts).
 */
export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ...timestamps,
});
