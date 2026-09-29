import { describe, expect, it } from 'vitest';
import { assertMetaSafe } from './service';

describe('assertMetaSafe', () => {
  it('accepts descriptive metadata', () => {
    expect(() => assertMetaSafe({ email: 'a@b.c', provider: 'google', count: 2 })).not.toThrow();
    expect(() => assertMetaSafe(undefined)).not.toThrow();
  });

  it('rejects keys that smell like secrets or content', () => {
    for (const key of [
      'refreshToken',
      'access_token',
      'clientSecret',
      'password',
      'keyHash',
      'html',
      'body',
    ]) {
      expect(() => assertMetaSafe({ [key]: 'x' })).toThrow(/audit meta/);
    }
  });
});
