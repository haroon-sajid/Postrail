import { signState, unsubscribeTokenSchema, verifyState } from '@postrail/shared';

export const UNSUBSCRIBE_PATH = '/api/unsubscribe';

/** People unsubscribe from an email they dug out months later, so the link lasts years. */
const LINK_TTL_MS = 5 * 365 * 24 * 60 * 60 * 1000;

export interface UnsubscribeLinks {
  /** A link that, once confirmed, puts `email` on `orgId`'s suppression list. */
  urlFor: (orgId: string, email: string) => string;
  /** Who a link is for, or undefined when it was not minted here or was altered. */
  verify: (token: string) => { orgId: string; email: string } | undefined;
}

/**
 * Signed, not stored: the token is the HMAC'd pair (org, address), so nobody can
 * unsubscribe an address they were not sent a link for, and there is no table to keep.
 */
export function createUnsubscribeLinks(deps: {
  secret: string;
  /** Public origin of this API. */
  apiOrigin: string;
  now?: () => Date;
}): UnsubscribeLinks {
  const origin = deps.apiOrigin.replace(/\/+$/, '');
  const now = deps.now ?? (() => new Date());
  return {
    urlFor(orgId, email) {
      const token = signState({ orgId, email }, deps.secret, { ttlMs: LINK_TTL_MS, now });
      return `${origin}${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}`;
    },
    verify(token) {
      const result = verifyState(token, deps.secret, unsubscribeTokenSchema, { now });
      return result.ok ? result.payload : undefined;
    },
  };
}
