import { loadDotenv } from '@postrail/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import journal from '../drizzle/meta/_journal.json';
import { closeDb, createDb, type Db } from './client';
import { pendingAfter, pendingMigrations } from './migrations';

const entries = [
  { tag: '0000_first', when: 100 },
  { tag: '0001_second', when: 200 },
  { tag: '0002_third', when: 300 },
];

describe('pendingAfter', () => {
  it('lists everything for a database that was never migrated', () => {
    expect(pendingAfter(entries, null)).toEqual(['0000_first', '0001_second', '0002_third']);
  });

  it('lists only what is newer than the last applied migration', () => {
    expect(pendingAfter(entries, 100)).toEqual(['0001_second', '0002_third']);
    expect(pendingAfter(entries, 300)).toEqual([]);
  });

  it('is not confused by a database that is ahead of the code', () => {
    expect(pendingAfter(entries, 999)).toEqual([]);
  });
});

describe('migration journal', () => {
  it('lists migrations oldest first, which is what the pending check relies on', () => {
    const times = journal.entries.map((e) => e.when);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
  });
});

loadDotenv();
const databaseUrl = process.env.DATABASE_URL;

// Integration: the database every other test and `pnpm dev` talk to. Skipped without one.
describe.runIf(databaseUrl)('the configured database', { timeout: 20_000 }, () => {
  let db: Db;
  beforeAll(() => {
    db = createDb(databaseUrl ?? '');
  });
  afterAll(() => closeDb(db));

  it('has every migration in this checkout applied (if not: pnpm db:migrate)', async () => {
    expect(await pendingMigrations(db)).toEqual([]);
  });
});
