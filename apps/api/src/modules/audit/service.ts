export interface AuditInput {
  /** Who did it: 'google-oauth', 'api-key:<id>', 'user:<id>', 'system'. */
  actor: string;
  /** Dotted verb, e.g. 'mailbox.connected'. */
  action: string;
  target?: string | null;
  meta?: Record<string, unknown>;
}

const SECRET_KEY_PATTERN = /token|secret|password|hash|html|body|authorization|cookie/i;

/**
 * Audit rows live forever and are shown to tenants. This is the last line of defence
 * against a token or an email body ending up in one.
 */
export function assertMetaSafe(meta: Record<string, unknown> | undefined): void {
  if (!meta) return;
  for (const key of Object.keys(meta)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`audit meta must not contain "${key}"`);
    }
  }
}
