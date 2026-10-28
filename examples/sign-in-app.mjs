/* global process, console, Buffer, fetch, URL, URLSearchParams */
/* eslint-disable no-console -- a CLI script; printing is its job */
// Minimal app that signs people in through Postrail (ADR 0011). No dependencies.
//
//   POSTRAIL_API_KEY=pr_live_... node examples/sign-in-app.mjs
//
// Before the first run, open Sign-in methods in the dashboard and add
// http://localhost:4100/auth/callback as a redirect URL. Magic links also need a
// connected mailbox. POSTRAIL_URL defaults to a local API on :8080.
//
// Everything that touches Postrail happens here, on the server. The browser only follows
// redirects and holds httpOnly cookies: the session token (30 days, revocable), the access
// token (a JWT, 15 minutes) and a short-lived `state` that proves the redirect coming back
// belongs to the browser that started it.
//
// A page view checks the access token locally against the workspace's public keys, with
// no call to Postrail. Only when it has expired is the session token traded for a new one.

import { createPublicKey, randomBytes, verify } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 4100);
const API_KEY = process.env.POSTRAIL_API_KEY;
const POSTRAIL_URL = (process.env.POSTRAIL_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
const REDIRECT_URL = `http://localhost:${PORT}/auth/callback`;

if (!API_KEY) {
  console.error('Set POSTRAIL_API_KEY to a key from the dashboard (API Keys).');
  process.exit(1);
}

/** Calls /v1/auth/*. Returns the parsed body, or throws the API's own error message. */
async function postrail(path, body) {
  const res = await fetch(`${POSTRAIL_URL}/v1/auth${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(`${json.error.code}: ${json.error.message}`);
  return json;
}

// Where the public keys are, and what a token must say, come from the API key's own
// workspace. Never take them from the token: it would then choose its own verifier.
const { tokens } = await postrail('/settings');
let keys = [];
async function loadKeys() {
  keys = (await (await fetch(tokens.jwks_url)).json()).keys;
}

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** The token's claims when it is genuine, for this workspace and unexpired; else null. */
async function verifyAccessToken(token) {
  const [header, payload, signature] = (token ?? '').split('.');
  if (!header || !payload || !signature) return null;
  const { alg, kid } = decode(header);
  if (alg !== 'ES256') return null;
  // An unknown key id usually means the keys were rotated since we last looked.
  if (!keys.some((k) => k.kid === kid)) await loadKeys();
  const key = keys.find((k) => k.kid === kid);
  if (!key) return null;

  const { kty, crv, x, y } = key;
  const genuine = verify(
    'sha256',
    Buffer.from(`${header}.${payload}`),
    { key: createPublicKey({ key: { kty, crv, x, y }, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature, 'base64url'),
  );
  const claims = decode(payload);
  const current = claims.exp > Date.now() / 1000;
  const ours = claims.iss === tokens.issuer && claims.aud === tokens.audience;
  return genuine && current && ours ? claims : null;
}

function cookies(req) {
  const pairs = (req.headers.cookie ?? '').split(';').map((part) => part.trim().split('='));
  return Object.fromEntries(pairs.filter(([name]) => name));
}

const setCookie = (name, value, maxAge) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

const secondsUntil = (iso) => Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000));

const accessCookie = (result) =>
  setCookie('access', result.access_token, secondsUntil(result.access_token_expires_at));

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function page(res, body, headers = {}) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers });
  res.end(`<!doctype html><meta charset="utf-8"><title>Sign-in demo</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">${body}`);
}

function redirect(res, location, setCookies = []) {
  res.writeHead(302, { location, 'set-cookie': setCookies }).end();
}

async function readForm(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const jar = cookies(req);

  if (url.pathname === '/') {
    let user = await verifyAccessToken(jar.access);
    const headers = {};
    if (!user && jar.session) {
      // The access token ran out. A live session buys a new one; a dead one signs out.
      const fresh = await postrail('/sessions/refresh', { token: jar.session });
      if (fresh.active) {
        user = await verifyAccessToken(fresh.access_token);
        headers['set-cookie'] = accessCookie(fresh);
      }
    }
    if (user) {
      return page(
        res,
        `<h1>Signed in</h1><p>${escapeHtml(user.name ?? user.email)} (${escapeHtml(user.email)})</p>
         <p><a href="/logout">Sign out</a></p>`,
        headers,
      );
    }
    return page(
      res,
      `<h1>Sign in</h1><p><a href="/login/google">Continue with Google</a></p>
       <form method="post" action="/login/email">
         <input name="email" type="email" required placeholder="you@example.com">
         <button>Email me a link</button>
       </form>`,
    );
  }

  if (url.pathname === '/login/google') {
    const state = randomBytes(16).toString('hex');
    const { url: google } = await postrail('/sign-in/google', {
      redirect_url: REDIRECT_URL,
      state,
    });
    return redirect(res, google, [setCookie('state', state, 600)]);
  }

  if (url.pathname === '/login/email' && req.method === 'POST') {
    const email = (await readForm(req)).get('email');
    const state = randomBytes(16).toString('hex');
    await postrail('/sign-in/magic-link', { email, redirect_url: REDIRECT_URL, state });
    return page(res, `<h1>Check your inbox</h1><p>We sent a link to ${escapeHtml(email)}.</p>`, {
      'set-cookie': setCookie('state', state, 900),
    });
  }

  if (url.pathname === '/auth/callback') {
    const error = url.searchParams.get('error');
    if (error) return page(res, `<h1>Sign-in failed</h1><p>${escapeHtml(error)}</p>`);
    // The state must match the cookie this browser was given, or someone else started this.
    if (!jar.state || jar.state !== url.searchParams.get('state')) {
      return page(
        res,
        '<h1>Sign-in failed</h1><p>Open the link in the browser you started in.</p>',
      );
    }
    const signIn = await postrail('/exchange', { code: url.searchParams.get('code') });
    console.log(`${signIn.is_new_user ? 'new user' : 'returning user'}: ${signIn.user.email}`);
    return redirect(res, '/', [
      setCookie('session', signIn.session.token, secondsUntil(signIn.session.expires_at)),
      accessCookie(signIn),
      setCookie('state', '', 0),
    ]);
  }

  if (url.pathname === '/logout') {
    if (jar.session) await postrail('/sessions/revoke', { token: jar.session });
    return redirect(res, '/', [setCookie('session', '', 0), setCookie('access', '', 0)]);
  }

  res.writeHead(404).end('not found');
}

createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error.message);
    if (res.headersSent) return res.end();
    page(res, `<h1>Something went wrong</h1><p>${escapeHtml(error.message)}</p>`);
  });
}).listen(PORT, () => {
  console.log(`sign-in demo on http://localhost:${PORT} (redirect URL: ${REDIRECT_URL})`);
});
