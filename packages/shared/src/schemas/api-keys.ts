import { z } from 'zod';
import { uuidSchema } from './common';

export const createApiKeyRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;

export const apiKeySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  /** Recognisable head of the key, e.g. `pr_live_AbCdEfGh`. */
  prefix: z.string(),
  created_at: z.iso.datetime(),
  last_used_at: z.iso.datetime().nullable(),
  revoked_at: z.iso.datetime().nullable(),
  created_by: z.object({ id: uuidSchema, email: z.email() }).nullable(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/** Only the create response carries the full key. It is never retrievable later. */
export const apiKeyCreatedSchema = apiKeySchema.extend({ key: z.string() });
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;

export const apiKeyListResponseSchema = z.object({ data: z.array(apiKeySchema) });
