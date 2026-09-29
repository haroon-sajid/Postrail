import { z } from 'zod';

/** Stable, machine-readable error codes. Clients branch on these, not on messages. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'SUPPRESSED',
  'NO_MAILBOX',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** The one shape every API error response has. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
