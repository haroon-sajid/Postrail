import { MEMBER_ROLE_RANK, type MemberRole } from '@postrail/shared';
import { AppError } from './errors';
import { type Logger } from './logger';

/**
 * Who is acting on which org. API keys act for the whole org (no role); dashboard
 * sessions carry the member's role so handlers can gate sensitive operations.
 */
export interface AuthContext {
  orgId: string;
  /** For audit rows: `api-key:<id>`, `user:<id>` or `system`. */
  actor: string;
  role?: MemberRole;
  userId?: string;
  apiKeyId?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

/** Per-request variables. All optional because middleware sets them in order. */
export interface AppEnv {
  Variables: {
    auth?: AuthContext;
    user?: SessionUser;
    requestId?: string;
    logger?: Logger;
  };
}

type HasVars = { var: Readonly<AppEnv['Variables']> };

/** For handlers behind auth middleware. Throwing here means the middleware was not mounted. */
export function getAuth(c: HasVars): AuthContext {
  const auth = c.var.auth;
  if (!auth) throw AppError.unauthorized();
  return auth;
}

export function getUser(c: HasVars): SessionUser {
  const user = c.var.user;
  if (!user) throw AppError.unauthorized('sign in required');
  return user;
}

/** API keys pass (they are org-wide); sessions must hold at least `min`. */
export function requireRole(auth: AuthContext, min: MemberRole): void {
  if (auth.role === undefined) return;
  if (MEMBER_ROLE_RANK[auth.role] < MEMBER_ROLE_RANK[min]) {
    throw AppError.forbidden(`requires the ${min} role`);
  }
}
