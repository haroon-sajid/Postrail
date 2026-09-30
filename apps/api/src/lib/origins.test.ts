import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';
import { createOriginMatcher, originPatternToRegExp } from './origins';

const PREVIEW_PATTERN = 'https://*-postrail.haroonsajid-ai.workers.dev';

describe('createOriginMatcher', () => {
  const allow = createOriginMatcher({
    origins: ['https://postrail.haroonsajid-ai.workers.dev', 'http://localhost:5173/'],
    patterns: [PREVIEW_PATTERN],
  });

  it('accepts the exact origins, ignoring case and a trailing slash', () => {
    expect(allow('https://postrail.haroonsajid-ai.workers.dev')).toBe(true);
    expect(allow('https://POSTRAIL.haroonsajid-ai.workers.dev')).toBe(true);
    expect(allow('http://localhost:5173')).toBe(true);
  });

  it('accepts preview origins that match the pattern', () => {
    expect(allow('https://abc123-postrail.haroonsajid-ai.workers.dev')).toBe(true);
    expect(allow('https://feature-x-postrail.haroonsajid-ai.workers.dev')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(allow('https://evil.example')).toBe(false);
    expect(allow('http://postrail.haroonsajid-ai.workers.dev')).toBe(false);
    expect(allow('https://postrail.haroonsajid-ai.workers.dev.evil.example')).toBe(false);
    expect(allow('https://-postrail.haroonsajid-ai.workers.dev')).toBe(false);
    expect(allow('https://a.b-postrail.haroonsajid-ai.workers.dev')).toBe(false);
    expect(allow('http://localhost:5174')).toBe(false);
    expect(allow('null')).toBe(false);
    expect(allow('')).toBe(false);
  });

  it('rejects a malformed exact origin at construction so a typo fails at startup', () => {
    expect(() => createOriginMatcher({ origins: ['postrail.example'] })).toThrow(
      /not a valid origin/,
    );
  });

  it('escapes regex characters in the pattern', () => {
    const re = originPatternToRegExp('https://*.app.example');
    expect(re.test('https://x.app.example')).toBe(true);
    expect(re.test('https://x.appzexample')).toBe(false);
  });
});

describe('CORS on /app', () => {
  const t = createTestApp({ originPatterns: [PREVIEW_PATTERN] });

  async function preflight(origin: string) {
    return t.app.request('/app/me', {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'GET' },
    });
  }

  it('allows the dashboard origin with credentials', async () => {
    const res = await preflight('http://localhost:5173');
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('allows a preview origin matching the pattern', async () => {
    const origin = 'https://pr-42-postrail.haroonsajid-ai.workers.dev';
    const res = await preflight(origin);
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('emits no CORS headers at all when disabled, as in production behind the proxy', async () => {
    const prod = createTestApp({ corsEnabled: false });
    const res = await prod.app.request('/app/me', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('sets no allow-origin header for a foreign origin', async () => {
    const res = await preflight('https://evil.example');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('lets a preview origin through the CSRF check', async () => {
    const user = t.member('11111111-1111-4111-8111-111111111111', 'owner');
    const res = await t.app.request('/app/orgs', {
      method: 'POST',
      headers: {
        ...t.sessionHeaders(user),
        origin: 'https://pr-42-postrail.haroonsajid-ai.workers.dev',
      },
      body: JSON.stringify({ name: 'Preview org' }),
    });
    expect(res.status).toBe(201);
  });
});
