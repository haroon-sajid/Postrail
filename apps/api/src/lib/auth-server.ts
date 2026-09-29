import { accounts, type Db, sessions, users, verifications } from '@postrail/db';
import { type Env } from '@postrail/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { type SessionUser } from './context';

export interface AuthServerDeps {
  db: Db;
  env: Pick<
    Env,
    | 'NODE_ENV'
    | 'API_ORIGIN'
    | 'DASHBOARD_ORIGIN'
    | 'BETTER_AUTH_SECRET'
    | 'GOOGLE_CLIENT_ID'
    | 'GOOGLE_CLIENT_SECRET'
  >;
  /** Delivers the magic link through Postrail's own system mailbox. */
  sendMagicLink: (email: string, url: string) => Promise<void>;
  /** First sign-in: create the default org and owner membership. */
  onUserCreated: (user: SessionUser) => Promise<void>;
}

export const MAGIC_LINK_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Better Auth with Google and magic-link sign in. Sessions are httpOnly, sameSite=lax
 * cookies (secure in production). The dashboard origin is the only trusted origin, so
 * Better Auth's own CSRF/origin checks reject anything else.
 */
export function createAuthServer(deps: AuthServerDeps) {
  const { env } = deps;
  return betterAuth({
    baseURL: env.API_ORIGIN,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.DASHBOARD_ORIGIN],
    database: drizzleAdapter(deps.db, {
      provider: 'pg',
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        sendMagicLink: ({ email, url }) => deps.sendMagicLink(email, url),
      }),
    ],
    session: { expiresIn: SESSION_TTL_SECONDS, updateAge: 24 * 60 * 60 },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
      database: { generateId: 'uuid' },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await deps.onUserCreated({
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image ?? null,
            });
          },
        },
      },
    },
  });
}

export type AuthServer = ReturnType<typeof createAuthServer>;

/** Adapts Better Auth's session lookup to the shape the session middleware wants. */
export function sessionResolverFor(auth: AuthServer) {
  return async (headers: Headers): Promise<SessionUser | null> => {
    const result = await auth.api.getSession({ headers });
    if (!result) return null;
    const { user } = result;
    return { id: user.id, email: user.email, name: user.name, image: user.image ?? null };
  };
}
