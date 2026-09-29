import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './timestamps';

/**
 * Placeholder until Better Auth lands and owns this table. Not tenant-scoped: a user can
 * belong to several orgs through `members`.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  ...timestamps,
});
