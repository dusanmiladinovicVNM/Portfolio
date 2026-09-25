import { DomainError } from '../shared/domain-error.js';
import { asInstant } from '../shared/instant.js';
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
import type { DocumentVersion } from '../documents/document.js';
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

export interface InspectionSnapshotEvidence {
  readonly evidence: InspectionEvidence;
  readonly documentVersion: DocumentVersion;
}

export interface InspectionSnapshotSignature {
  readonly signature: InspectionSignature;
  readonly documentVersion: DocumentVersion;
}

export interface InspectionFinalReportContext {
  readonly property: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly street: string;
    readonly houseNumber: string;
    readonly postalCode: string;
    readonly city: string;
    readonly countryCode: string;
  };
  readonly unit: {
    readonly id: string;
    readonly code: string;
    readonly unitNumber: string;
    readonly unitType: string;
    readonly floor: string | null;
    readonly areaM2: number | null;
    readonly rooms: number | null;
  };
}

export interface InspectionFinalSnapshotPayload {
  readonly inspection: Inspection;
  readonly schema: InspectionSchemaVersion;
  readonly reportContext?: InspectionFinalReportContext | null;
  readonly responses: readonly InspectionResponse[];
  readonly findings: readonly InspectionFinding[];
  readonly evidence: readonly InspectionSnapshotEvidence[];
  readonly signatures: readonly InspectionSnapshotSignature[];
  readonly unlockHistory: readonly InspectionUnlockRecord[];
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
  return asInstant(value, field, 'INSPECTION_EVIDENCE_INVALID_TIMESTAMP');
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

export function createInspectionFinalReportEvidence(
  inspection: Inspection,
  input: {
    readonly id: InspectionEvidenceId;
    readonly documentVersionId: DocumentVersionId;
    readonly createdByUserId: UserId;
    readonly createdAt: string;
  },
): InspectionEvidence {
  if (inspection.status !== 'finalized') {
    throw new DomainError(
      'INSPECTION_FINAL_REPORT_STATE_INVALID',
      'Final report evidence requires a finalized inspection.',
    );
  }
  return {
    id: input.id,
    inspectionId: inspection.id,
    sectionId: null,
    itemId: null,
    documentVersionId: input.documentVersionId,
    kind: 'final_report',
    caption: null,
    createdByUserId: input.createdByUserId,
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
  sourceInspection: Inspection,
  finalizedInspection: Inspection,
  schema: InspectionSchemaVersion,
  responses: readonly InspectionResponse[],
  findings: readonly InspectionFinding[],
  evidenceItems: readonly InspectionSnapshotEvidence[],
  signatures: readonly InspectionSnapshotSignature[],
  unlockHistory: readonly InspectionUnlockRecord[],
  input: {
    readonly id: InspectionFinalSnapshotId;
    readonly createdByUserId: UserId;
    readonly createdAt: string;
    readonly reportContext?: InspectionFinalReportContext | null;
  },
): InspectionFinalSnapshot {
  if (sourceInspection.status !== 'locked') {
    throw new DomainError(
      'INSPECTION_FINALIZATION_STATE_INVALID',
      'Only a locked inspection can be snapshotted for finalization.',
    );
  }
  if (
    finalizedInspection.id !== sourceInspection.id ||
    finalizedInspection.status !== 'finalized' ||
    finalizedInspection.version !== sourceInspection.version + 1 ||
    finalizedInspection.contentRevision !== sourceInspection.contentRevision
  ) {
    throw new DomainError(
      'INSPECTION_FINAL_SNAPSHOT_HEADER_INVALID',
      'Final snapshot must contain the finalized header derived from the locked source revision.',
    );
  }
  assertInspectionSignaturePolicySatisfied(
    schema,
    signatures.map((item) => item.signature),
  );

  return {
    id: input.id,
    inspectionId: sourceInspection.id,
    snapshotVersion: 1,
    inspectionVersion: sourceInspection.version,
    contentRevision: sourceInspection.contentRevision,
    payload: {
      inspection: { ...finalizedInspection },
      schema,
      ...(input.reportContext === undefined
        ? {}
        : {
            reportContext:
              input.reportContext === null
                ? null
                : {
                    property: { ...input.reportContext.property },
                    unit: { ...input.reportContext.unit },
                  },
          }),
      responses: responses.map((response) => ({ ...response })),
      findings: findings.map((finding) => ({ ...finding })),
      evidence: evidenceItems.map((item) => ({
        evidence: { ...item.evidence },
        documentVersion: { ...item.documentVersion },
      })),
      signatures: signatures.map((item) => ({
        signature: { ...item.signature },
        documentVersion: { ...item.documentVersion },
      })),
      unlockHistory: unlockHistory.map((record) => ({ ...record })),
    },
    createdByUserId: input.createdByUserId,
    createdAt: instant(input.createdAt, 'createdAt'),
  };
}
