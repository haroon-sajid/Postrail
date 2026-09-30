/**
 * Where the API lives. This is the only place the dashboard learns the API URL.
 *
 * In production the Cloudflare Worker (src/worker.ts) proxies /api, /v1, /app and the
 * docs to the API, so the dashboard talks to its own origin and API_URL is the empty
 * string: every request is a relative URL on the current host. A dev server on localhost
 * talks to the local API directly. VITE_API_URL overrides both, for the rare build that
 * must call an API on another origin; Vite bakes it in at build time.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const LOCAL_API_URL = 'http://localhost:8080';

/** Same origin as the page: requests use relative URLs. */
export const SAME_ORIGIN = '';

export interface ApiUrlEnv {
  readonly VITE_API_URL?: string;
}

export function resolveApiUrl(env: ApiUrlEnv, hostname: string): string {
  const configured = env.VITE_API_URL?.trim();
  if (configured) return normalize(configured);
  if (LOCAL_HOSTS.has(hostname)) return LOCAL_API_URL;
  return SAME_ORIGIN;
}

function normalize(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `VITE_API_URL must be an absolute URL such as https://api.example.com, got "${value}"`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`VITE_API_URL must start with http:// or https://, got "${value}"`);
  }
  return value.replace(/\/+$/, '');
}

/** Base for requests. Empty when the API is same-origin. */
export const API_URL = resolveApiUrl(import.meta.env, window.location.hostname);

/** Absolute base for links and code samples shown to people. */
export const PUBLIC_API_URL = API_URL || window.location.origin;
