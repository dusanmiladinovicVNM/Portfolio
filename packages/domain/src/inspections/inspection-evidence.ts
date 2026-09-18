import { DomainError } from '../shared/domain-error.js';
import type {
  DocumentVersionId,
  InspectionEvidenceId,
  InspectionFinalSnapshotId,
  InspectionId,
  InspectionSchemaItemId,
  InspectionSchemaSectionId,
  InspectionSignatureId,
  InspectionUnlockId,
  PartyId,
  UserId,
} from '../shared/entity-id.js';
import type {
  Inspection,
  InspectionFinding,
  InspectionResponse,
} from './inspection.js';
import type {
  InspectionSchemaVersion,
  InspectionSignatureRole,
} from './inspection-schema.js';

export const INSPECTION_EVIDENCE_KINDS = [
  'photo',
  'attachment',
  'final_report',
] as const;

export type InspectionEvidenceKind =
  (typeof INSPECTION_EVIDENCE_KINDS)[number];

export interface InspectionEvidence {
  readonly id: InspectionEvidenceId;
  readonly inspectionId: InspectionId;
  readonly sectionId: InspectionSchemaSectionId | null;
  readonly itemId: InspectionSchemaItemId | null;
  readonly documentVersionId: DocumentVersionId;
  readonly kind: InspectionEvidenceKind;
  readonly caption: string | null;
  readonly createdByUserId: UserId;
  readonly createdAt: string;
}

export interface InspectionSignature {
  readonly id: InspectionSignatureId;
  readonly inspectionId: InspectionId;
  readonly signerRole: InspectionSignatureRole;
  readonly signerPartyId: PartyId | null;
  readonly signerName: string;
  readonly signatureDocumentVersionId: DocumentVersionId;
  readonly signedByUserId: UserId;
  readonly signedAt: string;
  readonly invalidatedAt: string | null;
  readonly invalidationReason: string | null;
}

export interface InspectionUnlockRecord {
  readonly id: InspectionUnlockId;
  readonly inspectionId: InspectionId;
  readonly unlockedByUserId: UserId;
  readonly unlockedAt: string;
  readonly reason: string;
  readonly previousLockedAt: string;
  readonly previousVersion: number;
  readonly previousContentRevision: number;
  readonly newVersion: number;
  readonly newContentRevision: number;
}

export interface InspectionFinalSnapshotPayload {
  readonly inspection: Inspection;
  readonly schema: InspectionSchemaVersion;
  readonly responses: readonly InspectionResponse[];
  readonly findings: readonly InspectionFinding[];
  readonly evidence: readonly InspectionEvidence[];
  readonly signatures: readonly InspectionSignature[];
}

export interface InspectionFinalSnapshot {
  readonly id: InspectionFinalSnapshotId;
  readonly inspectionId: InspectionId;
  readonly snapshotVersion: 1;
  readonly inspectionVersion: number;
  readonly contentRevision: number;
  readonly payload: InspectionFinalSnapshotPayload;
  readonly createdByUserId: UserId;
  readonly createdAt: string;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError(
      'INSPECTION_EVIDENCE_REQUIRED_FIELD',
      `${field} is required.`,
    );
  }
  return normalized;
}

function instant(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'INSPECTION_EVIDENCE_INVALID_TIMESTAMP',
      `${field} must be a valid ISO timestamp.`,
    );
  }
  return value;
}

export function createInspectionEvidence(
  inspection: Inspection,
  input: Omit<InspectionEvidence, 'caption' | 'createdAt'> & {
    readonly caption?: string | null;
    readonly createdAt: string;
  },
): InspectionEvidence {
  if (!['draft', 'in_progress'].includes(inspection.status)) {
    throw new DomainError(
      'INSPECTION_EVIDENCE_LOCKED',
      'Inspection evidence can only be attached before lock.',
    );
  }
  if (input.kind === 'final_report') {
    throw new DomainError(
      'INSPECTION_FINAL_REPORT_RESERVED',
      'final_report evidence is created only from a finalized snapshot.',
    );
  }
  if (input.itemId !== null && input.sectionId === null) {
    throw new DomainError(
      'INSPECTION_EVIDENCE_SECTION_REQUIRED',
      'Item-level evidence must also identify its section.',
    );
  }

  return {
    ...input,
    caption:
      input.caption === undefined || input.caption === null
        ? null
        : input.caption.trim() || null,
    createdAt: instant(input.createdAt, 'createdAt'),
  };
}

export function createInspectionSignature(
  inspection: Inspection,
  input: Omit<
    InspectionSignature,
    'signerName' | 'signedAt' | 'invalidatedAt' | 'invalidationReason'
  > & {
    readonly signerName: string;
    readonly signedAt: string;
  },
): InspectionSignature {
  if (inspection.status !== 'locked') {
    throw new DomainError(
      'INSPECTION_SIGNATURE_STATE_INVALID',
      'Signatures may only be collected while the inspection is locked.',
    );
  }

  return {
    ...input,
    signerName: requiredText(input.signerName, 'signerName'),
    signedAt: instant(input.signedAt, 'signedAt'),
    invalidatedAt: null,
    invalidationReason: null,
  };
}

export function invalidateInspectionSignature(
  signature: InspectionSignature,
  invalidatedAtValue: string,
  reason: string,
): InspectionSignature {
  if (signature.invalidatedAt !== null) {
    throw new DomainError(
      'INSPECTION_SIGNATURE_ALREADY_INVALIDATED',
      'Inspection signature is already invalidated.',
    );
  }
  return {
    ...signature,
    invalidatedAt: instant(invalidatedAtValue, 'invalidatedAt'),
    invalidationReason: requiredText(reason, 'invalidationReason'),
  };
}

export function activeInspectionSignatures(
  signatures: readonly InspectionSignature[],
): readonly InspectionSignature[] {
  return signatures.filter((signature) => signature.invalidatedAt === null);
}

export function assertInspectionSignaturePolicySatisfied(
  schema: InspectionSchemaVersion,
  signatures: readonly InspectionSignature[],
): void {
  const activeRoles = new Set(
    activeInspectionSignatures(signatures).map((signature) => signature.signerRole),
  );
  const missing = schema.requiredSignatureRoles.filter(
    (role) => !activeRoles.has(role),
  );
  if (missing.length > 0) {
    throw new DomainError(
      'INSPECTION_REQUIRED_SIGNATURES_MISSING',
      `Missing required inspection signatures: ${missing.join(', ')}.`,
    );
  }
}

export function createInspectionUnlockRecord(
  current: Inspection,
  updated: Inspection,
  input: {
    readonly id: InspectionUnlockId;
    readonly unlockedByUserId: UserId;
    readonly unlockedAt: string;
    readonly reason: string;
  },
): InspectionUnlockRecord {
  if (current.status !== 'locked' || current.lockedAt === null) {
    throw new DomainError(
      'INSPECTION_UNLOCK_STATE_INVALID',
      'Only a locked inspection can create an unlock record.',
    );
  }
  return {
    id: input.id,
    inspectionId: current.id,
    unlockedByUserId: input.unlockedByUserId,
    unlockedAt: instant(input.unlockedAt, 'unlockedAt'),
    reason: requiredText(input.reason, 'reason'),
    previousLockedAt: current.lockedAt,
    previousVersion: current.version,
    previousContentRevision: current.contentRevision,
    newVersion: updated.version,
    newContentRevision: updated.contentRevision,
  };
}

export function createInspectionFinalSnapshot(
  inspection: Inspection,
  schema: InspectionSchemaVersion,
  responses: readonly InspectionResponse[],
  findings: readonly InspectionFinding[],
  evidenceItems: readonly InspectionEvidence[],
  signatures: readonly InspectionSignature[],
  input: {
    readonly id: InspectionFinalSnapshotId;
    readonly createdByUserId: UserId;
    readonly createdAt: string;
  },
): InspectionFinalSnapshot {
  if (inspection.status !== 'locked') {
    throw new DomainError(
      'INSPECTION_FINALIZATION_STATE_INVALID',
      'Only a locked inspection can be snapshotted for finalization.',
    );
  }
  assertInspectionSignaturePolicySatisfied(schema, signatures);

  return {
    id: input.id,
    inspectionId: inspection.id,
    snapshotVersion: 1,
    inspectionVersion: inspection.version,
    contentRevision: inspection.contentRevision,
    payload: {
      inspection: { ...inspection },
      schema,
      responses: responses.map((response) => ({ ...response })),
      findings: findings.map((finding) => ({ ...finding })),
      evidence: evidenceItems.map((item) => ({ ...item })),
      signatures: activeInspectionSignatures(signatures).map((signature) => ({
        ...signature,
      })),
    },
    createdByUserId: input.createdByUserId,
    createdAt: instant(input.createdAt, 'createdAt'),
  };
}
