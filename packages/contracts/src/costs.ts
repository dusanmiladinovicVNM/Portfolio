import { z } from 'zod';
import { COST_REPORTING_CLASSES } from '@portfolio/domain';
import { entityIdSchema } from './portfolio.js';

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestampSchema = z.string().min(1);
const moneySchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d{0,15})(?:\.\d{1,2})?$/);
const currencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/);

export const costSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('property'), propertyId: entityIdSchema }),
  z.object({ kind: z.literal('unit'), unitId: entityIdSchema }),
  z.object({ kind: z.literal('space'), spaceId: entityIdSchema }),
  z.object({ kind: z.literal('asset'), assetId: entityIdSchema }),
  z.object({
    kind: z.literal('warranty_claim'),
    warrantyClaimId: entityIdSchema,
  }),
  z.object({
    kind: z.literal('service_event'),
    serviceEventId: entityIdSchema,
  }),
  z.object({
    kind: z.literal('improvement_project'),
    improvementProjectId: entityIdSchema,
  }),
  z.object({ kind: z.literal('work_item'), workItemId: entityIdSchema }),
  z.object({ kind: z.literal('work_record'), workRecordId: entityIdSchema }),
  z.object({
    kind: z.literal('work_material'),
    workMaterialId: entityIdSchema,
  }),
]);

export const createCostRequestSchema = z.object({
  source: costSourceSchema,
  description: z.string().trim().min(1),
  amount: moneySchema,
  currency: currencySchema,
  incurredOn: dateOnlySchema,
  reportingClass: z.enum(COST_REPORTING_CLASSES),
  supplierPartyId: entityIdSchema.nullable().optional(),
  invoiceReference: z.string().trim().min(1).nullable().optional(),
});

export const reverseCostRequestSchema = z.object({
  reason: z.string().trim().min(1),
});

export const correctCostRequestSchema = z.object({
  reason: z.string().trim().min(1),
  replacement: createCostRequestSchema,
});

export const costResponseSchema = z.object({
  id: entityIdSchema,
  source: costSourceSchema,
  description: z.string(),
  amount: z.string(),
  currency: z.string(),
  incurredOn: dateOnlySchema,
  reportingClass: z.enum(COST_REPORTING_CLASSES),
  supplierPartyId: entityIdSchema.nullable(),
  invoiceReference: z.string().nullable(),
  recordedAt: timestampSchema,
  recordedByUserId: entityIdSchema,
});

export const costReversalResponseSchema = z.object({
  id: entityIdSchema,
  costId: entityIdSchema,
  replacementCostId: entityIdSchema.nullable(),
  reason: z.string(),
  recordedAt: timestampSchema,
  recordedByUserId: entityIdSchema,
});

export const costLedgerEntryResponseSchema = z.object({
  cost: costResponseSchema,
  reversal: costReversalResponseSchema.nullable(),
});

export type CostSourceDto = z.infer<typeof costSourceSchema>;
export type CreateCostRequest = z.infer<typeof createCostRequestSchema>;
export type ReverseCostRequest = z.infer<typeof reverseCostRequestSchema>;
export type CorrectCostRequest = z.infer<typeof correctCostRequestSchema>;
export type CostResponse = z.infer<typeof costResponseSchema>;
export type CostReversalResponse = z.infer<typeof costReversalResponseSchema>;
export type CostLedgerEntryResponse = z.infer<
  typeof costLedgerEntryResponseSchema
>;
