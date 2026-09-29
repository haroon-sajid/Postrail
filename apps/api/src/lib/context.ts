import { AppError } from './errors';
import { type Logger } from './logger';

export interface AuthContext {
  orgId: string;
  apiKeyId: string;
}

/** Per-request variables. All optional because middleware sets them in order. */
export interface AppEnv {
  Variables: {
    auth?: AuthContext;
    requestId?: string;
    logger?: Logger;
  };
}

type HasVars = { var: Readonly<AppEnv['Variables']> };

/** For handlers behind `requireApiKey`. Throwing here means the middleware was not mounted. */
export function getAuth(c: HasVars): AuthContext {
  const auth = c.var.auth;
  if (!auth) throw AppError.unauthorized();
  return auth;
}
