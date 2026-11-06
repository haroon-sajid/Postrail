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
  /**
   * The API's CRON_SECRET, so the Cron Trigger can call /internal/cron/tick. A Worker
   * secret (`wrangler secret put CRON_SECRET`), never a var.
   */
  CRON_SECRET?: string;
  ASSETS: AssetsBinding;
}

/**
 * Every 10 minutes: a request to /health, which touches no database. On a free host that
 * sleeps after 15 idle minutes this keeps the API awake, so the first call of the morning
 * is not a 50-second cold start and in-process timers are not lost. Keep in sync with
 * `triggers.crons` in wrangler.jsonc.
 */
export const KEEP_WARM_CRON = '*/10 * * * *';
/** Every 30 minutes: the API's scheduler tick (daily reset, lost-work sweep, retention). */
export const TICK_CRON = '*/30 * * * *';

const CRON_USER_AGENT = 'Postrail-Cron/1';

/**
 * Runs one Cron Trigger. Throws when the API did not answer 2xx, which is what makes
 * Cloudflare record the invocation as failed in the Worker's cron log.
 */
export async function runScheduled(
  cron: string,
  env: Pick<WorkerEnv, 'API_UPSTREAM' | 'CRON_SECRET'>,
  fetchImpl: (request: Request) => Promise<Response>,
): Promise<void> {
  const upstream = env.API_UPSTREAM?.trim().replace(/\/+$/, '');
  if (!upstream) throw new Error('API_UPSTREAM is not configured in wrangler.jsonc vars');

  if (cron === TICK_CRON) {
    if (!env.CRON_SECRET) {
      throw new Error('CRON_SECRET is not set on the Worker, so the scheduler cannot tick');
    }
    // Straight to the API: /internal is deliberately not proxied for browsers.
    const res = await fetchImpl(
      new Request(`${upstream}/internal/cron/tick`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.CRON_SECRET}`, 'user-agent': CRON_USER_AGENT },
      }),
    );
    // Cloudflare records each successful run; only a failure needs the report.
    if (!res.ok) {
      throw new Error(`tick answered ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    return;
  }

  const res = await fetchImpl(
    new Request(`${upstream}/health`, { headers: { 'user-agent': CRON_USER_AGENT } }),
  );
  if (!res.ok) throw new Error(`health answered ${res.status}`);
}

/** The parts of Cloudflare's scheduled-event types this Worker uses. */
interface ScheduledEvent {
  cron: string;
}
interface ExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void;
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

  scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext): void {
    ctx.waitUntil(runScheduled(event.cron, env, (r) => fetch(r)));
  },
};
