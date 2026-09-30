/**
 * Which browser origins the API trusts. One matcher feeds CORS, the CSRF check and
 * Better Auth's trusted origins so they can never disagree.
 *
 * Exact origins come from DASHBOARD_ORIGIN and CORS_ORIGIN. Patterns come from
 * CORS_ORIGIN_PATTERN and exist for preview deployments whose hostname is minted per
 * branch, e.g. `https://*-postrail.example.workers.dev`. A `*` matches exactly one
 * host label (no dots, no slashes), so a pattern can only ever widen to sibling
 * subdomains of the host you wrote, never to another site.
 */
export type OriginMatcher = (origin: string) => boolean;

export interface OriginConfig {
  origins: string[];
  patterns?: string[] | undefined;
}

const LABEL = '[a-z0-9-]+';

/** Turns `https://*-app.example.com` into a case-insensitive whole-origin regex. */
export function originPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, LABEL)}$`, 'i');
}

/** The scheme+host+port form browsers put in the Origin header, or null for junk. */
function normalize(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function createOriginMatcher(config: OriginConfig): OriginMatcher {
  const exact = new Set<string>();
  for (const origin of config.origins) {
    const normalized = normalize(origin);
    if (!normalized) throw new Error(`not a valid origin: ${origin}`);
    exact.add(normalized);
  }
  const patterns = (config.patterns ?? []).map(originPatternToRegExp);
  return (origin) => {
    const normalized = normalize(origin);
    if (!normalized) return false;
    if (exact.has(normalized)) return true;
    return patterns.some((re) => re.test(normalized));
  };
}
