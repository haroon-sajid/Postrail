import { z } from 'zod';

// Shapes of Google's responses. Parsed strictly enough to fail loudly on surprises.

export const googleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});
export type GoogleTokenResponse = z.infer<typeof googleTokenResponseSchema>;

export const googleErrorResponseSchema = z.object({
  error: z.string().min(1),
  error_description: z.string().optional(),
});

export const googleUserInfoSchema = z.object({
  email: z.email(),
  email_verified: z.boolean().optional(),
});

export const gmailSendResponseSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().optional(),
});
