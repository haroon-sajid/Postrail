import { Hono } from 'hono';
import { getHealth } from './service';

export interface HealthRouteDeps {
  version: string;
}

/**
 * `/` is what Render probes directly. `/health` is the same payload for callers that
 * reach the API through the dashboard's Worker proxy, where `/` is the SPA.
 */
export function healthRoutes({ version }: HealthRouteDeps) {
  const handler = (c: { json: (body: unknown) => Response }) => c.json(getHealth(version));
  return new Hono().get('/', handler).get('/health', handler);
}
