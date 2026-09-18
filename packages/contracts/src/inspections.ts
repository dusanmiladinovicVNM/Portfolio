import { z } from 'zod';
import {
  INSPECTION_CONDITION_OPERATORS,
  INSPECTION_EVIDENCE_TYPES,
  INSPECTION_FINDING_SEVERITIES,
  INSPECTION_ITEM_TYPES,
  INSPECTION_SIGNATURE_STATUSES,
  INSPECTION_SIGNER_ROLES,
  INSPECTION_SIGNER_TYPES,
  INSPECTION_SCHEMA_STATUSES,
  INSPECTION_STATUSES,
  INSPECTION_TYPES,
  type InspectionCondition,
} from '@portfolio/domain';
import { entityIdSchema } from './portfolio.js';

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const conditionValueSchema = z.union([
  z.string(),
  z.boolean(),
  z.array(z.union([z.string(), z.boolean()])),
]);

export const inspectionConditionSchema: z.ZodType<InspectionCondition> = z.lazy(
  () =>
    z.union([
      z.object({
        fieldKey: z.string().trim().min(1),
        operator: z.enum(INSPECTION_CONDITION_OPERATORS),
        value: conditionValueSchema.optional(),
      }),
      z.object({
        all: z.array(inspectionConditionSchema).min(1),
      }),
      z.object({
        any: z.array(inspectionConditionSchema).min(1),
      }),
    ]),
);

const optionSchema = z.object({
  value: z.string().trim().min(1),
  label: z.string().trim().min(1),
});

const schemaItemRequestSchema = z.object({
  key: z.string().trim().min(1),
  type: z.enum(INSPECTION_ITEM_TYPES),
  label: z.string().trim().min(1),
  required: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative(),
  options: z.array(optionSchema).optional(),
  visibleWhen: inspectionConditionSchema.nullable().optional(),
  requiredWhen: inspectionConditionSchema.nullable().optional(),
});

const schemaSectionRequestSchema = z.object({
  key: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  sortOrder: z.number().int().nonnegative(),
  items: z.array(schemaItemRequestSchema).min(1),
});

export const createInspectionSchemaVersionRequestSchema = z.object({
  schemaCode: z.string().trim().min(1),
  inspectionType: z.enum(INSPECTION_TYPES),
  title: z.string().trim().min(1),
  sections: z.array(schemaSectionRequestSchema).min(1),
});

export const createInspectionRequestSchema = z.object({
  code: z.string().trim().min(1),
  inspectionType: z.enum(INSPECTION_TYPES),
  tenancyId: entityIdSchema.nullable().optional(),
  schemaVersionId: entityIdSchema,
  assignedToUserId: entityIdSchema.optional(),
  scheduledFor: dateOnlySchema.nullable().optional(),
});

export const expectedInspectionVersionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const saveInspectionSectionRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    set: z
      .array(
        z.object({
          itemId: entityIdSchema,
          value: z.union([z.string(), z.boolean(), z.array(z.string())]),
          comment: z.string().nullable().optional(),
        }),
      )
      .default([]),
    clear: z.array(entityIdSchema).default([]),
  })
  .refine((value) => value.set.length > 0 || value.clear.length > 0, {
    message: 'Section patch must set or clear at least one item.',
  });

export const createInspectionFindingRequestSchema = z.object({
  sectionId: entityIdSchema,
  itemId: entityIdSchema.nullable().optional(),
  severity: z.enum(INSPECTION_FINDING_SEVERITIES),
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
});

export const inspectionResponseSchema = z.object({
  id: entityIdSchema,
  code: z.string(),
  inspectionType: z.enum(INSPECTION_TYPES),
  unitId: entityIdSchema,
  tenancyId: entityIdSchema.nullable(),
  schemaVersionId: entityIdSchema,
  assignedToUserId: entityIdSchema,
  createdByUserId: entityIdSchema,
  scheduledFor: dateOnlySchema.nullable(),
  status: z.enum(INSPECTION_STATUSES),
  startedAt: z.string().nullable(),
  lockedAt: z.string().nullable(),
  finalizedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  version: z.number().int().positive(),
  contentRevision: z.number().int().nonnegative(),
});

const schemaItemResponseSchema = z.object({
  id: entityIdSchema,
  sectionId: entityIdSchema,
  key: z.string(),
  type: z.enum(INSPECTION_ITEM_TYPES),
  label: z.string(),
  required: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  options: z.array(optionSchema),
  visibleWhen: inspectionConditionSchema.nullable(),
  requiredWhen: inspectionConditionSchema.nullable(),
});

const schemaSectionResponseSchema = z.object({
  id: entityIdSchema,
  key: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  items: z.array(schemaItemResponseSchema),
});

export const inspectionSchemaVersionResponseSchema = z.object({
  id: entityIdSchema,
  schemaCode: z.string(),
  versionNumber: z.number().int().positive(),
  inspectionType: z.enum(INSPECTION_TYPES),
  title: z.string(),
  status: z.enum(INSPECTION_SCHEMA_STATUSES),
  sections: z.array(schemaSectionResponseSchema),
});

export const inspectionItemResponseSchema = z.object({
  id: entityIdSchema,
  inspectionId: entityIdSchema,
  sectionId: entityIdSchema,
  itemId: entityIdSchema,
  value: z.union([z.string(), z.boolean(), z.array(z.string())]),
  comment: z.string().nullable(),
  updatedByUserId: entityIdSchema,
  updatedAt: z.string(),
});

export const inspectionFindingResponseSchema = z.object({
  id: entityIdSchema,
  inspectionId: entityIdSchema,
  sectionId: entityIdSchema,
  itemId: entityIdSchema.nullable(),
  severity: z.enum(INSPECTION_FINDING_SEVERITIES),
  title: z.string(),
  description: z.string().nullable(),
  createdByUserId: entityIdSchema,
  createdAt: z.string(),
});

export const inspectionSectionStateResponseSchema = z.object({
  sectionId: entityIdSchema,
  revision: z.number().int().nonnegative(),
});

export type CreateInspectionSchemaVersionRequest = z.infer<
  typeof createInspectionSchemaVersionRequestSchema
>;
export type CreateInspectionRequest = z.infer<typeof createInspectionRequestSchema>;
export type InspectionResponseDto = z.infer<typeof inspectionResponseSchema>;
export type InspectionSchemaVersionResponse = z.infer<
  typeof inspectionSchemaVersionResponseSchema
>;
export type InspectionItemResponse = z.infer<typeof inspectionItemResponseSchema>;
export type InspectionFindingResponse = z.infer<
  typeof inspectionFindingResponseSchema
>;

export const addInspectionEvidenceRequestSchema = z.object({
  documentVersionId: entityIdSchema,
  evidenceType: z.enum(INSPECTION_EVIDENCE_TYPES),
  sectionId: entityIdSchema.nullable().optional(),
  itemId: entityIdSchema.nullable().optional(),
  caption: z.string().nullable().optional(),
});

export const addInspectionSignatureRequestSchema = z.object({
  role: z.enum(INSPECTION_SIGNER_ROLES),
  signerType: z.enum(INSPECTION_SIGNER_TYPES),
  signerUserId: entityIdSchema.nullable().optional(),
  signerPartyId: entityIdSchema.nullable().optional(),
  externalSignerName: z.string().nullable().optional(),
  signatureDocumentVersionId: entityIdSchema,
  signedAt: z.string().optional(),
});

export const unlockInspectionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1),
});

export const inspectionEvidenceResponseSchema = z.object({
  id: entityIdSchema,
  inspectionId: entityIdSchema,
  documentVersionId: entityIdSchema,
  evidenceType: z.enum(INSPECTION_EVIDENCE_TYPES),
  sectionId: entityIdSchema.nullable(),
  itemId: entityIdSchema.nullable(),
  caption: z.string().nullable(),
  createdByUserId: entityIdSchema,
  createdAt: z.string(),
});

export const inspectionSignatureResponseSchema = z.object({
  id: entityIdSchema,
  inspectionId: entityIdSchema,
  role: z.enum(INSPECTION_SIGNER_ROLES),
  signerType: z.enum(INSPECTION_SIGNER_TYPES),
  signerUserId: entityIdSchema.nullable(),
  signerPartyId: entityIdSchema.nullable(),
  signerNameSnapshot: z.string(),
  signatureDocumentVersionId: entityIdSchema,
  status: z.enum(INSPECTION_SIGNATURE_STATUSES),
  signedAt: z.string(),
  createdByUserId: entityIdSchema,
  invalidatedAt: z.string().nullable(),
  invalidatedByUserId: entityIdSchema.nullable(),
  invalidationReason: z.string().nullable(),
});

export const inspectionUnlockEventResponseSchema = z.object({
  id: entityIdSchema,
  inspectionId: entityIdSchema,
  reason: z.string(),
  previousVersion: z.number().int().positive(),
  previousContentRevision: z.number().int().nonnegative(),
  invalidatedSignatureCount: z.number().int().nonnegative(),
  unlockedByUserId: entityIdSchema,
  unlockedAt: z.string(),
});

export const inspectionFinalizationResponseSchema = z.object({
  id: entityIdSchema,
  inspectionId: entityIdSchema,
  sourceVersion: z.number().int().positive(),
  sourceContentRevision: z.number().int().nonnegative(),
  snapshot: z.unknown(),
  finalReportDocumentVersionId: entityIdSchema,
  finalizedByUserId: entityIdSchema,
  finalizedAt: z.string(),
});

export type InspectionEvidenceResponse = z.infer<
  typeof inspectionEvidenceResponseSchema
>;
export type InspectionSignatureResponse = z.infer<
  typeof inspectionSignatureResponseSchema
>;
export type InspectionUnlockEventResponse = z.infer<
  typeof inspectionUnlockEventResponseSchema
>;
export type InspectionFinalizationResponse = z.infer<
  typeof inspectionFinalizationResponseSchema
>;
