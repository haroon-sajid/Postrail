import { type Env } from '@postrail/shared';

/**
 * Deploys set APP_VERSION to the git SHA. Locally, pnpm exposes the package.json version
 * to scripts as npm_package_version. The last fallback only shows up in odd setups.
 */
export function resolveVersion(env: Pick<Env, 'APP_VERSION'>): string {
  return env.APP_VERSION ?? process.env.npm_package_version ?? '0.0.0';
}
