import { uuidSchema } from '@postrail/shared';
import { type MiddlewareHandler } from 'hono';
import { type OrgStore } from '../modules/orgs/repo';
import { type AppEnv, type SessionUser } from './context';
import { AppError } from './errors';

export type SessionResolver = (headers: Headers) => Promise<SessionUser | null>;

/** Dashboard routes: a valid session cookie or nothing. API keys are never accepted here. */
export function requireSession(resolve: SessionResolver): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = await resolve(c.req.raw.headers);
    if (!user) throw AppError.unauthorized('sign in required');
    c.set('user', user);
    const logger = c.var.logger;
    if (logger) c.set('logger', logger.child({ userId: user.id }));
    await next();
  };
}

/**
 * For `/app/orgs/:orgId/*`: the signed-in user must be a member. Non-members get 404,
 * not 403, so org ids cannot be enumerated.
 */
export function requireOrgMember(orgs: OrgStore): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.var.user;
    if (!user) throw AppError.unauthorized('sign in required');
    const parsed = uuidSchema.safeParse(c.req.param('orgId'));
    if (!parsed.success) throw AppError.notFound('org');
    const membership = await orgs.getMembership(user.id, parsed.data);
    if (!membership) throw AppError.notFound('org');
    c.set('auth', {
      orgId: parsed.data,
      actor: `user:${user.id}`,
      role: membership.role,
      userId: user.id,
    });
    await next();
  };
}
