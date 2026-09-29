import { timestamp } from 'drizzle-orm/pg-core';

/** Spread into every table so audit columns are named and typed the same everywhere. */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
