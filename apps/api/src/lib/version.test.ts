import { afterEach, describe, expect, it } from 'vitest';
import { resolveVersion } from './version';

describe('resolveVersion', () => {
  const original = process.env.npm_package_version;

  afterEach(() => {
    if (original === undefined) delete process.env.npm_package_version;
    else process.env.npm_package_version = original;
  });

  it('prefers APP_VERSION', () => {
    process.env.npm_package_version = '9.9.9';
    expect(resolveVersion({ APP_VERSION: 'abc123' })).toBe('abc123');
  });

  it('falls back to the package version, then a constant', () => {
    process.env.npm_package_version = '1.2.3';
    expect(resolveVersion({})).toBe('1.2.3');
    delete process.env.npm_package_version;
    expect(resolveVersion({})).toBe('0.0.0');
  });
});
