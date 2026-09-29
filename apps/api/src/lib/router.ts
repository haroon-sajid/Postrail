import { OpenAPIHono } from '@hono/zod-openapi';
import { type AppEnv } from './context';

/**
 * Every router validates with zod and, on failure, throws the ZodError so the single
 * error handler turns it into the `{ error: { code, message } }` envelope.
 */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) throw result.error;
    },
  });
}

export type Router = ReturnType<typeof createRouter>;
