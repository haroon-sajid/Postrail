import { describe, expect, it } from 'vitest';
import { API_KEY_PREFIX, generateApiKey, hashApiKey } from './api-keys';

describe('api keys', () => {
  it('generates a prefixed key with a sha256 hash', () => {
    const key = generateApiKey();
    expect(key.raw.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(key.raw.length).toBeGreaterThanOrEqual(API_KEY_PREFIX.length + 32);
    expect(key.prefix).toBe(key.raw.slice(0, key.prefix.length));
    expect(key.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(key.hash).toBe(hashApiKey(key.raw));
  });

  it('never repeats', () => {
    expect(generateApiKey().raw).not.toBe(generateApiKey().raw);
  });

  it('hashes deterministically', () => {
    expect(hashApiKey('pr_x')).toBe(hashApiKey('pr_x'));
    expect(hashApiKey('pr_x')).not.toBe(hashApiKey('pr_y'));
  });
});
