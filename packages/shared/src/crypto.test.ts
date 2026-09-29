import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createTokenCipher,
  decrypt,
  encrypt,
  parseKeyHex,
  sha256Hex,
  signState,
  STATE_TOKEN_TTL_MS,
  verifyState,
} from './crypto';

const KEY_HEX = '0123456789abcdef'.repeat(4);
const OTHER_KEY_HEX = 'fedcba9876543210'.repeat(4);
const key = parseKeyHex(KEY_HEX);

describe('sha256Hex', () => {
  it('matches a known digest', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('parseKeyHex', () => {
  it('rejects anything but 64 hex characters', () => {
    expect(() => parseKeyHex('abc')).toThrow(/64 hex/);
    expect(() => parseKeyHex('zz'.repeat(32))).toThrow(/64 hex/);
    expect(parseKeyHex(KEY_HEX)).toHaveLength(32);
  });
});

describe('encrypt / decrypt', () => {
  it('round-trips unicode text', () => {
    const plaintext = 'refresh-token-ünïcödé-🔐';
    expect(decrypt(encrypt(plaintext, key), key)).toBe(plaintext);
  });

  it('produces a fresh IV every time', () => {
    expect(encrypt('same', key)).not.toBe(encrypt('same', key));
  });

  it('is versioned and base64url', () => {
    const value = encrypt('x', key);
    expect(value).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+$/);
  });

  it('fails closed on a wrong key', () => {
    const value = encrypt('secret', key);
    expect(() => decrypt(value, parseKeyHex(OTHER_KEY_HEX))).toThrow();
  });

  it('fails closed on tampering', () => {
    const [v, iv, ct, tag] = encrypt('secret', key).split('.');
    const flipped = (ct ?? '').startsWith('A')
      ? `B${(ct ?? '').slice(1)}`
      : `A${(ct ?? '').slice(1)}`;
    expect(() => decrypt([v, iv, flipped, tag].join('.'), key)).toThrow();
    expect(() => decrypt(`${v}.${iv}.${ct}`, key)).toThrow(/format/);
    expect(() => decrypt(`v0.${iv}.${ct}.${tag}`, key)).toThrow(/format/);
  });

  it('createTokenCipher binds the key', () => {
    const cipher = createTokenCipher(KEY_HEX);
    expect(cipher.decrypt(cipher.encrypt('tok'))).toBe('tok');
    expect(() => createTokenCipher('short')).toThrow(/64 hex/);
  });
});

describe('signState / verifyState', () => {
  const secret = 'state-secret';
  const schema = z.object({ orgId: z.string() });
  const t0 = new Date('2026-09-29T12:00:00Z');
  const at = (offsetMs: number) => () => new Date(t0.getTime() + offsetMs);

  it('round-trips a payload within the ttl', () => {
    const token = signState({ orgId: 'org-1' }, secret, { now: at(0) });
    const result = verifyState(token, secret, schema, { now: at(STATE_TOKEN_TTL_MS - 1) });
    expect(result).toEqual({ ok: true, payload: { orgId: 'org-1' } });
  });

  it('expires after ten minutes', () => {
    const token = signState({ orgId: 'org-1' }, secret, { now: at(0) });
    expect(verifyState(token, secret, schema, { now: at(STATE_TOKEN_TTL_MS) })).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('rejects a bad signature, a wrong secret and a tampered body', () => {
    const token = signState({ orgId: 'org-1' }, secret, { now: at(0) });
    const [body, sig] = token.split('.');
    expect(verifyState(`${body}.${sig}x`, secret, schema, { now: at(0) }).ok).toBe(false);
    expect(verifyState(token, 'other', schema, { now: at(0) }).ok).toBe(false);
    const forged = signState({ orgId: 'org-2' }, 'other', { now: at(0) }).split('.')[0];
    expect(verifyState(`${forged}.${sig}`, secret, schema, { now: at(0) })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('rejects malformed tokens without throwing', () => {
    expect(verifyState('', secret, schema).ok).toBe(false);
    expect(verifyState('a.b.c', secret, schema).ok).toBe(false);
    expect(verifyState('only-one-part', secret, schema).ok).toBe(false);
  });

  it('rejects a payload that does not match the schema', () => {
    const token = signState({ nope: 1 }, secret, { now: at(0) });
    expect(verifyState(token, secret, schema, { now: at(0) })).toEqual({
      ok: false,
      reason: 'invalid-payload',
    });
  });
});
