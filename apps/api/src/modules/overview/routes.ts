import { createRoute, z } from '@hono/zod-openapi';
import { overviewSchema, uuidSchema } from '@postrail/shared';
import { getAuth } from '../../lib/context';
import { COOKIE_SECURITY, ERROR_RESPONSES, jsonContent } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import { type OverviewService } from './service';

const overview = createRoute({
  method: 'get',
  path: '/app/orgs/{orgId}/overview',
  tags: ['Overview (dashboard)'],
  summary: 'Stats, 30-day series, mailbox usage and recent failures',
  security: COOKIE_SECURITY,
  request: { params: z.object({ orgId: uuidSchema }) },
  responses: { 200: jsonContent(overviewSchema, 'Overview'), ...ERROR_RESPONSES },
});

export function overviewRoutes(service: OverviewService) {
  return createRouter().openapi(overview, async (c) => c.json(await service.get(getAuth(c)), 200));
}
