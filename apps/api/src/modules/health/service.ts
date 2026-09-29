import { type HealthResponse } from './schemas';

/** Liveness only. Dependency checks (DB, queues) belong in a separate readiness route. */
export function getHealth(version: string): HealthResponse {
  return { ok: true, version };
}
