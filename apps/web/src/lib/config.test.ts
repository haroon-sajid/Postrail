import { describe, expect, it } from 'vitest';
import { LOCAL_API_URL, resolveApiUrl, SAME_ORIGIN } from './config';

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

  it('defaults to same origin everywhere else, so the Worker proxy handles the API', () => {
    expect(resolveApiUrl({}, PROD)).toBe(SAME_ORIGIN);
    expect(resolveApiUrl({ VITE_API_URL: '' }, 'pr-7-postrail.haroonsajid-ai.workers.dev')).toBe(
      SAME_ORIGIN,
    );
    expect(SAME_ORIGIN).toBe('');
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
