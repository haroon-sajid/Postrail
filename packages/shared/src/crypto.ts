import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { type ZodType } from 'zod';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const CIPHERTEXT_VERSION = 'v1';

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Parses a 32-byte key given as 64 hex characters (what `openssl rand -hex 32` prints). */
export function parseKeyHex(keyHex: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
    throw new Error(`encryption key must be ${KEY_BYTES} bytes as 64 hex characters`);
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * AES-256-GCM. Output is `v1.<iv>.<ciphertext>.<tag>` in base64url so a stored value is
 * self-describing and a future key or algorithm change can coexist with old rows.
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [CIPHERTEXT_VERSION, b64(iv), b64(ciphertext), b64(tag)].join('.');
}

/** Throws on a wrong key, a tampered value or an unknown format. Never returns garbage. */
export function decrypt(value: string, key: Buffer): string {
  const [version, ivPart, ciphertextPart, tagPart, ...rest] = value.split('.');
  if (version !== CIPHERTEXT_VERSION || !ivPart || !ciphertextPart || !tagPart || rest.length) {
    throw new Error('ciphertext has an unknown format');
  }
  const iv = unb64(ivPart);
  const tag = unb64(tagPart);
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('ciphertext has an unknown format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(unb64(ciphertextPart)), decipher.final()]).toString('utf8');
}

export interface TokenCipher {
  encrypt(plaintext: string): string;
  decrypt(value: string): string;
}

/** Binds a key once so callers never handle key material. */
export function createTokenCipher(keyHex: string): TokenCipher {
  const key = parseKeyHex(keyHex);
  return {
    encrypt: (plaintext) => encrypt(plaintext, key),
    decrypt: (value) => decrypt(value, key),
  };
}

export const STATE_TOKEN_TTL_MS = 10 * 60 * 1000;

interface StateOptions {
  ttlMs?: number;
  now?: () => Date;
}

/**
 * HMAC-signed, expiring token for OAuth `state`. `payload.<signature>`, both base64url.
 * Signed, not encrypted: the payload is readable, it just cannot be forged or replayed
 * past its expiry.
 */
export function signState(
  payload: Record<string, unknown>,
  secret: string,
  options: StateOptions = {},
): string {
  const now = options.now?.() ?? new Date();
  const exp = now.getTime() + (options.ttlMs ?? STATE_TOKEN_TTL_MS);
  const body = b64(Buffer.from(JSON.stringify({ ...payload, exp }), 'utf8'));
  return `${body}.${sign(body, secret)}`;
}

export type VerifyStateResult<T> =
  | { ok: true; payload: T }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'invalid-payload' };

/** Checks signature first, then expiry, then the payload shape. Constant-time compare. */
export function verifyState<T>(
  token: string,
  secret: string,
  schema: ZodType<T>,
  options: Pick<StateOptions, 'now'> = {},
): VerifyStateResult<T> {
  const [body, signature, ...rest] = token.split('.');
  if (!body || !signature || rest.length) return { ok: false, reason: 'malformed' };

  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'bad-signature' };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(unb64(body).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof decoded !== 'object' || decoded === null) return { ok: false, reason: 'malformed' };

  const { exp, ...payload } = decoded as { exp?: unknown };
  const now = options.now?.() ?? new Date();
  if (typeof exp !== 'number' || exp <= now.getTime()) return { ok: false, reason: 'expired' };

  const parsed = schema.safeParse(payload);
  return parsed.success
    ? { ok: true, payload: parsed.data }
    : { ok: false, reason: 'invalid-payload' };
}

function sign(body: string, secret: string): string {
  return b64(createHmac('sha256', secret).update(body).digest());
}

function b64(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function unb64(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
