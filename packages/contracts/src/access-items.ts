import { z } from 'zod';
import {
  ACCESS_ITEM_KINDS,
  ACCESS_ITEM_STATUSES,
  ACCESS_ITEM_TRANSACTION_TYPES,
} from '@portfolio/domain';
import { instantSchema } from './api.js';
import { entityIdSchema } from './portfolio.js';

export const createAccessItemRequestSchema = z.object({
  code: z.string().trim().min(1),
  kind: z.enum(ACCESS_ITEM_KINDS),
  propertyId: entityIdSchema,
  unitId: entityIdSchema.nullable().optional(),
  spaceId: entityIdSchema.nullable().optional(),
  label: z.string().trim().min(1),
});

export const issueAccessItemRequestSchema = z.object({
  tenancyId: entityIdSchema,
  occurredAt: instantSchema,
  note: z.string().trim().min(1).nullable().optional(),
});

export const updateAccessItemRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  label: z.string().trim().min(1),
});

export const retireAccessItemRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  retirementReason: z.string().trim().min(1),
});

export const accessItemCustodyEventRequestSchema = z.object({
  occurredAt: instantSchema,
  note: z.string().trim().min(1).nullable().optional(),
});

export const accessItemResponseSchema = z.object({
  id: entityIdSchema,
  code: z.string(),
  kind: z.enum(ACCESS_ITEM_KINDS),
  propertyId: entityIdSchema,
  unitId: entityIdSchema.nullable(),
  spaceId: entityIdSchema.nullable(),
  label: z.string(),
  status: z.enum(ACCESS_ITEM_STATUSES),
  retiredAt: instantSchema.nullable(),
  retiredByUserId: entityIdSchema.nullable(),
  retirementReason: z.string().nullable(),
  version: z.number().int().positive(),
  recordedAt: instantSchema,
  recordedByUserId: entityIdSchema,
});

export const accessItemTransactionResponseSchema = z.object({
  id: entityIdSchema,
  accessItemId: entityIdSchema,
  tenancyId: entityIdSchema,
  type: z.enum(ACCESS_ITEM_TRANSACTION_TYPES),
  sequence: z.number().int().positive(),
  occurredAt: instantSchema,
  recordedAt: instantSchema,
  recordedByUserId: entityIdSchema,
  note: z.string().nullable(),
});

export const accessItemStateResponseSchema = z.object({
  kind: z.enum(['available', 'issued', 'lost']),
  tenancyId: entityIdSchema.nullable(),
  lastTransaction: accessItemTransactionResponseSchema.nullable(),
});

export const accessItemEntryResponseSchema = z.object({
  item: accessItemResponseSchema,
  state: accessItemStateResponseSchema,
});

export const accessItemDetailResponseSchema = accessItemEntryResponseSchema.extend({
  transactions: z.array(accessItemTransactionResponseSchema),
});

export type CreateAccessItemRequest = z.infer<typeof createAccessItemRequestSchema>;
export type IssueAccessItemRequest = z.infer<typeof issueAccessItemRequestSchema>;
export type UpdateAccessItemRequest = z.infer<typeof updateAccessItemRequestSchema>;
export type RetireAccessItemRequest = z.infer<typeof retireAccessItemRequestSchema>;
export type AccessItemCustodyEventRequest = z.infer<
  typeof accessItemCustodyEventRequestSchema
>;
export type AccessItemResponse = z.infer<typeof accessItemResponseSchema>;
export type AccessItemTransactionResponse = z.infer<
  typeof accessItemTransactionResponseSchema
>;
export type AccessItemStateResponse = z.infer<typeof accessItemStateResponseSchema>;
export type AccessItemEntryResponse = z.infer<typeof accessItemEntryResponseSchema>;
export type AccessItemDetailResponse = z.infer<typeof accessItemDetailResponseSchema>;
