// Response shapes live in @postrail/shared so the web app can reuse them; modules re-export
// what they need so route files import from one place.
export { healthResponseSchema, type HealthResponse } from '@postrail/shared';
