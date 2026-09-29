import { is } from 'drizzle-orm';
import { getTableConfig, PgTable, pgTable, uuid } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from './schema';

/** Tables that are not tenant-owned and therefore carry no org_id or policy. */
const NON_TENANT_TABLES = new Set(['orgs', 'users']);

const exported: unknown[] = Object.values(schema);
const tables = exported.filter((value): value is PgTable => is(value, PgTable));
const tenantTables = tables.filter((t) => !NON_TENANT_TABLES.has(getTableConfig(t).name));

function columnNames(table: PgTable): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

/** First column of every index and primary key, which is what makes an org lookup cheap. */
function leadingIndexColumns(table: PgTable): string[] {
  const config = getTableConfig(table);
  const heads: string[] = [];
  for (const pk of config.primaryKeys) {
    const first = pk.columns[0];
    if (first) heads.push(first.name);
  }
  for (const index of config.indexes) {
    // IndexBuilder marks `config` internal; there is no public accessor for its columns.
    const { columns } = (index as unknown as { config: { columns: unknown[] } }).config;
    const first = columns[0];
    if (first && typeof first === 'object' && 'name' in first && typeof first.name === 'string') {
      heads.push(first.name);
    }
  }
  return heads;
}

describe('schema tenancy guard', () => {
  it('exports the expected tables', () => {
    expect(tables.map((t) => getTableConfig(t).name).sort()).toEqual([
      'api_keys',
      'audit_log',
      'mailboxes',
      'members',
      'message_bodies',
      'messages',
      'orgs',
      'suppressions',
      'templates',
      'users',
      'webhook_deliveries',
      'webhook_endpoints',
    ]);
  });

  describe.each(tenantTables.map((t) => [getTableConfig(t).name, t] as const))(
    'tenant table %s',
    (name, table) => {
      it('has org_id', () => {
        expect(columnNames(table)).toContain('org_id');
      });

      it('has an index or primary key led by org_id', () => {
        expect(leadingIndexColumns(table)).toContain('org_id');
      });

      it('has RLS enabled with a tenant isolation policy', () => {
        const config = getTableConfig(table);
        expect(config.enableRLS).toBe(true);
        expect(config.policies.map((p) => p.name)).toContain(`${name}_tenant_isolation`);
      });
    },
  );

  it('orgScoped adds a non-null org_id column when spread into a table', () => {
    const probe = pgTable('probe', { id: uuid('id').primaryKey(), ...schema.orgScoped });
    const orgId = getTableConfig(probe).columns.find((c) => c.name === 'org_id');
    expect(orgId?.notNull).toBe(true);
  });
});
