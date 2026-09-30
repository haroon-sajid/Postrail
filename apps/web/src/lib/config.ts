/**
 * Where the API lives. This is the only place the dashboard learns the API URL.
 *
 * Vite bakes VITE_API_URL into the bundle at build time, so it must be set as a build
 * variable wherever the bundle is built (Cloudflare, CI, a laptop). A dev server on
 * localhost falls back to the local API. Anything else without the variable throws
 * here, at import time, so a misconfigured production build fails on first paint
 * instead of quietly calling localhost from a user's browser.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const LOCAL_API_URL = 'http://localhost:8080';

export interface ApiUrlEnv {
  readonly VITE_API_URL?: string;
}

export function resolveApiUrl(env: ApiUrlEnv, hostname: string): string {
  const configured = env.VITE_API_URL?.trim();
  if (configured) return normalize(configured);
  if (LOCAL_HOSTS.has(hostname)) return LOCAL_API_URL;
  throw new Error(
    `VITE_API_URL is not set, and ${hostname} is not localhost, so this build has no API to talk to. ` +
      'Set VITE_API_URL as a build-time variable and rebuild; Vite bakes it into the bundle.',
  );
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

export const API_URL = resolveApiUrl(import.meta.env, window.location.hostname);
