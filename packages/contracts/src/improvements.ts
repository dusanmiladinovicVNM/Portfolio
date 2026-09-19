import { z } from 'zod';
import {
  IMPROVEMENT_PROJECT_STATUSES,
  PROJECT_ASSET_ACTIONS,
  WORK_ITEM_STATUSES,
  WORK_MATERIAL_UNITS,
} from '@portfolio/domain';
import { entityIdSchema } from './portfolio.js';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestampSchema = z.string().min(1);
const quantitySchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
  .refine((value) => !/^0(?:\.0+)?$/.test(value));

export const createImprovementProjectRequestSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  propertyId: entityIdSchema,
  unitId: entityIdSchema.nullable().optional(),
  spaceId: entityIdSchema.nullable().optional(),
  plannedStartOn: isoDateSchema.nullable().optional(),
  plannedEndOn: isoDateSchema.nullable().optional(),
});

export const updateImprovementProjectPlanRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  plannedStartOn: isoDateSchema.nullable().optional(),
  plannedEndOn: isoDateSchema.nullable().optional(),
});

export const changeImprovementProjectStatusRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  action: z.enum(['plan', 'start', 'complete', 'cancel']),
});

export const createWorkItemRequestSchema = z.object({
  code: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
});

export const updateWorkItemPlanRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
});

export const changeWorkItemStatusRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  action: z.enum(['start', 'complete', 'cancel']),
});

export const workMaterialRequestSchema = z.object({
  name: z.string().trim().min(1),
  reference: z.string().trim().min(1).nullable().optional(),
  quantity: quantitySchema,
  unit: z.enum(WORK_MATERIAL_UNITS),
  notes: z.string().trim().min(1).nullable().optional(),
});

export const projectAssetRequestSchema = z.object({
  assetId: entityIdSchema,
  action: z.enum(PROJECT_ASSET_ACTIONS),
  notes: z.string().trim().min(1).nullable().optional(),
});

export const recordWorkRequestSchema = z.object({
  performedAt: timestampSchema,
  contractorPartyId: entityIdSchema.nullable().optional(),
  description: z.string().trim().min(1),
  reference: z.string().trim().min(1).nullable().optional(),
  materials: z.array(workMaterialRequestSchema).optional(),
  assets: z.array(projectAssetRequestSchema).optional(),
});

export const improvementProjectResponseSchema = z.object({
  id: entityIdSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  propertyId: entityIdSchema,
  unitId: entityIdSchema.nullable(),
  spaceId: entityIdSchema.nullable(),
  plannedStartOn: isoDateSchema.nullable(),
  plannedEndOn: isoDateSchema.nullable(),
  status: z.enum(IMPROVEMENT_PROJECT_STATUSES),
  plannedAt: timestampSchema.nullable(),
  startedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  cancelledAt: timestampSchema.nullable(),
  version: z.number().int().positive(),
  createdAt: timestampSchema,
  createdByUserId: entityIdSchema,
});

export const workItemResponseSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(WORK_ITEM_STATUSES),
  startedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  cancelledAt: timestampSchema.nullable(),
  version: z.number().int().positive(),
  createdAt: timestampSchema,
  createdByUserId: entityIdSchema,
});

export const workMaterialResponseSchema = z.object({
  id: entityIdSchema,
  workRecordId: entityIdSchema,
  name: z.string(),
  reference: z.string().nullable(),
  quantity: z.string(),
  unit: z.enum(WORK_MATERIAL_UNITS),
  notes: z.string().nullable(),
});

export const projectAssetResponseSchema = z.object({
  id: entityIdSchema,
  workRecordId: entityIdSchema,
  assetId: entityIdSchema,
  action: z.enum(PROJECT_ASSET_ACTIONS),
  notes: z.string().nullable(),
});

export const workRecordResponseSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  workItemId: entityIdSchema,
  contractorPartyId: entityIdSchema.nullable(),
  performedAt: timestampSchema,
  description: z.string(),
  reference: z.string().nullable(),
  materials: z.array(workMaterialResponseSchema),
  assets: z.array(projectAssetResponseSchema),
  recordedAt: timestampSchema,
  recordedByUserId: entityIdSchema,
});

export type CreateImprovementProjectRequest = z.infer<
  typeof createImprovementProjectRequestSchema
>;
export type UpdateImprovementProjectPlanRequest = z.infer<
  typeof updateImprovementProjectPlanRequestSchema
>;
export type ChangeImprovementProjectStatusRequest = z.infer<
  typeof changeImprovementProjectStatusRequestSchema
>;
export type CreateWorkItemRequest = z.infer<typeof createWorkItemRequestSchema>;
export type UpdateWorkItemPlanRequest = z.infer<
  typeof updateWorkItemPlanRequestSchema
>;
export type ChangeWorkItemStatusRequest = z.infer<
  typeof changeWorkItemStatusRequestSchema
>;
export type RecordWorkRequest = z.infer<typeof recordWorkRequestSchema>;
export type ImprovementProjectResponse = z.infer<
  typeof improvementProjectResponseSchema
>;
export type WorkItemResponse = z.infer<typeof workItemResponseSchema>;
export type WorkRecordResponse = z.infer<typeof workRecordResponseSchema>;
