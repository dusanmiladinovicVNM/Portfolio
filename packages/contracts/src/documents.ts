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

export type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;
export type DocumentLinkRequest = z.infer<typeof documentLinkRequestSchema>;
export type DocumentResponse = z.infer<typeof documentResponseSchema>;
export type DocumentVersionResponse = z.infer<typeof documentVersionResponseSchema>;
export type DocumentLinkResponse = z.infer<typeof documentLinkResponseSchema>;
