import { z } from 'zod';
import {
  ASSET_CONDITIONS,
  ASSET_IDENTIFIER_TYPES,
  ASSET_LOCATION_CHANGE_TYPES,
  ASSET_STATUSES,
  TENANCY_ASSET_PHASES,
  TENANCY_ASSET_PRESENCE,
} from '@portfolio/domain';
import { entityIdSchema } from './portfolio.js';

const mutableAssetStatusSchema = z.enum(['active', 'inactive', 'retired']);

export const assetIdentifierRequestSchema = z.object({
  identifierType: z.enum(ASSET_IDENTIFIER_TYPES),
  value: z.string().trim().min(1),
  label: z.string().trim().min(1).nullable().optional(),
});

export const createAssetRequestSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  propertyId: entityIdSchema,
  unitId: entityIdSchema.nullable().optional(),
  spaceId: entityIdSchema.nullable().optional(),
  manufacturer: z.string().trim().min(1).nullable().optional(),
  model: z.string().trim().min(1).nullable().optional(),
  identifiers: z.array(assetIdentifierRequestSchema).optional(),
});

export const updateAssetMetadataRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().trim().min(1).optional(),
  manufacturer: z.string().trim().min(1).nullable().optional(),
  model: z.string().trim().min(1).nullable().optional(),
}).refine(
  (value) =>
    value.name !== undefined ||
    value.manufacturer !== undefined ||
    value.model !== undefined,
  { message: 'At least one metadata field is required.' },
);

export const moveAssetRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  propertyId: entityIdSchema,
  unitId: entityIdSchema.nullable().optional(),
  spaceId: entityIdSchema.nullable().optional(),
  reason: z.string().trim().min(1).nullable().optional(),
});

export const changeAssetStatusRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  status: mutableAssetStatusSchema,
});

export const replaceAssetRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  manufacturer: z.string().trim().min(1).nullable().optional(),
  model: z.string().trim().min(1).nullable().optional(),
  identifiers: z.array(assetIdentifierRequestSchema).optional(),
});

export const assessAssetConditionRequestSchema = z.object({
  condition: z.enum(ASSET_CONDITIONS),
  notes: z.string().trim().min(1).nullable().optional(),
});

export const assignTenancyAssetRequestSchema = z.object({
  assetId: entityIdSchema,
});

export const recordTenancyAssetInventoryRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  phase: z.enum(TENANCY_ASSET_PHASES),
  presence: z.enum(TENANCY_ASSET_PRESENCE),
  condition: z.enum(ASSET_CONDITIONS).nullable().optional(),
  notes: z.string().trim().min(1).nullable().optional(),
});

export const assetIdentifierResponseSchema = z.object({
  id: entityIdSchema,
  assetId: entityIdSchema,
  identifierType: z.enum(ASSET_IDENTIFIER_TYPES),
  value: z.string(),
  label: z.string().nullable(),
});

export const assetResponseSchema = z.object({
  id: entityIdSchema,
  code: z.string(),
  name: z.string(),
  propertyId: entityIdSchema,
  unitId: entityIdSchema.nullable(),
  spaceId: entityIdSchema.nullable(),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(ASSET_STATUSES),
  version: z.number().int().positive(),
  identifiers: z.array(assetIdentifierResponseSchema),
});

export const assetReplacementResponseSchema = z.object({
  id: entityIdSchema,
  replacedAssetId: entityIdSchema,
  replacementAssetId: entityIdSchema,
  replacedByUserId: entityIdSchema,
  replacedAt: z.string(),
});

export const assetLocationHistoryResponseSchema = z.object({
  id: entityIdSchema,
  assetId: entityIdSchema,
  propertyId: entityIdSchema,
  unitId: entityIdSchema.nullable(),
  spaceId: entityIdSchema.nullable(),
  validFrom: z.string(),
  validTo: z.string().nullable(),
  changeType: z.enum(ASSET_LOCATION_CHANGE_TYPES),
  changedByUserId: entityIdSchema.nullable(),
  reason: z.string().nullable(),
});

export const assetConditionAssessmentResponseSchema = z.object({
  id: entityIdSchema,
  assetId: entityIdSchema,
  condition: z.enum(ASSET_CONDITIONS),
  assessedAt: z.string(),
  assessedByUserId: entityIdSchema,
  notes: z.string().nullable(),
});

export const tenancyAssetInventorySnapshotResponseSchema = z.object({
  phase: z.enum(TENANCY_ASSET_PHASES),
  presence: z.enum(TENANCY_ASSET_PRESENCE),
  conditionAssessmentId: entityIdSchema.nullable(),
  recordedAt: z.string(),
  recordedByUserId: entityIdSchema,
  notes: z.string().nullable(),
});

export const tenancyAssetAssignmentResponseSchema = z.object({
  id: entityIdSchema,
  tenancyId: entityIdSchema,
  assetId: entityIdSchema,
  assignedAt: z.string(),
  assignedByUserId: entityIdSchema,
  version: z.number().int().positive(),
  moveIn: tenancyAssetInventorySnapshotResponseSchema.nullable(),
  moveOut: tenancyAssetInventorySnapshotResponseSchema.nullable(),
});

export type CreateAssetRequest = z.infer<typeof createAssetRequestSchema>;
export type UpdateAssetMetadataRequest = z.infer<typeof updateAssetMetadataRequestSchema>;
export type MoveAssetRequest = z.infer<typeof moveAssetRequestSchema>;
export type ChangeAssetStatusRequest = z.infer<typeof changeAssetStatusRequestSchema>;
export type ReplaceAssetRequest = z.infer<typeof replaceAssetRequestSchema>;
export type AssessAssetConditionRequest = z.infer<typeof assessAssetConditionRequestSchema>;
export type AssignTenancyAssetRequest = z.infer<typeof assignTenancyAssetRequestSchema>;
export type RecordTenancyAssetInventoryRequest = z.infer<typeof recordTenancyAssetInventoryRequestSchema>;
export type AssetResponse = z.infer<typeof assetResponseSchema>;
export type AssetReplacementResponse = z.infer<typeof assetReplacementResponseSchema>;
export type AssetLocationHistoryResponse = z.infer<typeof assetLocationHistoryResponseSchema>;
export type AssetConditionAssessmentResponse = z.infer<typeof assetConditionAssessmentResponseSchema>;
export type TenancyAssetAssignmentResponse = z.infer<typeof tenancyAssetAssignmentResponseSchema>;
