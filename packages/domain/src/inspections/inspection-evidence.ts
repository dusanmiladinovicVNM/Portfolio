import { DomainError } from '../shared/domain-error.js';
import type {
  DocumentId,
  DocumentVersionId,
  InspectionEvidenceId,
  InspectionFinalizationId,
  InspectionId,
  InspectionSchemaItemId,
  InspectionSchemaSectionId,
  InspectionSignatureId,
  InspectionUnlockEventId,
  PartyId,
  UserId,
} from '../shared/entity-id.js';
import type { Inspection, InspectionFinding, InspectionResponse, InspectionSectionState } from './inspection.js';
import type { InspectionSchemaVersion } from './inspection-schema.js';

export const INSPECTION_EVIDENCE_TYPES = ['photo', 'attachment'] as const;
export const INSPECTION_SIGNER_ROLES = [
  'inspector',
  'tenant',
  'co_tenant',
  'witness',
  'other',
] as const;
export const INSPECTION_SIGNER_TYPES = ['staff', 'party', 'external'] as const;
export const INSPECTION_SIGNATURE_STATUSES = ['valid', 'invalidated'] as const;

export type InspectionEvidenceType =
  (typeof INSPECTION_EVIDENCE_TYPES)[number];
export type InspectionSignerRole =
  (typeof INSPECTION_SIGNER_ROLES)[number];
export type InspectionSignerType =
  (typeof INSPECTION_SIGNER_TYPES)[number];
export type InspectionSignatureStatus =
  (typeof INSPECTION_SIGNATURE_STATUSES)[number];

export interface InspectionEvidence {
  readonly id: InspectionEvidenceId;
  readonly inspectionId: InspectionId;
  readonly documentVersionId: DocumentVersionId;
  readonly evidenceType: InspectionEvidenceType;
  readonly sectionId: InspectionSchemaSectionId | null;
  readonly itemId: InspectionSchemaItemId | null;
  readonly caption: string | null;
  readonly createdByUserId: UserId;
  readonly createdAt: string;
}

export interface InspectionSignature {
  readonly id: InspectionSignatureId;
  readonly inspectionId: InspectionId;
  readonly role: InspectionSignerRole;
  readonly signerType: InspectionSignerType;
  readonly signerUserId: UserId | null;
  readonly signerPartyId: PartyId | null;
  readonly signerNameSnapshot: string;
  readonly signatureDocumentVersionId: DocumentVersionId;
  readonly status: InspectionSignatureStatus;
  readonly signedAt: string;
  readonly createdByUserId: UserId;
  readonly invalidatedAt: string | null;
  readonly invalidatedByUserId: UserId | null;
  readonly invalidationReason: string | null;
}

export interface InspectionUnlockEvent {
  readonly id: InspectionUnlockEventId;
  readonly inspectionId: InspectionId;
  readonly reason: string;
  readonly previousVersion: number;
  readonly previousContentRevision: number;
  readonly invalidatedSignatureCount: number;
  readonly unlockedByUserId: UserId;
  readonly unlockedAt: string;
}

export interface SnapshotDocumentVersion {
  readonly id: DocumentVersionId;
  readonly documentId: DocumentId;
  readonly versionNumber: number;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly finalizedAt: string;
}

export interface InspectionSnapshotEvidence {
  readonly evidence: InspectionEvidence;
  readonly documentVersion: SnapshotDocumentVersion;
}

export interface InspectionSnapshotSignature {
  readonly signature: InspectionSignature;
  readonly documentVersion: SnapshotDocumentVersion;
}

export interface InspectionFinalSnapshot {
  readonly snapshotVersion: 1;
  readonly capturedAt: string;
  readonly inspection: Inspection;
  readonly schema: InspectionSchemaVersion;
  readonly sectionStates: readonly InspectionSectionState[];
  readonly responses: readonly InspectionResponse[];
  readonly findings: readonly InspectionFinding[];
  readonly evidence: readonly InspectionSnapshotEvidence[];
  readonly signatures: readonly InspectionSnapshotSignature[];
  readonly unlockEvents: readonly InspectionUnlockEvent[];
}

export interface InspectionFinalization {
  readonly id: InspectionFinalizationId;
  readonly inspectionId: InspectionId;
  readonly sourceVersion: number;
  readonly sourceContentRevision: number;
  readonly snapshot: InspectionFinalSnapshot;
  readonly finalReportDocumentVersionId: DocumentVersionId;
  readonly finalizedByUserId: UserId;
  readonly finalizedAt: string;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('INSPECTION_REQUIRED_FIELD', `${field} is required.`);
  }
  return normalized;
}

function instant(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'INSPECTION_INVALID_TIMESTAMP',
      `${field} must be a valid ISO timestamp.`,
    );
  }
  return value;
}

export function createInspectionEvidence(input: {
  readonly id: InspectionEvidenceId;
  readonly inspection: Inspection;
  readonly documentVersionId: DocumentVersionId;
  readonly evidenceType: InspectionEvidenceType;
  readonly sectionId?: InspectionSchemaSectionId | null;
  readonly itemId?: InspectionSchemaItemId | null;
  readonly caption?: string | null;
  readonly createdByUserId: UserId;
  readonly createdAt: string;
}): InspectionEvidence {
  if (!['draft', 'in_progress'].includes(input.inspection.status)) {
    throw new DomainError(
      'INSPECTION_CONTENT_LOCKED',
      'Inspection evidence may only be added before lock.',
    );
  }
  if (input.itemId !== undefined && input.itemId !== null && !input.sectionId) {
    throw new DomainError(
      'INSPECTION_EVIDENCE_SECTION_REQUIRED',
      'Item-scoped evidence must also reference its section.',
    );
  }

  return {
    id: input.id,
    inspectionId: input.inspection.id,
    documentVersionId: input.documentVersionId,
    evidenceType: input.evidenceType,
    sectionId: input.sectionId ?? null,
    itemId: input.itemId ?? null,
    caption:
      input.caption === undefined || input.caption === null
        ? null
        : input.caption.trim() || null,
    createdByUserId: input.createdByUserId,
    createdAt: instant(input.createdAt, 'evidence.createdAt'),
  };
}

export function createInspectionSignature(input: {
  readonly id: InspectionSignatureId;
  readonly inspection: Inspection;
  readonly role: InspectionSignerRole;
  readonly signerType: InspectionSignerType;
  readonly signerUserId?: UserId | null;
  readonly signerPartyId?: PartyId | null;
  readonly signerNameSnapshot: string;
  readonly signatureDocumentVersionId: DocumentVersionId;
  readonly signedAt: string;
  readonly createdByUserId: UserId;
}): InspectionSignature {
  if (input.inspection.status !== 'locked') {
    throw new DomainError(
      'INSPECTION_SIGNATURE_REQUIRES_LOCK',
      'Inspection must be locked before it can be signed.',
    );
  }

  const userId = input.signerUserId ?? null;
  const partyId = input.signerPartyId ?? null;
  const subjectCount = Number(userId !== null) + Number(partyId !== null);

  if (
    (input.signerType === 'staff' && (userId === null || partyId !== null)) ||
    (input.signerType === 'party' && (partyId === null || userId !== null)) ||
    (input.signerType === 'external' && subjectCount !== 0)
  ) {
    throw new DomainError(
      'INSPECTION_SIGNATURE_SUBJECT_INVALID',
      'Signature signer identity does not match signer type.',
    );
  }

  if (
    input.role === 'inspector' &&
    (input.signerType !== 'staff' ||
      userId !== input.inspection.assignedToUserId)
  ) {
    throw new DomainError(
      'INSPECTION_SIGNATURE_INSPECTOR_MISMATCH',
      'Inspector signature must belong to the assigned inspection user.',
    );
  }

  if (
    ['tenant', 'co_tenant'].includes(input.role) &&
    input.signerType !== 'party'
  ) {
    throw new DomainError(
      'INSPECTION_SIGNATURE_TENANT_SUBJECT_INVALID',
      'Tenant/co-tenant signatures must reference a Party.',
    );
  }

  return {
    id: input.id,
    inspectionId: input.inspection.id,
    role: input.role,
    signerType: input.signerType,
    signerUserId: userId,
    signerPartyId: partyId,
    signerNameSnapshot: required(
      input.signerNameSnapshot,
      'signature.signerNameSnapshot',
    ),
    signatureDocumentVersionId: input.signatureDocumentVersionId,
    status: 'valid',
    signedAt: instant(input.signedAt, 'signature.signedAt'),
    createdByUserId: input.createdByUserId,
    invalidatedAt: null,
    invalidatedByUserId: null,
    invalidationReason: null,
  };
}

export function invalidateInspectionSignature(
  signature: InspectionSignature,
  input: {
    readonly invalidatedAt: string;
    readonly invalidatedByUserId: UserId;
    readonly reason: string;
  },
): InspectionSignature {
  if (signature.status !== 'valid') {
    throw new DomainError(
      'INSPECTION_SIGNATURE_ALREADY_INVALIDATED',
      'Only a valid signature can be invalidated.',
    );
  }
  return {
    ...signature,
    status: 'invalidated',
    invalidatedAt: instant(input.invalidatedAt, 'signature.invalidatedAt'),
    invalidatedByUserId: input.invalidatedByUserId,
    invalidationReason: required(input.reason, 'signature.invalidationReason'),
  };
}

export function unlockInspection(
  inspection: Inspection,
  at: string,
): Inspection {
  if (inspection.status !== 'locked') {
    throw new DomainError(
      'INSPECTION_INVALID_TRANSITION',
      'Only a locked inspection can be unlocked.',
    );
  }
  instant(at, 'unlockedAt');
  return {
    ...inspection,
    status: 'in_progress',
    lockedAt: null,
    version: inspection.version + 1,
    contentRevision: inspection.contentRevision + 1,
  };
}

export function finalizeInspection(
  inspection: Inspection,
  at: string,
): Inspection {
  if (inspection.status !== 'locked') {
    throw new DomainError(
      'INSPECTION_INVALID_TRANSITION',
      'Only a locked inspection can be finalized.',
    );
  }
  return {
    ...inspection,
    status: 'finalized',
    finalizedAt: instant(at, 'finalizedAt'),
    version: inspection.version + 1,
  };
}

export function createInspectionFinalization(input: {
  readonly id: InspectionFinalizationId;
  readonly inspection: Inspection;
  readonly sourceVersion: number;
  readonly sourceContentRevision: number;
  readonly snapshot: InspectionFinalSnapshot;
  readonly finalReportDocumentVersionId: DocumentVersionId;
  readonly finalizedByUserId: UserId;
  readonly finalizedAt: string;
}): InspectionFinalization {
  if (input.inspection.status !== 'locked') {
    throw new DomainError(
      'INSPECTION_FINALIZATION_REQUIRES_LOCK',
      'Inspection must be locked before finalization.',
    );
  }
  if (
    input.sourceVersion !== input.inspection.version ||
    input.sourceContentRevision !== input.inspection.contentRevision
  ) {
    throw new DomainError(
      'INSPECTION_FINALIZATION_SOURCE_MISMATCH',
      'Finalization snapshot must match the locked inspection revision.',
    );
  }

  return {
    id: input.id,
    inspectionId: input.inspection.id,
    sourceVersion: input.sourceVersion,
    sourceContentRevision: input.sourceContentRevision,
    snapshot: input.snapshot,
    finalReportDocumentVersionId: input.finalReportDocumentVersionId,
    finalizedByUserId: input.finalizedByUserId,
    finalizedAt: instant(input.finalizedAt, 'finalizedAt'),
  };
}
