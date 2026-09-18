import { z } from 'zod';

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
