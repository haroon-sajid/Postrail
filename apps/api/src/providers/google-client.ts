import {
  gmailSendResponseSchema,
  googleErrorResponseSchema,
  googleTokenResponseSchema,
  googleUserInfoSchema,
} from '@postrail/shared';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
];

export interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

/**
 * The few Google endpoints we touch, behind an interface so the provider and the OAuth
 * flow can be tested without the network. No SDK: it is four HTTPS calls.
 */
export interface GoogleClient {
  authUrl: (params: { state: string }) => string;
  exchangeCode: (code: string) => Promise<GoogleTokens>;
  refreshAccessToken: (refreshToken: string) => Promise<GoogleTokens>;
  getEmail: (accessToken: string) => Promise<string>;
  sendRaw: (accessToken: string, rawBase64Url: string) => Promise<{ id: string }>;
}

/** An OAuth-level failure with Google's error code, e.g. `invalid_grant`. */
export class GoogleOAuthError extends Error {
  constructor(
    readonly code: string,
    description?: string,
  ) {
    super(`google oauth error: ${code}${description ? ` (${description})` : ''}`);
    this.name = 'GoogleOAuthError';
  }
}

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
    /** Google's own error message, trimmed. Used to recognise invalid recipients. */
    readonly detail?: string,
  ) {
    super(`google api ${endpoint} responded ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'GoogleApiError';
  }
}

/** Pulls `error.message` out of a Google JSON error body without trusting its size. */
export function googleErrorDetail(bodyText: string): string | undefined {
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: unknown } };
    const message = parsed.error?.message;
    return typeof message === 'string' ? message.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

export function createGoogleClient(
  config: GoogleClientConfig,
  fetchImpl: typeof fetch = fetch,
): GoogleClient {
  async function tokenRequest(form: Record<string, string>): Promise<GoogleTokens> {
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...form,
      }),
    });
    const body: unknown = await res.json();
    if (!res.ok) {
      const parsed = googleErrorResponseSchema.safeParse(body);
      if (parsed.success)
        throw new GoogleOAuthError(parsed.data.error, parsed.data.error_description);
      throw new GoogleApiError(res.status, 'token');
    }
    const tokens = googleTokenResponseSchema.parse(body);
    return {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    };
  }

  return {
    authUrl({ state }) {
      const url = new URL(AUTH_URL);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
      // offline + consent is the only combination that reliably returns a refresh token.
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('state', state);
      return url.toString();
    },

    exchangeCode(code) {
      return tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
      });
    },

    refreshAccessToken(refreshToken) {
      return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    },

    async getEmail(accessToken) {
      const res = await fetchImpl(USERINFO_URL, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new GoogleApiError(res.status, 'userinfo');
      return googleUserInfoSchema.parse(await res.json()).email;
    },

    async sendRaw(accessToken, rawBase64Url) {
      const res = await fetchImpl(GMAIL_SEND_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ raw: rawBase64Url }),
      });
      const text = await res.text();
      if (!res.ok) throw new GoogleApiError(res.status, 'gmail.send', googleErrorDetail(text));
      return { id: gmailSendResponseSchema.parse(JSON.parse(text)).id };
    },
  };
}
