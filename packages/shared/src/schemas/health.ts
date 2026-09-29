import { z } from 'zod';

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
