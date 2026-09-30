// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { buildUpstreamRequest, createHandler, isProxiedPath, proxy } from './worker';

const UPSTREAM = 'https://postrail-api.onrender.com';
const SITE = 'https://postrail.haroonsajid-ai.workers.dev';

describe('isProxiedPath', () => {
  it.each([
    '/api/auth/callback/google',
    '/api/google/callback',
    '/v1/emails',
    '/app/me',
    '/app/orgs/123/logs',
    '/openapi.json',
    '/docs',
    '/docs/',
    '/health',
  ])('proxies %s', (path) => {
    expect(isProxiedPath(path)).toBe(true);
  });

  it.each([
    '/',
    '/index.html',
    '/login',
    '/orgs/123/logs',
    '/assets/index-abc123.js',
    '/api',
    '/apix/thing',
    '/v10/emails',
    '/application',
    '/documentation',
    '/openapi.json.bak',
    '/healthz',
  ])('serves %s from assets', (path) => {
    expect(isProxiedPath(path)).toBe(false);
  });
});

describe('buildUpstreamRequest', () => {
  it('keeps method, path, query, cookies and body, and re-addresses to the upstream', async () => {
    const original = new Request(`${SITE}/app/orgs?limit=5&q=a%20b`, {
      method: 'POST',
      headers: {
        cookie: '__Secure-better-auth.session_token=abc',
        'content-type': 'application/json',
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
        'transfer-encoding': 'chunked',
        upgrade: 'h2c',
        host: 'postrail.haroonsajid-ai.workers.dev',
      },
      body: JSON.stringify({ name: 'x' }),
    });
    const forwarded = buildUpstreamRequest(original, UPSTREAM);

    expect(forwarded.url).toBe(`${UPSTREAM}/app/orgs?limit=5&q=a%20b`);
    expect(forwarded.method).toBe('POST');
    expect(forwarded.redirect).toBe('manual');
    expect(forwarded.headers.get('cookie')).toBe('__Secure-better-auth.session_token=abc');
    expect(forwarded.headers.get('content-type')).toBe('application/json');
    expect(forwarded.headers.get('x-forwarded-host')).toBe('postrail.haroonsajid-ai.workers.dev');
    expect(forwarded.headers.get('x-forwarded-proto')).toBe('https');
    for (const name of ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host']) {
      expect(forwarded.headers.has(name)).toBe(false);
    }
    expect(await forwarded.text()).toBe('{"name":"x"}');
  });

  it('sends no body for GET', () => {
    const forwarded = buildUpstreamRequest(new Request(`${SITE}/app/me`), UPSTREAM);
    expect(forwarded.body).toBeNull();
    expect(forwarded.url).toBe(`${UPSTREAM}/app/me`);
  });
});

describe('proxy', () => {
  it('passes Set-Cookie through untouched and strips hop-by-hop response headers', async () => {
    const headers = new Headers({ 'content-type': 'application/json', connection: 'close' });
    headers.append(
      'set-cookie',
      '__Secure-better-auth.session_token=abc; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
    headers.append('set-cookie', 'other=1; Path=/');
    const upstreamFetch = vi.fn(() =>
      Promise.resolve(new Response('{"ok":true}', { status: 200, headers })),
    );

    const res = await proxy(new Request(`${SITE}/api/auth/get-session`), UPSTREAM, upstreamFetch);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":true}');
    expect(res.headers.getSetCookie()).toEqual([
      '__Secure-better-auth.session_token=abc; Path=/; HttpOnly; Secure; SameSite=Lax',
      'other=1; Path=/',
    ]);
    expect(res.headers.has('connection')).toBe(false);
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  it('returns redirects as-is instead of following them', async () => {
    const upstreamFetch = vi.fn<(request: Request) => Promise<Response>>(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: 'https://accounts.google.com/o/oauth2/v2/auth?state=xyz' },
        }),
      ),
    );
    const res = await proxy(
      new Request(`${SITE}/api/auth/sign-in/social`),
      UPSTREAM,
      upstreamFetch,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth?state=xyz',
    );
    expect(upstreamFetch.mock.calls[0]?.[0]?.redirect).toBe('manual');
  });
});

describe('createHandler', () => {
  it('routes API paths to the upstream and everything else to assets', async () => {
    const assets = { fetch: vi.fn(() => Promise.resolve(new Response('<html>spa</html>'))) };
    const upstreamFetch = vi.fn(() => Promise.resolve(new Response('{"version":"1"}')));
    const handle = createHandler({ upstream: UPSTREAM, assets, fetch: upstreamFetch });

    expect(await (await handle(new Request(`${SITE}/health`))).text()).toBe('{"version":"1"}');
    expect(await (await handle(new Request(`${SITE}/login`))).text()).toBe('<html>spa</html>');
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    expect(assets.fetch).toHaveBeenCalledTimes(1);
  });
});
