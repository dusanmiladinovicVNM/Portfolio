import { z } from 'zod';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_LINK_RELATIONS,
  DOCUMENT_STATUSES,
  DOCUMENT_TARGET_TYPES,
  DOCUMENT_VERSION_STATUSES,
} from '@portfolio/domain';
import { instantSchema } from './api.js';
import { entityIdSchema } from './portfolio.js';

export const createDocumentRequestSchema = z.object({
  code: z.string().trim().min(1),
  title: z.string().trim().min(1),
  category: z.enum(DOCUMENT_CATEGORIES),
});

export const documentLinkRequestSchema = z.object({
  documentVersionId: entityIdSchema.nullable().optional(),
  relation: z.enum(DOCUMENT_LINK_RELATIONS),
  targetType: z.enum(DOCUMENT_TARGET_TYPES),
  targetId: entityIdSchema,
});

export const documentResponseSchema = z.object({
  id: entityIdSchema,
  code: z.string(),
  title: z.string(),
  category: z.enum(DOCUMENT_CATEGORIES),
  status: z.enum(DOCUMENT_STATUSES),
  latestVersionNumber: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
});

export const documentVersionResponseSchema = z.object({
  id: entityIdSchema,
  documentId: entityIdSchema,
  versionNumber: z.number().int().positive(),
  fileName: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(DOCUMENT_VERSION_STATUSES),
  finalizedAt: instantSchema.nullable(),
});

export const documentLinkResponseSchema = z.object({
  id: entityIdSchema,
  documentId: entityIdSchema,
  documentVersionId: entityIdSchema.nullable(),
  relation: z.enum(DOCUMENT_LINK_RELATIONS),
  targetType: z.enum(DOCUMENT_TARGET_TYPES),
  targetId: entityIdSchema,
});

type DossierDocumentTargetType =
  | 'unit'
  | 'lease_agreement'
  | 'lease_amendment';

function createDocumentReferenceResponseSchema<
  T extends DossierDocumentTargetType,
>(targetType: T) {
  return z
    .object({
      document: documentResponseSchema,
      link: documentLinkResponseSchema.extend({
        targetType: z.literal(targetType),
      }),
      linkedVersion: documentVersionResponseSchema.nullable(),
    })
    .superRefine((value, ctx) => {
      if (value.link.documentId !== value.document.id) {
        ctx.addIssue({
          code: 'custom',
          message: 'Document link must reference the returned Document.',
        });
      }

      if (
        value.link.documentVersionId === null &&
        value.linkedVersion !== null
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Document-level links must not return a linked version.',
        });
      }

      if (value.link.documentVersionId !== null) {
        if (
          value.linkedVersion === null ||
          value.linkedVersion.id !== value.link.documentVersionId ||
          value.linkedVersion.documentId !== value.document.id
        ) {
          ctx.addIssue({
            code: 'custom',
            message:
              'Version-specific links must return that exact Document version.',
          });
        }
      }
    });
}

export const unitDocumentReferenceResponseSchema =
  createDocumentReferenceResponseSchema('unit');
export const leaseAgreementDocumentReferenceResponseSchema =
  createDocumentReferenceResponseSchema('lease_agreement');
export const leaseAmendmentDocumentReferenceResponseSchema =
  createDocumentReferenceResponseSchema('lease_amendment');

export const unitDocumentListResponseSchema = z.object({
  items: z.array(unitDocumentReferenceResponseSchema),
});
export const leaseAgreementDocumentListResponseSchema = z.object({
  items: z.array(leaseAgreementDocumentReferenceResponseSchema),
});
export const leaseAmendmentDocumentListResponseSchema = z.object({
  items: z.array(leaseAmendmentDocumentReferenceResponseSchema),
});

export type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;
export type DocumentLinkRequest = z.infer<typeof documentLinkRequestSchema>;
export type DocumentResponse = z.infer<typeof documentResponseSchema>;
export type DocumentVersionResponse = z.infer<typeof documentVersionResponseSchema>;
export type DocumentLinkResponse = z.infer<typeof documentLinkResponseSchema>;
export type UnitDocumentReferenceResponse = z.infer<
  typeof unitDocumentReferenceResponseSchema
>;
export type UnitDocumentListResponse = z.infer<
  typeof unitDocumentListResponseSchema
>;
export type LeaseAgreementDocumentReferenceResponse = z.infer<
  typeof leaseAgreementDocumentReferenceResponseSchema
>;
export type LeaseAgreementDocumentListResponse = z.infer<
  typeof leaseAgreementDocumentListResponseSchema
>;
export type LeaseAmendmentDocumentReferenceResponse = z.infer<
  typeof leaseAmendmentDocumentReferenceResponseSchema
>;
export type LeaseAmendmentDocumentListResponse = z.infer<
  typeof leaseAmendmentDocumentListResponseSchema
>;
