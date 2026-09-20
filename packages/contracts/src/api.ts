import { z } from 'zod';

const EXPLICIT_OFFSET_INSTANT =
  /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,9})?)?(?:Z|[+-]\\d{2}:\\d{2})$/;

export const instantSchema = z
  .string()
  .trim()
  .regex(
    EXPLICIT_OFFSET_INSTANT,
    'Timestamp must include an explicit UTC offset.',
  )
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Timestamp must be a valid ISO instant.',
  })
  .transform((value) => new Date(value).toISOString());


export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
