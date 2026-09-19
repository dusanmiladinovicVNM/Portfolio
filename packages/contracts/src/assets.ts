import { z } from 'zod';
import {
  ASSET_IDENTIFIER_TYPES,
  ASSET_STATUSES,
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

export type CreateAssetRequest = z.infer<typeof createAssetRequestSchema>;
export type UpdateAssetMetadataRequest = z.infer<typeof updateAssetMetadataRequestSchema>;
export type ChangeAssetStatusRequest = z.infer<typeof changeAssetStatusRequestSchema>;
export type ReplaceAssetRequest = z.infer<typeof replaceAssetRequestSchema>;
export type AssetResponse = z.infer<typeof assetResponseSchema>;
export type AssetReplacementResponse = z.infer<typeof assetReplacementResponseSchema>;
