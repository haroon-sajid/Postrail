import { describe, expect, it } from 'vitest';
import { buildMimeMessage, buildRawMessage } from './mime';

const base = { from: 'a@example.com', to: 'b@example.com', subject: 'Plain subject' };

describe('buildMimeMessage', () => {
  it('builds a single-part text message with base64 body', () => {
    const mime = buildMimeMessage({ ...base, text: 'hello world' });
    const [head, body] = mime.split('\r\n\r\n');
    expect(head).toBe(
      [
        'From: a@example.com',
        'To: b@example.com',
        'Subject: Plain subject',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
      ].join('\r\n'),
    );
    expect(Buffer.from((body ?? '').trim(), 'base64').toString('utf8')).toBe('hello world');
  });

  it('prefers html when only html is given and adds Reply-To when set', () => {
    const mime = buildMimeMessage({ ...base, html: '<p>x</p>', replyTo: 'r@example.com' });
    expect(mime).toContain('Reply-To: r@example.com\r\n');
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(mime).not.toContain('multipart');
  });

  it('wraps long base64 bodies at 76 columns', () => {
    const mime = buildMimeMessage({ ...base, text: 'x'.repeat(500) });
    const body = mime.split('\r\n\r\n')[1] ?? '';
    for (const line of body.split('\r\n')) expect(line.length).toBeLessThanOrEqual(76);
  });

  it('encodes as base64url for the Gmail API', () => {
    expect(buildRawMessage({ ...base, text: 'hi' })).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
