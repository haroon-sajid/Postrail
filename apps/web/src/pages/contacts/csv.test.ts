import { describe, expect, it } from 'vitest';
import { contactsFromCsv, inBatches, parseCsv, toPropertyName } from './csv';

describe('parseCsv', () => {
  it('reads quoted fields with commas, quotes and line breaks inside them', () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nd,e,,\n')).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['d', 'e', '', ''],
    ]);
  });

  it('keeps a last line that has no line ending', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('toPropertyName', () => {
  it.each([
    ['First Name', 'first_name'],
    ['  Plan ', 'plan'],
    ['E-mail', 'e_mail'],
    ['2nd line', '_2nd_line'],
    ['City (HQ)', 'city_hq'],
  ])('turns "%s" into %s', (header, name) => {
    expect(toPropertyName(header)).toBe(name);
  });
});

describe('contactsFromCsv', () => {
  it('uses the email column for the address and the others as properties', () => {
    const result = contactsFromCsv(
      'First Name,Email,Plan\nAda,Ada@Example.com,pro\nGrace,grace@example.com,\n',
    );
    expect(result.columns).toEqual(['first_name', 'plan']);
    expect(result.contacts).toEqual([
      { email: 'ada@example.com', properties: { first_name: 'Ada', plan: 'pro' } },
      // An empty cell is left out rather than stored as an empty property.
      { email: 'grace@example.com', properties: { first_name: 'Grace' } },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('reads a file with no header as a list of addresses', () => {
    const result = contactsFromCsv('ada@example.com\ngrace@example.com\n');
    expect(result.contacts.map((c) => c.email)).toEqual(['ada@example.com', 'grace@example.com']);
    expect(result.columns).toEqual([]);
  });

  it('skips bad and repeated addresses and says which lines', () => {
    const result = contactsFromCsv(
      'email,name\nada@example.com,Ada\nnot-an-email,X\n,Y\nADA@example.com,Again\n',
    );
    expect(result.contacts).toHaveLength(1);
    expect(result.skipped).toEqual([
      { line: 3, reason: '"not-an-email" is not an email' },
      { line: 4, reason: 'no email' },
      { line: 5, reason: 'ada@example.com appears more than once' },
    ]);
  });

  it('ignores blank lines and returns nothing for an empty file', () => {
    expect(contactsFromCsv('email\n\nada@example.com\n\n').contacts).toHaveLength(1);
    expect(contactsFromCsv('')).toEqual({ contacts: [], columns: [], skipped: [] });
  });
});

describe('inBatches', () => {
  it('splits into runs of at most the given size', () => {
    expect(inBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(inBatches([], 2)).toEqual([]);
  });
});
