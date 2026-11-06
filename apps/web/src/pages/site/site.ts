/**
 * Who runs Postrail and how to reach them, as the public pages state it. Google's OAuth
 * verification checks that the privacy policy names the operator and a contact, and that
 * the policy is the one the consent screen links to (ADR 0016). Change them here.
 */
export const OPERATOR = 'Haroon Sajid';
/** The same address the README gives for security reports. */
export const CONTACT_EMAIL = 'haroonsajid016@gmail.com';

/** Bump whenever the privacy policy or the terms change in substance. */
export const POLICIES_UPDATED = '6 November 2026';

/**
 * Exactly the Google permissions the API asks for (apps/api/src/providers/google-client.ts
 * and google-identity.ts). The privacy policy and the home page quote this list, and
 * Google's reviewers compare it with the consent screen.
 */
export const GOOGLE_SCOPES = [
  {
    scope: 'https://www.googleapis.com/auth/gmail.send',
    when: 'when you connect a Gmail mailbox',
    why: 'to send the emails you or your application ask Postrail to send, from that mailbox. It cannot read, list, change or delete any email in it.',
  },
  {
    scope: 'https://www.googleapis.com/auth/userinfo.email',
    when: 'when you connect a Gmail mailbox',
    why: 'to learn which address the mailbox sends from, so it can be shown and chosen as the sender.',
  },
  {
    scope: 'openid, email, profile',
    when: 'when someone signs in with Google',
    why: 'to sign them in: their Google account id, verified email address, name and picture.',
  },
] as const;
