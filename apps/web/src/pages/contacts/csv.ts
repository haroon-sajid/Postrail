import { MAX_CONTACT_PROPERTY_CHARS } from '@postrail/shared/browser';

export interface CsvContact {
  email: string;
  properties: Record<string, string>;
}

export interface CsvResult {
  contacts: CsvContact[];
  /** Property names found in the header, in order. */
  columns: string[];
  /** Rows that could not be used, by 1-based line, with the reason. */
  skipped: { line: number; reason: string }[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Splits CSV text into rows of fields. Handles quoted fields, doubled quotes inside them,
 * commas and line breaks inside quotes, and both kinds of line ending.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** "First Name" -> "first_name": what a template placeholder can refer to. */
export function toPropertyName(header: string): string {
  const name = header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[0-9]/.test(name) ? `_${name}` : name;
}

/**
 * Turns a spreadsheet export into contacts. The column named "email" is the address and
 * every other column becomes a property. A file with no header row is read as a plain
 * list of addresses in its first column.
 */
export function contactsFromCsv(text: string): CsvResult {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ''));
  const header = rows[0]?.map(toPropertyName) ?? [];
  const emailColumn = header.findIndex((h) => ['email', 'e_mail', 'email_address'].includes(h));
  const hasHeader = emailColumn >= 0;
  const columns = hasHeader ? header.filter((h, i) => i !== emailColumn && h !== '') : [];

  const result: CsvResult = { contacts: [], columns, skipped: [] };
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (hasHeader && index === 0) continue;
    const line = index + 1;
    const email = (row[hasHeader ? emailColumn : 0] ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) {
      result.skipped.push({ line, reason: email ? `"${email}" is not an email` : 'no email' });
      continue;
    }
    if (seen.has(email)) {
      result.skipped.push({ line, reason: `${email} appears more than once` });
      continue;
    }
    seen.add(email);
    const properties: Record<string, string> = {};
    if (hasHeader) {
      for (const [i, name] of header.entries()) {
        const value = (row[i] ?? '').trim();
        if (i === emailColumn || name === '' || value === '') continue;
        properties[name] = value.slice(0, MAX_CONTACT_PROPERTY_CHARS);
      }
    }
    result.contacts.push({ email, properties });
  }
  return result;
}

/** `items` in runs of at most `size`, for an API that takes a bounded batch. */
export function inBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}
