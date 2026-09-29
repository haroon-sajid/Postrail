import { randomBytes } from 'node:crypto';
import { sha256Hex } from './crypto';

/** Every key we mint starts with this. `pr_` alone is accepted when parsing older keys. */
export const API_KEY_PREFIX = 'pr_live_';

/** Characters of the raw key kept in clear text so users can recognise a key in lists. */
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

export interface GeneratedApiKey {
  /** The full key. Shown to the user exactly once and never stored. */
  raw: string;
  /** Recognisable head of the key, safe to store and display. */
  prefix: string;
  /** sha256 hex of `raw`. This is what the database stores and what lookups match on. */
  hash: string;
}

export function hashApiKey(raw: string): string {
  return sha256Hex(raw);
}

export function generateApiKey(): GeneratedApiKey {
  // 24 random bytes = 192 bits of entropy, 32 URL-safe characters.
  const raw = `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  return { raw, prefix: raw.slice(0, DISPLAY_PREFIX_LENGTH), hash: hashApiKey(raw) };
}
