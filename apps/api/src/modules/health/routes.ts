import { Hono } from 'hono';
import { getHealth } from './service';

export interface HealthRouteDeps {
  version: string;
}

export function healthRoutes({ version }: HealthRouteDeps) {
  return new Hono().get('/', (c) => c.json(getHealth(version)));
}
