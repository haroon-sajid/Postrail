import { describe, expect, it } from 'vitest';
import { generateSigningKey, signJwt, verifyJwt } from './jwt';

const now = new Date('2026-10-02T12:00:00Z');
const seconds = Math.floor(now.getTime() / 1000);

function setup() {
  const key = generateSigningKey();
  const keys = [{ ...key.publicJwk, kid: 'key-1' }];
  const token = signJwt({ sub: 'user-1', exp: seconds + 60 }, key.privateKeyPem, 'key-1');
  return { key, keys, token };
}

describe('signJwt / verifyJwt', () => {
  it('round-trips the claims under the published key', () => {
    const { keys, token } = setup();
    expect(token.split('.')).toHaveLength(3);
    expect(verifyJwt(token, keys, { now: () => now })).toEqual({
      ok: true,
      claims: { sub: 'user-1', exp: seconds + 60 },
    });
  });

  it('carries the algorithm and key id in the header', () => {
    const { token } = setup();
    const header: unknown = JSON.parse(
      Buffer.from(token.split('.')[0] ?? '', 'base64url').toString(),
    );
    expect(header).toEqual({ alg: 'ES256', typ: 'JWT', kid: 'key-1' });
  });

  it('rejects a tampered payload and a token signed by another key', () => {
    const { keys, token } = setup();
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', exp: seconds + 60 })).toString(
      'base64url',
    );
    expect(verifyJwt(`${header}.${forged}.${signature}`, keys, { now: () => now })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });

    const other = signJwt({ exp: seconds + 60 }, generateSigningKey().privateKeyPem, 'key-1');
    expect(verifyJwt(other, keys, { now: () => now })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('rejects an expired token, an unknown key id and junk', () => {
    const { key, keys, token } = setup();
    const later = new Date(now.getTime() + 61_000);
    expect(verifyJwt(token, keys, { now: () => later })).toEqual({ ok: false, reason: 'expired' });

    const stray = signJwt({ exp: seconds + 60 }, key.privateKeyPem, 'key-2');
    expect(verifyJwt(stray, keys, { now: () => now })).toEqual({
      ok: false,
      reason: 'unknown-key',
    });

    for (const junk of ['', 'a.b', 'a.b.c', 'a.b.c.d']) {
      expect(verifyJwt(junk, keys, { now: () => now })).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('refuses a token that claims no signature algorithm', () => {
    const { keys } = setup();
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: 'key-1' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp: seconds + 60 })).toString('base64url');
    expect(verifyJwt(`${header}.${payload}.x`, keys, { now: () => now })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});
