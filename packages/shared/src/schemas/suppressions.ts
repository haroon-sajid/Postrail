import { z } from 'zod';
import { SUPPRESSION_REASONS } from '../constants';

export const createSuppressionRequestSchema = z.object({
  email: z.email(),
  reason: z.enum(SUPPRESSION_REASONS).default('manual'),
});
export type CreateSuppressionRequest = z.infer<typeof createSuppressionRequestSchema>;

export const suppressionEmailParamSchema = z.object({ email: z.email() });

export const suppressionSchema = z.object({
  email: z.email(),
  reason: z.string(),
  created_at: z.iso.datetime(),
});
export type Suppression = z.infer<typeof suppressionSchema>;

export const suppressionListResponseSchema = z.object({ data: z.array(suppressionSchema) });

export const importSuppressionsRequestSchema = z.object({
  emails: z.array(z.email()).min(1).max(1000),
  reason: z.enum(SUPPRESSION_REASONS).default('manual'),
});
export type ImportSuppressionsRequest = z.infer<typeof importSuppressionsRequestSchema>;

export const importSuppressionsResponseSchema = z.object({
  added: z.number().int(),
  skipped: z.number().int(),
});
