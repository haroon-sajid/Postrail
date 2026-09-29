import { GoogleApiError, GoogleOAuthError } from './google-client';
import { MailboxDisconnectedError } from './types';

export type SendErrorKind = 'disconnected' | 'transient' | 'permanent';

const NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'EPIPE']);

/**
 * What the worker should do with a failed send. Only rate limits, provider outages and
 * network blips are worth retrying; everything else is either a dead grant or our bug.
 */
export function classifySendError(error: unknown): SendErrorKind {
  if (error instanceof MailboxDisconnectedError) return 'disconnected';
  if (error instanceof GoogleOAuthError) {
    return error.code === 'invalid_grant' ? 'disconnected' : 'transient';
  }
  if (error instanceof GoogleApiError) {
    return error.status === 429 || error.status >= 500 ? 'transient' : 'permanent';
  }
  if (isNetworkError(error)) return 'transient';
  return 'permanent';
}

/**
 * Wording Gmail uses when it refuses an address outright. Real bounces arrive later as
 * email, which needs the read scope we do not ask for; this catches the synchronous cases.
 */
const INVALID_RECIPIENT =
  /invalid (to|recipient)|recipient address (rejected|required)|address not found|user unknown|no such user|does not exist|5\.1\.1|\b550\b/i;

export function looksLikeInvalidRecipient(error: unknown): boolean {
  return (
    error instanceof GoogleApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    INVALID_RECIPIENT.test(error.detail ?? '')
  );
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // undici wraps socket errors as TypeError('fetch failed') with the real error in cause.
  const inner = error.cause instanceof Error ? error.cause : error;
  const code = (inner as { code?: unknown }).code;
  return (typeof code === 'string' && NETWORK_CODES.has(code)) || error.message === 'fetch failed';
}
