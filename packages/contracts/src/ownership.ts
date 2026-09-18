import { z } from 'zod';
import { entityIdSchema } from './portfolio.js';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createOwnershipPeriodRequestSchema = z.object({
  validFrom: isoDateSchema,
  validTo: isoDateSchema.nullable().optional(),
  owners: z.array(
    z.object({
      partyId: entityIdSchema,
      sharePercent: z.number().positive().max(100).multipleOf(0.01),
    }),
  ).min(1),
});

export const ownershipPeriodResponseSchema = z.object({
  id: entityIdSchema,
  unitId: entityIdSchema,
  validFrom: isoDateSchema,
  validTo: isoDateSchema.nullable(),
  owners: z.array(
    z.object({
      partyId: entityIdSchema,
      sharePercent: z.number().positive().max(100),
    }),
  ),
});

export type CreateOwnershipPeriodRequest = z.infer<
  typeof createOwnershipPeriodRequestSchema
>;
export type OwnershipPeriodResponse = z.infer<
  typeof ownershipPeriodResponseSchema
>;
