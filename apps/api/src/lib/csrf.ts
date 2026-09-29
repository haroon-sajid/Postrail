import { type MiddlewareHandler } from 'hono';
import { type AppEnv } from './context';
import { AppError } from './errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie-authenticated, state-changing requests must come from the dashboard. Browsers
 * always attach `Origin` to cross-site POSTs and to same-site fetches from scripts, so
 * a missing or foreign origin is a forged request. Combined with sameSite=lax cookies
 * this closes CSRF without per-form tokens.
 */
export function csrfProtection(allowedOrigin: string): MiddlewareHandler<AppEnv> {
  const allowed = new URL(allowedOrigin).origin;
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header('origin');
      if (!origin || origin !== allowed) {
        throw AppError.forbidden('cross-site request blocked');
      }
    }
    await next();
  };
}
