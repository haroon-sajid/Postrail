import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'dotenv';
import { z } from 'zod';
import { WORKSPACE_ROOT_MARKER } from './constants';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z
    .string()
    .startsWith('postgres', 'must be a postgres:// or postgresql:// connection string'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  APP_VERSION: z.string().min(1).optional(),
  /** AES-256-GCM key for mailbox tokens. 32 bytes as hex: `openssl rand -hex 32`. */
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'must be 32 bytes as 64 hex characters (openssl rand -hex 32)'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.url().default('http://localhost:3000/api/google/callback'),

  /** `local` runs jobs in-process (dev, tests); `cloudtasks` uses Google Cloud Tasks. */
  QUEUE_DRIVER: z.enum(['local', 'cloudtasks']).default('local'),
  GCP_PROJECT_ID: z.string().min(1).optional(),
  GCP_REGION: z.string().min(1).optional(),
  TASKS_QUEUE_NAME: z.string().min(1).optional(),
  /** Full URL of POST /internal/tasks/send-email on the deployed API. */
  WORKER_URL: z.url().optional(),
  /** Service account Cloud Tasks and Cloud Scheduler sign OIDC tokens as. */
  TASKS_SERVICE_ACCOUNT_EMAIL: z.email().optional(),
  /** Bearer secret for /internal/* when QUEUE_DRIVER=local. */
  INTERNAL_SECRET: z.string().min(16, 'must be at least 16 characters').optional(),
});

const CLOUD_TASKS_VARS = [
  'GCP_PROJECT_ID',
  'GCP_REGION',
  'TASKS_QUEUE_NAME',
  'WORKER_URL',
  'TASKS_SERVICE_ACCOUNT_EMAIL',
] as const;

/** The base schema plus the cross-field rule: each queue driver has its own required vars. */
export const envSchemaWithRules = envSchema.superRefine((env, ctx) => {
  const required =
    env.QUEUE_DRIVER === 'cloudtasks' ? CLOUD_TASKS_VARS : (['INTERNAL_SECRET'] as const);
  for (const name of required) {
    if (env[name] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [name],
        message: `required when QUEUE_DRIVER=${env.QUEUE_DRIVER}`,
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export type QueueConfig =
  | { driver: 'local'; internalSecret: string }
  | {
      driver: 'cloudtasks';
      projectId: string;
      region: string;
      queueName: string;
      workerUrl: string;
      serviceAccountEmail: string;
    };

/** Narrows the optional queue vars into one typed config. Safe after loadEnv validated them. */
export function resolveQueueConfig(env: Env): QueueConfig {
  if (env.QUEUE_DRIVER === 'local') {
    return { driver: 'local', internalSecret: env.INTERNAL_SECRET ?? '' };
  }
  return {
    driver: 'cloudtasks',
    projectId: env.GCP_PROJECT_ID ?? '',
    region: env.GCP_REGION ?? '',
    queueName: env.TASKS_QUEUE_NAME ?? '',
    workerUrl: env.WORKER_URL ?? '',
    serviceAccountEmail: env.TASKS_SERVICE_ACCOUNT_EMAIL ?? '',
  };
}

export type EnvSource = Record<string, string | undefined>;

/** Thrown when required variables are missing or malformed. Carries names only, never values. */
export class EnvError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

/** Validates a raw variable map. Pure, so tests can pass their own source. */
export function loadEnv(source: EnvSource = process.env): Env {
  const result = envSchemaWithRules.safeParse(source);
  if (result.success) return result.data;
  // The message ends up in logs, so it names the variable and the rule but never the value.
  const problems = result.error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  throw new EnvError(problems);
}

/** Walks up from `start` until it finds the workspace marker. Undefined when not in the repo. */
export function findWorkspaceRoot(start: string = process.cwd()): string | undefined {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, WORKSPACE_ROOT_MARKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Loads `<root>/.env` into process.env without overriding variables that are already set,
 * so a real environment (CI, Cloud Run) always wins over the local file.
 */
export function loadDotenv(rootDir: string | undefined = findWorkspaceRoot()): void {
  if (!rootDir) return;
  const file = join(rootDir, '.env');
  if (!existsSync(file)) return;
  for (const [key, value] of Object.entries(parse(readFileSync(file, 'utf8')))) {
    process.env[key] ??= value;
  }
}

let cached: Env | undefined;

/** Process-wide env. Reads the root .env once, then validates. Throws EnvError to fail fast. */
export function getEnv(): Env {
  if (!cached) {
    loadDotenv();
    cached = loadEnv();
  }
  return cached;
}

/** Test hook: forget the cached env so the next getEnv() re-reads. */
export function resetEnvCache(): void {
  cached = undefined;
}
