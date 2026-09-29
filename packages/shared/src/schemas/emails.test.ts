import { describe, expect, it } from 'vitest';
import { MAX_BATCH_SIZE } from '../constants';
import { sendEmailBatchRequestSchema, sendEmailRequestSchema } from './emails';
import { customHeadersSchema } from './mailboxes';

describe('sendEmailRequestSchema', () => {
  it('requires a template or subject plus a body', () => {
    expect(sendEmailRequestSchema.safeParse({ to: 'a@b.co' }).success).toBe(false);
    expect(sendEmailRequestSchema.safeParse({ to: 'a@b.co', subject: 'x' }).success).toBe(false);
    expect(
      sendEmailRequestSchema.safeParse({ to: 'a@b.co', subject: 'x', text: 'y' }).success,
    ).toBe(true);
    expect(sendEmailRequestSchema.safeParse({ to: 'a@b.co', template: 'welcome' }).success).toBe(
      true,
    );
  });
});

describe('sendEmailBatchRequestSchema', () => {
  const item = { to: 'a@b.co', subject: 'x', text: 'y' };

  it(`accepts up to ${MAX_BATCH_SIZE} items and rejects more or none`, () => {
    expect(sendEmailBatchRequestSchema.safeParse({ emails: [] }).success).toBe(false);
    expect(
      sendEmailBatchRequestSchema.safeParse({ emails: Array(MAX_BATCH_SIZE).fill(item) }).success,
    ).toBe(true);
    expect(
      sendEmailBatchRequestSchema.safeParse({ emails: Array(MAX_BATCH_SIZE + 1).fill(item) })
        .success,
    ).toBe(false);
  });
});

describe('customHeadersSchema', () => {
  it('blocks reserved names and line breaks', () => {
    expect(customHeadersSchema.safeParse({ 'X-Campaign': 'spring' }).success).toBe(true);
    expect(customHeadersSchema.safeParse({ From: 'x' }).success).toBe(false);
    expect(customHeadersSchema.safeParse({ 'X-Bad': 'a\r\nBcc: evil@x.y' }).success).toBe(false);
    expect(customHeadersSchema.safeParse({ 'X Bad': 'a' }).success).toBe(false);
  });
});
