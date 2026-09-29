import { type MiddlewareHandler } from 'hono';
import { type ApiKeyService } from '../modules/api-keys/service';
import { type AppEnv } from './context';

/** Authenticates `Authorization: Bearer pr_live_...` and attaches the org to the request. */
export function requireApiKey(apiKeys: ApiKeyService): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = await apiKeys.authenticate(c.req.header('authorization'));
    c.set('auth', auth);
    // Log lines from here on carry the org, never the key.
    const logger = c.var.logger;
    if (logger) c.set('logger', logger.child({ orgId: auth.orgId, apiKeyId: auth.apiKeyId }));
    await next();
  };
}
