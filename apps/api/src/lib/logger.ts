import { pino, type Logger } from 'pino';

export type { Logger };

/**
 * Keys that must never reach the logs, wherever they appear in a log object.
 * Email bodies are never passed to the logger in the first place; this is the safety net.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.password',
  '*.clientSecret',
  '*.html',
  '*.text',
];

/** JSON logs to stdout. Cloud Run picks them up as structured entries. */
export function createLogger(level: string): Logger {
  return pino({ level, redact: { paths: REDACT_PATHS, censor: '[redacted]' } });
}

/** For tests: a logger that produces no output. */
export function silentLogger(): Logger {
  return pino({ level: 'silent' });
}
