import { z } from 'zod';
import { hasExplicitInstantOffset } from '@portfolio/domain';

export const instantSchema = z
  .string()
  .trim()
  .refine(hasExplicitInstantOffset, {
    message: 'Timestamp must be a valid ISO instant with an explicit UTC offset.',
  })
  .transform((value) => new Date(value).toISOString());

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
