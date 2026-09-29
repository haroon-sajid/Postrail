import { z } from 'zod';

export const uuidSchema = z.uuid();

export const idParamSchema = z.object({ id: uuidSchema });
export type IdParam = z.infer<typeof idParamSchema>;
