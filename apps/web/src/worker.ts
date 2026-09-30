/**
 * Cloudflare Worker in front of the dashboard.
 *
 * Static assets serve the SPA. Anything the API owns is forwarded to API_UPSTREAM so the
 * browser only ever sees one origin: the session cookie is first-party, Google's OAuth
 * state cookie survives the round trip, and CORS is not needed. wrangler.jsonc lists the
 * same prefixes under run_worker_first so every other path skips this code entirely.
 *
 * The forward keeps method, path, query, headers and body; cookies go through untouched
 * in both directions; hop-by-hop headers are dropped; redirects are returned as-is.
 */
const PROXIED_PREFIXES = ['/api/', '/v1/', '/app/', '/docs/'] as const;
const PROXIED_PATHS = new Set(['/openapi.json', '/docs', '/health']);

/** RFC 7230 §6.1: meaningful only for a single connection, never forwarded. */
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

export function isProxiedPath(pathname: string): boolean {
  if (PROXIED_PATHS.has(pathname)) return true;
  return PROXIED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerEnv {
  /** Origin of the API, e.g. https://postrail-api.onrender.com. A var in wrangler.jsonc. */
  API_UPSTREAM?: string;
  ASSETS: AssetsBinding;
}

export interface ProxyDeps {
  upstream: string;
  assets: AssetsBinding;
  fetch: (request: Request) => Promise<Response>;
}

function stripHopByHop(headers: Headers): Headers {
  const out = new Headers(headers);
  for (const name of HOP_BY_HOP) out.delete(name);
  return out;
}

/** The same request, re-addressed to the upstream origin. */
export function buildUpstreamRequest(request: Request, upstream: string): Request {
  const base = new URL(upstream);
  const target = new URL(request.url);
  target.protocol = base.protocol;
  target.host = base.host;

  const headers = stripHopByHop(request.headers);
  // The runtime sets Host from the URL; the original goes along for logs and links.
  headers.delete('host');
  headers.set('x-forwarded-host', new URL(request.url).host);
  headers.set('x-forwarded-proto', new URL(request.url).protocol.replace(':', ''));

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  // `duplex` is required by Node for streaming bodies and ignored by workerd.
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    body: hasBody ? request.body : null,
    redirect: 'manual',
    duplex: 'half',
  };
  return new Request(target.toString(), init);
}

/** Forwards `request` to the upstream and returns its response with connection headers removed. */
export async function proxy(
  request: Request,
  upstream: string,
  fetchImpl: ProxyDeps['fetch'],
): Promise<Response> {
  const response = await fetchImpl(buildUpstreamRequest(request, upstream));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: stripHopByHop(response.headers),
  });
}

export function createHandler(deps: ProxyDeps): (request: Request) => Promise<Response> {
  return (request) => {
    const { pathname } = new URL(request.url);
    if (!isProxiedPath(pathname)) return deps.assets.fetch(request);
    return proxy(request, deps.upstream, deps.fetch);
  };
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const upstream = env.API_UPSTREAM?.trim();
    if (!upstream) {
      // A deploy without the var must fail visibly, not serve the SPA for API paths.
      return Promise.resolve(
        new Response('API_UPSTREAM is not configured in wrangler.jsonc vars', { status: 500 }),
      );
    }
    return createHandler({ upstream, assets: env.ASSETS, fetch: (r) => fetch(r) })(request);
  },
};
