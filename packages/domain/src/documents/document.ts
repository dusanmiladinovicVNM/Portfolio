import { DomainError } from '../shared/domain-error.js';
import type {
  DocumentId,
  DocumentLinkId,
  DocumentVersionId,
  LeaseAgreementId,
  LeaseAmendmentId,
  PartyId,
  PropertyId,
  TenancyId,
  UnitId,
} from '../shared/entity-id.js';

export const DOCUMENT_CATEGORIES = [
  'legal',
  'financial',
  'technical',
  'inspection',
  'identity',
  'correspondence',
  'photo',
  'other',
] as const;

export const DOCUMENT_STATUSES = ['active', 'archived'] as const;
export const DOCUMENT_VERSION_STATUSES = ['stored', 'final'] as const;
export const DOCUMENT_LINK_RELATIONS = [
  'primary',
  'signed_original',
  'supporting',
  'attachment',
  'other',
] as const;
export const DOCUMENT_TARGET_TYPES = [
  'property',
  'unit',
  'party',
  'tenancy',
  'lease_agreement',
  'lease_amendment',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export type DocumentVersionStatus = (typeof DOCUMENT_VERSION_STATUSES)[number];
export type DocumentLinkRelation = (typeof DOCUMENT_LINK_RELATIONS)[number];
export type DocumentTargetType = (typeof DOCUMENT_TARGET_TYPES)[number];

export interface Document {
  readonly id: DocumentId;
  readonly code: string;
  readonly title: string;
  readonly category: DocumentCategory;
  readonly status: DocumentStatus;
  readonly latestVersionNumber: number;
  readonly revision: number;
}

export interface DocumentVersion {
  readonly id: DocumentVersionId;
  readonly documentId: DocumentId;
  readonly versionNumber: number;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly status: DocumentVersionStatus;
  readonly finalizedAt: string | null;
}

interface DocumentLinkBase {
  readonly id: DocumentLinkId;
  readonly documentId: DocumentId;
  readonly documentVersionId: DocumentVersionId | null;
  readonly relation: DocumentLinkRelation;
}

export type DocumentLink =
  | (DocumentLinkBase & {
      readonly targetType: 'property';
      readonly targetId: PropertyId;
    })
  | (DocumentLinkBase & {
      readonly targetType: 'unit';
      readonly targetId: UnitId;
    })
  | (DocumentLinkBase & {
      readonly targetType: 'party';
      readonly targetId: PartyId;
    })
  | (DocumentLinkBase & {
      readonly targetType: 'tenancy';
      readonly targetId: TenancyId;
    })
  | (DocumentLinkBase & {
      readonly targetType: 'lease_agreement';
      readonly targetId: LeaseAgreementId;
    })
  | (DocumentLinkBase & {
      readonly targetType: 'lease_amendment';
      readonly targetId: LeaseAmendmentId;
    });

export interface CreateDocumentInput {
  id: DocumentId;
  code: string;
  title: string;
  category: DocumentCategory;
}

export interface CreateStoredDocumentVersionInput {
  id: DocumentVersionId;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('DOCUMENT_REQUIRED_FIELD', `${field} is required.`);
  }
  return normalized;
}

function normalizedSha256(value: string): string {
  const hash = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new DomainError(
      'DOCUMENT_INVALID_SHA256',
      'sha256 must be a 64-character hexadecimal SHA-256 digest.',
    );
  }
  return hash;
}

function assertInstant(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'DOCUMENT_INVALID_FINALIZED_AT',
      'finalizedAt must be a valid ISO timestamp.',
    );
  }
  return value;
}

export function createDocument(input: CreateDocumentInput): Document {
  return {
    id: input.id,
    code: required(input.code, 'code'),
    title: required(input.title, 'title'),
    category: input.category,
    status: 'active',
    latestVersionNumber: 0,
    revision: 1,
  };
}

export function addStoredDocumentVersion(
  document: Document,
  input: CreateStoredDocumentVersionInput,
): { readonly document: Document; readonly version: DocumentVersion } {
  if (document.status !== 'active') {
    throw new DomainError(
      'DOCUMENT_NOT_ACTIVE',
      'A new version may only be added to an active document.',
    );
  }

  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0) {
    throw new DomainError(
      'DOCUMENT_INVALID_BYTE_SIZE',
      'Document content must contain at least one byte.',
    );
  }

  const nextVersionNumber = document.latestVersionNumber + 1;

  return {
    document: {
      ...document,
      latestVersionNumber: nextVersionNumber,
      revision: document.revision + 1,
    },
    version: {
      id: input.id,
      documentId: document.id,
      versionNumber: nextVersionNumber,
      fileName: required(input.fileName, 'fileName'),
      mimeType: required(input.mimeType, 'mimeType').toLowerCase(),
      byteSize: input.byteSize,
      sha256: normalizedSha256(input.sha256),
      status: 'stored',
      finalizedAt: null,
    },
  };
}

export function finalizeDocumentVersion(
  version: DocumentVersion,
  finalizedAtValue: string,
): DocumentVersion {
  if (version.status !== 'stored') {
    throw new DomainError(
      'DOCUMENT_VERSION_INVALID_TRANSITION',
      'Only a stored document version can be finalized.',
    );
  }

  return {
    ...version,
    status: 'final',
    finalizedAt: assertInstant(finalizedAtValue),
  };
}

export function archiveDocument(document: Document): Document {
  if (document.status !== 'active') {
    throw new DomainError(
      'DOCUMENT_INVALID_TRANSITION',
      'Only an active document can be archived.',
    );
  }

  return {
    ...document,
    status: 'archived',
    revision: document.revision + 1,
  };
}

export function createDocumentLink(input: DocumentLink): DocumentLink {
  if (
    input.relation === 'signed_original' &&
    input.targetType !== 'lease_agreement' &&
    input.targetType !== 'lease_amendment'
  ) {
    throw new DomainError(
      'DOCUMENT_SIGNED_ORIGINAL_TARGET_INVALID',
      'signed_original may only target a lease agreement or lease amendment.',
    );
  }

  if (input.relation === 'signed_original' && input.documentVersionId === null) {
    throw new DomainError(
      'DOCUMENT_SIGNED_ORIGINAL_VERSION_REQUIRED',
      'signed_original must reference an exact final document version.',
    );
  }

  return { ...input } as DocumentLink;
}
