import { z } from 'zod';
import {
  INSPECTION_CONDITION_OPERATORS,
  INSPECTION_EVIDENCE_KINDS,
  INSPECTION_FINDING_SEVERITIES,
  INSPECTION_ITEM_TYPES,
  INSPECTION_SCHEMA_STATUSES,
  INSPECTION_SIGNATURE_ROLES,
  INSPECTION_STATUSES,
  INSPECTION_TYPES,
  type InspectionCondition,
} from '@portfolio/domain';
import { instantSchema } from './api.js';
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
  requiredSignatureRoles: z.array(z.enum(INSPECTION_SIGNATURE_ROLES)),
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

export const updateInspectionOrchestrationRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  assignedToUserId: entityIdSchema,
  scheduledFor: dateOnlySchema.nullable(),
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
  startedAt: instantSchema.nullable(),
  lockedAt: instantSchema.nullable(),
  finalizedAt: instantSchema.nullable(),
  cancelledAt: instantSchema.nullable(),
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
  requiredSignatureRoles: z.array(z.enum(INSPECTION_SIGNATURE_ROLES)),
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
  updatedAt: instantSchema,
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
  createdAt: instantSchema,
});

export const inspectionSectionStateResponseSchema = z.object({
  sectionId: entityIdSchema,
  revision: z.number().int().nonnegative(),
});

export type CreateInspectionSchemaVersionRequest = z.infer<
  typeof createInspectionSchemaVersionRequestSchema
>;
export type CreateInspectionRequest = z.infer<typeof createInspectionRequestSchema>;
export type UpdateInspectionOrchestrationRequest = z.infer<
  typeof updateInspectionOrchestrationRequestSchema
>;
export type InspectionResponseDto = z.infer<typeof inspectionResponseSchema>;
export type InspectionSchemaVersionResponse = z.infer<
  typeof inspectionSchemaVersionResponseSchema
>;
export type InspectionItemResponse = z.infer<typeof inspectionItemResponseSchema>;
export type InspectionFindingResponse = z.infer<
  typeof inspectionFindingResponseSchema
>;

export const attachInspectionEvidenceRequestSchema = z.object({
  documentVersionId: entityIdSchema,
  kind: z.enum(INSPECTION_EVIDENCE_KINDS).refine(
    (value) => value !== 'final_report',
  ),
  sectionId: entityIdSchema.nullable().optional(),
  itemId: entityIdSchema.nullable().optional(),
  caption: z.string().nullable().optional(),
});

export const addInspectionSignatureRequestSchema = z.object({
  signerRole: z.enum(INSPECTION_SIGNATURE_ROLES),
  signerPartyId: entityIdSchema.nullable().optional(),
  signerName: z.string().trim().min(1),
  signatureDocumentVersionId: entityIdSchema,
});

export const unlockInspectionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1),
});

export const finalizeInspectionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const finalizeInspectionResponseSchema = z.object({
  inspection: inspectionResponseSchema,
  snapshot: inspectionFinalSnapshotResponseSchema,
});

export const inspectionEvidenceResponseSchema = z.object({
  id: entityIdSchema,
  inspectionId: entityIdSchema,
  sectionId: entityIdSchema.nullable(),
  itemId: entityIdSchema.nullable(),
  documentVersionId: entityIdSchema,
  kind: z.enum(INSPECTION_EVIDENCE_KINDS),
  caption: z.string().nullable(),
  createdByUserId: entityIdSchema,
  createdAt: instantSchema,
});

export const inspectionSignatureResponseSchema = z.object({
  id: entityIdSchema,
  inspectionId: entityIdSchema,
  signerRole: z.enum(INSPECTION_SIGNATURE_ROLES),
  signerPartyId: entityIdSchema.nullable(),
  signerName: z.string(),
  signatureDocumentVersionId: entityIdSchema,
  signedByUserId: entityIdSchema,
  signedAt: instantSchema,
  invalidatedAt: instantSchema.nullable(),
  invalidationReason: z.string().nullable(),
});

export const inspectionFinalSnapshotResponseSchema = z.object({
  id: entityIdSchema,
  inspectionId: entityIdSchema,
  snapshotVersion: z.literal(1),
  inspectionVersion: z.number().int().positive(),
  contentRevision: z.number().int().nonnegative(),
  createdByUserId: entityIdSchema,
  createdAt: instantSchema,
});

export type InspectionEvidenceResponse = z.infer<
  typeof inspectionEvidenceResponseSchema
>;
export type InspectionSignatureResponse = z.infer<
  typeof inspectionSignatureResponseSchema
>;
export type InspectionFinalSnapshotResponse = z.infer<
  typeof inspectionFinalSnapshotResponseSchema
>;
export type FinalizeInspectionResponse = z.infer<
  typeof finalizeInspectionResponseSchema
>;
export type SaveInspectionSectionRequest = z.infer<
  typeof saveInspectionSectionRequestSchema
>;


export const inspectionSchemaVersionListResponseSchema = z.object({
  items: z.array(inspectionSchemaVersionResponseSchema),
});

export const inspectionListResponseSchema = z.object({
  items: z.array(inspectionResponseSchema),
});

export const inspectionStaffResponseSchema = z.object({
  userId: entityIdSchema,
  displayName: z.string().trim().min(1),
  email: z.string().nullable(),
  role: z.enum(['admin', 'manager', 'inspector']),
});

export const inspectionStaffListResponseSchema = z.object({
  items: z.array(inspectionStaffResponseSchema),
});

export const assignedInspectionWorkItemResponseSchema = z.object({
  inspection: inspectionResponseSchema,
  propertyId: entityIdSchema,
  unitCode: z.string(),
  unitNumber: z.string(),
});

export const assignedInspectionWorkListResponseSchema = z.object({
  items: z.array(assignedInspectionWorkItemResponseSchema),
});

export const inspectionBundleResponseSchema = z.object({
  inspection: inspectionResponseSchema,
  schema: inspectionSchemaVersionResponseSchema,
  sectionStates: z.array(inspectionSectionStateResponseSchema),
  responses: z.array(inspectionItemResponseSchema),
  findings: z.array(inspectionFindingResponseSchema),
  evidence: z.array(inspectionEvidenceResponseSchema),
  signatures: z.array(inspectionSignatureResponseSchema),
  finalSnapshot: inspectionFinalSnapshotResponseSchema.nullable(),
});

export const saveInspectionSectionResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
  contentRevision: z.number().int().nonnegative(),
  responses: z.array(inspectionItemResponseSchema),
  clearedItemIds: z.array(entityIdSchema),
});

export type InspectionSchemaVersionListResponse = z.infer<
  typeof inspectionSchemaVersionListResponseSchema
>;
export type InspectionListResponse = z.infer<
  typeof inspectionListResponseSchema
>;
export type InspectionStaffResponse = z.infer<
  typeof inspectionStaffResponseSchema
>;
export type InspectionStaffListResponse = z.infer<
  typeof inspectionStaffListResponseSchema
>;
export type AssignedInspectionWorkItemResponse = z.infer<
  typeof assignedInspectionWorkItemResponseSchema
>;
export type AssignedInspectionWorkListResponse = z.infer<
  typeof assignedInspectionWorkListResponseSchema
>;
export type InspectionBundleResponse = z.infer<
  typeof inspectionBundleResponseSchema
>;
export type SaveInspectionSectionResponse = z.infer<
  typeof saveInspectionSectionResponseSchema
>;
