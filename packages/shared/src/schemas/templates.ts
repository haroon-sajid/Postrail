import { z } from 'zod';
import { MAX_BODY_CHARS } from '../constants';
import { uuidSchema } from './common';

export const templateSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,99}$/, 'slug is lowercase letters, digits and dashes');

export const createTemplateRequestSchema = z.object({
  slug: templateSlugSchema,
  subject: z.string().min(1).max(998),
  html: z.string().min(1).max(MAX_BODY_CHARS),
});
export type CreateTemplateRequest = z.infer<typeof createTemplateRequestSchema>;

export const updateTemplateRequestSchema = createTemplateRequestSchema
  .omit({ slug: true })
  .partial();
export type UpdateTemplateRequest = z.infer<typeof updateTemplateRequestSchema>;

export const templateSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  subject: z.string(),
  html: z.string(),
  /** Placeholder names found in subject and html; every send must supply them all. */
  variables: z.array(z.string()),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export type Template = z.infer<typeof templateSchema>;

export const templateListResponseSchema = z.object({ data: z.array(templateSchema) });
