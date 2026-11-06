import { type LookupAddress, promises as dns } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/**
 * Where tenant-supplied URLs (webhooks) may not point: loopback, private networks,
 * link-local (home of cloud metadata services such as 169.254.169.254), carrier-grade NAT,
 * documentation, benchmarking, multicast and reserved space, plus the IPv6 prefixes that
 * tunnel into IPv4. IPv4-mapped IPv6 (::ffff:a.b.c.d) is checked against the IPv4 list by
 * BlockList itself.
 */
const NON_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 96], // unspecified, loopback and the deprecated IPv4-compatible block
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48],
  ['100::', 64], // discard
  ['2001::', 23], // IETF protocol assignments, including Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local
  ['ff00::', 8], // multicast
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, 'ipv6');
}

/** Names that only ever mean "this machine or its network", whatever DNS says. */
const LOCAL_SUFFIXES = ['localhost', 'local', 'internal', 'home.arpa'];

/** The URL may not be called: it is, or resolves to, an address outside the public internet. */
export class BlockedDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedDestinationError';
  }
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !NON_PUBLIC.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** `new URL` already turns 2130706433 or 0x7f.1 into 127.0.0.1; only IPv6 brackets remain. */
function bareHost(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function isLocalName(host: string): boolean {
  return LOCAL_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

const asError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

export type Resolve = (hostname: string) => Promise<LookupAddress[]>;

const systemResolve: Resolve = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

export interface DestinationPolicy {
  /** Development only: lets a webhook reach localhost and private networks. */
  allowPrivate: boolean;
  /** Production: new endpoints must use https, since the payload and signature travel in it. */
  requireHttps: boolean;
  /** Tests pass their own; defaults to the system resolver. */
  resolve?: Resolve;
}

export interface DestinationGuard {
  /** For save time. Throws BlockedDestinationError with a message fit for the caller. */
  check: (url: string) => Promise<void>;
  /**
   * A fetch that only connects to public addresses. The address is checked in the lookup
   * the socket itself uses, so a name that resolved publicly at save time and privately now
   * (DNS rebinding) is still refused. Reads the status, never the body; follows no redirects.
   */
  fetch: typeof fetch;
}

export function createDestinationGuard(policy: DestinationPolicy): DestinationGuard {
  const resolve = policy.resolve ?? systemResolve;

  function assertHostAllowed(host: string): void {
    if (policy.allowPrivate) return;
    if (isIP(host) ? !isPublicAddress(host) : isLocalName(host)) {
      throw new BlockedDestinationError('url must not point to a private or internal address');
    }
  }

  function assertAllPublic(addresses: LookupAddress[]): void {
    if (policy.allowPrivate) return;
    if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a.address))) {
      throw new BlockedDestinationError('url must not resolve to a private or internal address');
    }
  }

  // The socket asks this instead of DNS directly, so the check and the connect see the
  // same answer. Node may ask for one address or, with happy eyeballs, for all of them.
  const guardedLookup: LookupFunction = (hostname, options, callback) => {
    resolve(hostname)
      .then((all) => {
        const wanted =
          options.family === 4 || options.family === 6
            ? all.filter((a) => a.family === options.family)
            : all;
        const [first] = wanted;
        if (!first) {
          throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
            code: 'ENOTFOUND',
          });
        }
        assertAllPublic(wanted);
        if (options.all) callback(null, wanted);
        else callback(null, first.address, first.family);
      })
      .catch((error: unknown) => {
        callback(asError(error), '', 0);
      });
  };

  return {
    async check(raw) {
      const url = new URL(raw);
      if (url.protocol !== 'https:' && (policy.requireHttps || url.protocol !== 'http:')) {
        throw new BlockedDestinationError('url must use https');
      }
      const host = bareHost(url);
      assertHostAllowed(host);
      if (policy.allowPrivate || isIP(host)) return;
      let addresses: LookupAddress[];
      try {
        addresses = await resolve(host);
      } catch {
        throw new BlockedDestinationError(`could not resolve ${host}`);
      }
      assertAllPublic(addresses);
    },

    fetch: (input: string | URL | Request, init: RequestInit = {}) =>
      new Promise<Response>((resolveResponse, reject) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
          reject(new BlockedDestinationError('url must use http or https'));
          return;
        }
        try {
          // Literal addresses never reach the lookup, so they are checked here.
          assertHostAllowed(bareHost(url));
        } catch (error) {
          reject(asError(error));
          return;
        }
        const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
        const req = send(
          url,
          {
            method: init.method ?? 'GET',
            headers: Object.fromEntries(new Headers(init.headers)),
            lookup: guardedLookup,
            ...(init.signal ? { signal: init.signal } : {}),
          },
          (res) => {
            // The body is never read; drain it so the socket goes back to the pool.
            res.resume();
            try {
              resolveResponse(new Response(null, { status: res.statusCode ?? 502 }));
            } catch (error) {
              // A status outside 200-599 cannot be represented; treat it as a failure.
              reject(asError(error));
            }
          },
        );
        req.on('error', reject);
        req.end(typeof init.body === 'string' ? init.body : undefined);
      }),
  };
}
