import { describe, expect, it } from 'vitest';
import { describePendingMigrations } from './schema-check';

describe('describePendingMigrations', () => {
  it('has nothing to say when the database is up to date', () => {
    expect(describePendingMigrations([])).toBeUndefined();
  });

  it('names each missing migration and the command that applies them', () => {
    const message = describePendingMigrations(['0012_contacts', '0013_force_rls']) ?? '';
    expect(message).toContain('2 migrations have not been applied');
    expect(message).toContain('  - 0012_contacts\n  - 0013_force_rls');
    expect(message).toContain('pnpm db:migrate');
  });

  it('gets the grammar right for one', () => {
    expect(describePendingMigrations(['0012_contacts'])).toContain('1 migration has not been');
  });
});
