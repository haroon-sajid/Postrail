import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EnvError,
  findWorkspaceRoot,
  loadDotenv,
  loadEnv,
  resolveBrowserOrigins,
  resolveQueueConfig,
} from './env';

const DB_URL = 'postgresql://user:pw@host/neondb?sslmode=require';
const REQUIRED = {
  DATABASE_URL: DB_URL,
  TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  INTERNAL_SECRET: 'local-internal-secret-0123',
  BETTER_AUTH_SECRET: 'better-auth-secret-0123456789abcdef',
};

describe('loadEnv', () => {
  it('applies defaults when only the required variables are set', () => {
    const env = loadEnv(REQUIRED);
    expect(env).toEqual({
      ...REQUIRED,
      NODE_ENV: 'development',
      PORT: 8080,
      LOG_LEVEL: 'info',
      GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/google/callback',
      QUEUE_DRIVER: 'local',
      API_ORIGIN: 'http://localhost:8080',
      DASHBOARD_ORIGIN: 'http://localhost:5173',
    });
  });

  it('requires a long BETTER_AUTH_SECRET', () => {
    expect(() => loadEnv({ ...REQUIRED, BETTER_AUTH_SECRET: 'short' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it('requires INTERNAL_SECRET for the local queue driver', () => {
    const { INTERNAL_SECRET: _omit, ...withoutSecret } = REQUIRED;
    expect(() => loadEnv(withoutSecret)).toThrow(/INTERNAL_SECRET/);
    expect(() => loadEnv({ ...REQUIRED, INTERNAL_SECRET: 'short' })).toThrow(/INTERNAL_SECRET/);
  });

  it('requires the GCP variables for the cloudtasks driver', () => {
    expect(() => loadEnv({ ...REQUIRED, QUEUE_DRIVER: 'cloudtasks' })).toThrow(
      /GCP_PROJECT_ID[\s\S]*WORKER_URL/,
    );
    const cloud = loadEnv({
      ...REQUIRED,
      QUEUE_DRIVER: 'cloudtasks',
      GCP_PROJECT_ID: 'proj',
      GCP_REGION: 'us-central1',
      TASKS_QUEUE_NAME: 'send-email',
      WORKER_URL: 'https://api.example.com/internal/tasks/send-email',
      TASKS_SERVICE_ACCOUNT_EMAIL: 'tasks@proj.iam.gserviceaccount.com',
    });
    expect(resolveQueueConfig(cloud)).toEqual({
      driver: 'cloudtasks',
      projectId: 'proj',
      region: 'us-central1',
      queueName: 'send-email',
      workerUrl: 'https://api.example.com/internal/tasks/send-email',
      serviceAccountEmail: 'tasks@proj.iam.gserviceaccount.com',
    });
    expect(resolveQueueConfig(loadEnv(REQUIRED))).toEqual({
      driver: 'local',
      internalSecret: REQUIRED.INTERNAL_SECRET,
    });
  });

  it('coerces PORT to a number', () => {
    expect(loadEnv({ ...REQUIRED, PORT: '3000' }).PORT).toBe(3000);
  });

  it('fails fast with variable names but never values', () => {
    const secret = 'super-secret-value';
    let error: unknown;
    try {
      loadEnv({ PORT: secret, LOG_LEVEL: 'loud', TOKEN_ENCRYPTION_KEY: secret });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EnvError);
    const { message, problems } = error as EnvError;
    for (const name of [
      'DATABASE_URL',
      'PORT',
      'LOG_LEVEL',
      'TOKEN_ENCRYPTION_KEY',
      'GOOGLE_CLIENT_ID',
    ]) {
      expect(problems.some((p) => p.startsWith(name))).toBe(true);
    }
    expect(message).not.toContain(secret);
  });

  it('rejects a DATABASE_URL that is not postgres', () => {
    expect(() => loadEnv({ ...REQUIRED, DATABASE_URL: 'mysql://x' })).toThrow(EnvError);
  });

  it('rejects a short or non-hex TOKEN_ENCRYPTION_KEY', () => {
    expect(() => loadEnv({ ...REQUIRED, TOKEN_ENCRYPTION_KEY: 'abc' })).toThrow(EnvError);
    expect(() => loadEnv({ ...REQUIRED, TOKEN_ENCRYPTION_KEY: 'zz'.repeat(32) })).toThrow(EnvError);
  });

  it('rejects a GOOGLE_REDIRECT_URI that is not a URL', () => {
    expect(() => loadEnv({ ...REQUIRED, GOOGLE_REDIRECT_URI: 'callback' })).toThrow(EnvError);
  });

  it('resolves browser origins from DASHBOARD_ORIGIN, CORS_ORIGIN and CORS_ORIGIN_PATTERN', () => {
    expect(resolveBrowserOrigins(loadEnv(REQUIRED))).toEqual({
      origins: ['http://localhost:5173'],
      patterns: [],
    });
    const env = loadEnv({
      ...REQUIRED,
      DASHBOARD_ORIGIN: 'https://postrail.haroonsajid-ai.workers.dev',
      CORS_ORIGIN: 'https://postrail.haroonsajid-ai.workers.dev/, https://staging.example.com ,',
      CORS_ORIGIN_PATTERN: 'https://*-postrail.haroonsajid-ai.workers.dev',
    });
    expect(resolveBrowserOrigins(env)).toEqual({
      origins: ['https://postrail.haroonsajid-ai.workers.dev', 'https://staging.example.com'],
      patterns: ['https://*-postrail.haroonsajid-ai.workers.dev'],
    });
  });

  it('requires API_ORIGIN and DASHBOARD_ORIGIN in production', () => {
    let error: unknown;
    try {
      loadEnv({ ...REQUIRED, NODE_ENV: 'production' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EnvError);
    const { problems } = error as EnvError;
    expect(problems).toContain('API_ORIGIN: required in production');
    expect(problems).toContain('DASHBOARD_ORIGIN: required in production');
  });

  it('requires https origins in production', () => {
    expect(() =>
      loadEnv({
        ...REQUIRED,
        NODE_ENV: 'production',
        API_ORIGIN: 'http://postrail-api.onrender.com',
        DASHBOARD_ORIGIN: 'http://postrail.haroonsajid-ai.workers.dev',
      }),
    ).toThrow(/API_ORIGIN: must use https in production[\s\S]*DASHBOARD_ORIGIN: must use https/);
  });

  it('accepts https origins in production and keeps them as given', () => {
    const env = loadEnv({
      ...REQUIRED,
      NODE_ENV: 'production',
      API_ORIGIN: 'https://postrail-api.onrender.com',
      DASHBOARD_ORIGIN: 'https://postrail.haroonsajid-ai.workers.dev',
    });
    expect(env.API_ORIGIN).toBe('https://postrail-api.onrender.com');
    expect(env.DASHBOARD_ORIGIN).toBe('https://postrail.haroonsajid-ai.workers.dev');
  });

  it('still defaults both origins to localhost outside production', () => {
    expect(loadEnv({ ...REQUIRED, NODE_ENV: 'test' })).toMatchObject({
      API_ORIGIN: 'http://localhost:8080',
      DASHBOARD_ORIGIN: 'http://localhost:5173',
    });
  });

  it('rejects CORS_ORIGIN entries that are not bare origins', () => {
    expect(() => loadEnv({ ...REQUIRED, CORS_ORIGIN: 'https://a.example/app' })).toThrow(
      /CORS_ORIGIN:/,
    );
    expect(() => loadEnv({ ...REQUIRED, CORS_ORIGIN: 'a.example' })).toThrow(/CORS_ORIGIN:/);
  });

  it('rejects CORS_ORIGIN_PATTERN entries without a wildcard or scheme', () => {
    expect(() => loadEnv({ ...REQUIRED, CORS_ORIGIN_PATTERN: 'https://a.example' })).toThrow(
      /CORS_ORIGIN_PATTERN/,
    );
    expect(() => loadEnv({ ...REQUIRED, CORS_ORIGIN_PATTERN: '*.example' })).toThrow(
      /CORS_ORIGIN_PATTERN/,
    );
  });
});

describe('findWorkspaceRoot', () => {
  it('finds the monorepo root from a package directory', () => {
    const root = findWorkspaceRoot(import.meta.dirname);
    expect(root).toBeDefined();
    expect(join(root ?? '', 'pnpm-workspace.yaml')).toMatch(/pnpm-workspace\.yaml$/);
  });

  it('returns undefined outside the repo', () => {
    expect(findWorkspaceRoot(tmpdir())).toBeUndefined();
  });
});

describe('loadDotenv', () => {
  const KEY = 'POSTRAIL_TEST_DOTENV';
  let dir: string;

  afterEach(() => {
    delete process.env[KEY];
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads variables from <root>/.env', () => {
    dir = mkdtempSync(join(tmpdir(), 'postrail-env-'));
    writeFileSync(join(dir, '.env'), `${KEY}=from-file\n`);
    loadDotenv(dir);
    expect(process.env[KEY]).toBe('from-file');
  });

  it('does not override variables already in the environment', () => {
    dir = mkdtempSync(join(tmpdir(), 'postrail-env-'));
    writeFileSync(join(dir, '.env'), `${KEY}=from-file\n`);
    process.env[KEY] = 'from-env';
    loadDotenv(dir);
    expect(process.env[KEY]).toBe('from-env');
  });

  it('is a no-op when there is no .env file', () => {
    dir = mkdtempSync(join(tmpdir(), 'postrail-env-'));
    expect(() => loadDotenv(dir)).not.toThrow();
    expect(process.env[KEY]).toBeUndefined();
  });
});
