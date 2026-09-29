import { index, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { memberRole } from './enums';
import { orgScoped, tenantPolicy } from './tenancy';
import { timestamps } from './timestamps';
import { users } from './users';

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull().default('member'),
    ...timestamps,
  },
  (t) => [
    index('members_org_id_idx').on(t.orgId),
    unique('members_org_user_uq').on(t.orgId, t.userId),
    tenantPolicy('members'),
  ],
).enableRLS();
