import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

/** ECDSA on P-256 with SHA-256: small keys, and every JWT library verifies it. */
export const JWT_ALG = 'ES256';

/** The public half of a signing key, in the form a JWKS document publishes. */
export interface PublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

export interface JwksKey extends PublicJwk {
  kid: string;
  use: 'sig';
  alg: typeof JWT_ALG;
}

export interface SigningKeyPair {
  /** PKCS#8 PEM. Encrypt it before it is stored. */
  privateKeyPem: string;
  publicJwk: PublicJwk;
}

export function generateSigningKey(): SigningKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  if (!jwk.x || !jwk.y) throw new Error('generated key has no public coordinates');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicJwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y },
  };
}

/** Compact JWS. `kid` names the key so a verifier can pick it out of the JWKS. */
export function signJwt(
  claims: Record<string, unknown>,
  privateKeyPem: string,
  kid: string,
): string {
  const header = encode({ alg: JWT_ALG, typ: 'JWT', kid });
  const input = `${header}.${encode(claims)}`;
  // JWS wants the raw r||s signature, not the DER structure Node produces by default.
  const signature = sign('sha256', Buffer.from(input), {
    key: createPrivateKey(privateKeyPem),
    dsaEncoding: 'ieee-p1363',
  });
  return `${input}.${signature.toString('base64url')}`;
}

export type VerifyJwtResult =
  | { ok: true; claims: Record<string, unknown> }
  | { ok: false; reason: 'malformed' | 'unknown-key' | 'bad-signature' | 'expired' };

/**
 * What a tenant does with an access token: find the key by `kid`, check the signature,
 * then the expiry. Issuer and audience are left to the caller, who knows its own.
 */
export function verifyJwt(
  token: string,
  keys: Array<PublicJwk & { kid: string }>,
  options: { now?: () => Date } = {},
): VerifyJwtResult {
  const [headerPart, payloadPart, signaturePart, ...rest] = token.split('.');
  if (!headerPart || !payloadPart || !signaturePart || rest.length) {
    return { ok: false, reason: 'malformed' };
  }
  const header = decode(headerPart);
  const claims = decode(payloadPart);
  if (!header || !claims || header.alg !== JWT_ALG) return { ok: false, reason: 'malformed' };

  const key = keys.find((k) => k.kid === header.kid);
  if (!key) return { ok: false, reason: 'unknown-key' };
  const { kty, crv, x, y } = key;
  const valid = verify(
    'sha256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    { key: createPublicKey({ key: { kty, crv, x, y }, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
    Buffer.from(signaturePart, 'base64url'),
  );
  if (!valid) return { ok: false, reason: 'bad-signature' };

  const now = Math.floor((options.now?.() ?? new Date()).getTime() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}

function encode(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decode(part: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
