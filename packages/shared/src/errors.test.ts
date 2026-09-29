import { describe, expect, it } from 'vitest';
import { errorResponseSchema } from './errors';

describe('errorResponseSchema', () => {
  it('accepts the canonical envelope', () => {
    const parsed = errorResponseSchema.parse({
      error: { code: 'NOT_FOUND', message: 'nope' },
    });
    expect(parsed.error.code).toBe('NOT_FOUND');
  });

  it('rejects unknown codes', () => {
    expect(errorResponseSchema.safeParse({ error: { code: 'WAT', message: 'x' } }).success).toBe(
      false,
    );
  });
});
