import { describe, expect, it } from 'vitest';
import { LOCAL_API_URL, resolveApiUrl } from './config';

const PROD = 'postrail.haroonsajid-ai.workers.dev';

describe('resolveApiUrl', () => {
  it('uses VITE_API_URL when it is set, wherever the page runs', () => {
    expect(resolveApiUrl({ VITE_API_URL: 'https://postrail-api.onrender.com' }, PROD)).toBe(
      'https://postrail-api.onrender.com',
    );
    expect(resolveApiUrl({ VITE_API_URL: 'http://localhost:8091' }, 'localhost')).toBe(
      'http://localhost:8091',
    );
  });

  it('strips trailing slashes and surrounding whitespace', () => {
    expect(resolveApiUrl({ VITE_API_URL: 'https://postrail-api.onrender.com/' }, PROD)).toBe(
      'https://postrail-api.onrender.com',
    );
    expect(resolveApiUrl({ VITE_API_URL: ' https://postrail-api.onrender.com// ' }, PROD)).toBe(
      'https://postrail-api.onrender.com',
    );
  });

  it('falls back to the local API on localhost when the variable is unset or blank', () => {
    expect(resolveApiUrl({}, 'localhost')).toBe(LOCAL_API_URL);
    expect(resolveApiUrl({ VITE_API_URL: '' }, '127.0.0.1')).toBe(LOCAL_API_URL);
    expect(resolveApiUrl({ VITE_API_URL: '  ' }, '[::1]')).toBe(LOCAL_API_URL);
  });

  it('throws a clear error off localhost when the variable is unset', () => {
    expect(() => resolveApiUrl({}, PROD)).toThrow(/VITE_API_URL is not set/);
    expect(() => resolveApiUrl({}, PROD)).toThrow(new RegExp(PROD));
  });

  it('rejects a value that is not an absolute http(s) URL', () => {
    expect(() => resolveApiUrl({ VITE_API_URL: 'postrail-api.onrender.com' }, PROD)).toThrow(
      /absolute URL/,
    );
    expect(() => resolveApiUrl({ VITE_API_URL: 'ftp://postrail-api.onrender.com' }, PROD)).toThrow(
      /http:\/\/ or https:\/\//,
    );
  });
});
