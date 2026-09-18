import {
  DomainError,
  asInspectionEvidenceId,
  asInspectionFinalizationId,
  asInspectionId,
  asInspectionSchemaItemId,
  asInspectionSchemaSectionId,
  asInspectionSignatureId,
  asInspectionUnlockEventId,
  asPartyId,
  asUserId,
  createInspectionEvidence,
  createInspectionFinalization,
  createInspectionSignature,
  finalizeInspection,
  findInspectionSchemaSection,
  unlockInspection,
  type DocumentVersion,
  type Inspection,
  type InspectionEvidence,
  type InspectionEvidenceType,
  type InspectionFinalSnapshot,
  type InspectionFinalization,
  type InspectionId,
  type InspectionSchemaItemId,
  type InspectionSchemaSectionId,
  type InspectionSignature,
  type InspectionSignerRole,
  type InspectionSignerType,
  type InspectionUnlockEvent,
  type SnapshotDocumentVersion,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { DocumentRepository } from '../documents/document-repository.js';
import type { FileStoragePort } from '../documents/file-storage-port.js';
import { storeGeneratedFinalDocument } from '../documents/generated-document.js';
import type { PartyRepository } from '../parties/party-repository.js';
import type { TenancyRepository } from '../tenancy/tenancy-repository.js';
import type {
  InspectionRepository,
  StaffDirectoryRepository,
} from './inspection-repository.js';
import type { PdfPort } from './pdf-port.js';

export interface AddInspectionEvidenceInput {
  readonly documentVersionId: import('@portfolio/domain').DocumentVersionId;
  readonly evidenceType: InspectionEvidenceType;
  readonly sectionId?: string | null;
  readonly itemId?: string | null;
  readonly caption?: string | null;
}

export interface AddInspectionSignatureInput {
  readonly role: InspectionSignerRole;
  readonly signerType: InspectionSignerType;
  readonly signerUserId?: string | null;
  readonly signerPartyId?: string | null;
  readonly externalSignerName?: string | null;
  readonly signatureDocumentVersionId: import('@portfolio/domain').DocumentVersionId;
  readonly signedAt?: string;
}

async function requireInspection(
  repository: InspectionRepository,
  id: InspectionId,
): Promise<Inspection> {
  const inspection = await repository.getById(id);
  if (!inspection) {
    throw new DomainError('INSPECTION_NOT_FOUND', 'Inspection not found.');
  }
  return inspection;
}

function assertInspectionAccess(actor: Actor, inspection: Inspection): void {
  if (
    actor.role === 'inspector' &&
    inspection.assignedToUserId !== actor.userId
  ) {
    throw new DomainError(
      'INSPECTION_ACCESS_DENIED',
      'Inspector may only access inspections assigned to them.',
    );
  }
}

function assertExpectedVersion(
  inspection: Inspection,
  expectedVersion: number,
): void {
  if (inspection.version !== expectedVersion) {
    throw new DomainError(
      'INSPECTION_VERSION_CONFLICT',
      'Inspection has changed since the caller last read it.',
    );
  }
}

async function requireFinalVersion(
  repository: DocumentRepository,
  id: import('@portfolio/domain').DocumentVersionId,
): Promise<DocumentVersion> {
  const version = await repository.getVersionById(id);
  if (!version) {
    throw new DomainError(
      'DOCUMENT_VERSION_NOT_FOUND',
      'Document version not found.',
    );
  }
  if (version.status !== 'final' || version.finalizedAt === null) {
    throw new DomainError(
      'INSPECTION_EVIDENCE_VERSION_NOT_FINAL',
      'Inspection evidence/signatures require an immutable final DocumentVersion.',
    );
  }
  return version;
}

function snapshotDocumentVersion(version: DocumentVersion): SnapshotDocumentVersion {
  if (version.status !== 'final' || version.finalizedAt === null) {
    throw new DomainError(
      'INSPECTION_EVIDENCE_VERSION_NOT_FINAL',
      'Snapshot document versions must be final.',
    );
  }
  return {
    id: version.id,
    documentId: version.documentId,
    versionNumber: version.versionNumber,
    fileName: version.fileName,
    mimeType: version.mimeType,
    byteSize: version.byteSize,
    sha256: version.sha256,
    finalizedAt: version.finalizedAt,
  };
}

export async function addInspectionEvidenceCommand(
  deps: {
    readonly inspectionRepository: InspectionRepository;
    readonly documentRepository: DocumentRepository;
    readonly idGenerator: IdGenerator;
    readonly clock: ClockPort;
  },
  actor: Actor,
  inspectionId: InspectionId,
  input: AddInspectionEvidenceInput,
): Promise<InspectionEvidence> {
  requireCapability(actor, 'inspections:write');
  const inspection = await requireInspection(deps.inspectionRepository, inspectionId);
  assertInspectionAccess(actor, inspection);

  await requireFinalVersion(deps.documentRepository, input.documentVersionId);

  const schema = await deps.inspectionRepository.getSchemaVersionById(
    inspection.schemaVersionId,
  );
  if (!schema) {
    throw new DomainError('INSPECTION_SCHEMA_NOT_FOUND', 'Inspection schema not found.');
  }

  let sectionId: InspectionSchemaSectionId | null = null;
  let itemId: InspectionSchemaItemId | null = null;
  if (input.sectionId !== undefined && input.sectionId !== null) {
    sectionId = asInspectionSchemaSectionId(input.sectionId);
    const section = findInspectionSchemaSection(schema, sectionId);

    if (input.itemId !== undefined && input.itemId !== null) {
      itemId = asInspectionSchemaItemId(input.itemId);
      if (!section.items.some((item) => item.id === itemId)) {
        throw new DomainError(
          'INSPECTION_EVIDENCE_ITEM_NOT_IN_SECTION',
          'Evidence item does not belong to the selected section.',
        );
      }
    }
  } else if (input.itemId !== undefined && input.itemId !== null) {
    throw new DomainError(
      'INSPECTION_EVIDENCE_SECTION_REQUIRED',
      'Item-scoped evidence requires a section.',
    );
  }

  const evidence = createInspectionEvidence({
    id: asInspectionEvidenceId(deps.idGenerator.next()),
    inspection,
    documentVersionId: input.documentVersionId,
    evidenceType: input.evidenceType,
    sectionId,
    itemId,
    ...(input.caption !== undefined ? { caption: input.caption } : {}),
    createdByUserId: actor.userId,
    createdAt: deps.clock.now(),
  });

  await deps.inspectionRepository.insertEvidence(evidence);
  return evidence;
}

async function resolveSignerName(
  deps: {
    readonly staffDirectoryRepository: StaffDirectoryRepository;
    readonly partyRepository: PartyRepository;
  },
  input: AddInspectionSignatureInput,
): Promise<string> {
  if (input.signerType === 'staff') {
    if (!input.signerUserId) {
      throw new DomainError(
        'INSPECTION_SIGNATURE_SUBJECT_INVALID',
        'Staff signature requires signerUserId.',
      );
    }
    const staff = await deps.staffDirectoryRepository.getActiveStaffById(
      asUserId(input.signerUserId),
    );
    if (!staff) {
      throw new DomainError(
        'INSPECTION_SIGNATURE_STAFF_NOT_ACTIVE',
        'Staff signer must be an active Portfolio user.',
      );
    }
    return staff.displayName;
  }

  if (input.signerType === 'party') {
    if (!input.signerPartyId) {
      throw new DomainError(
        'INSPECTION_SIGNATURE_SUBJECT_INVALID',
        'Party signature requires signerPartyId.',
      );
    }
    const party = await deps.partyRepository.getById(
      asPartyId(input.signerPartyId),
    );
    if (!party) {
      throw new DomainError('PARTY_NOT_FOUND', 'Signature Party not found.');
    }
    return party.displayName;
  }

  const name = input.externalSignerName?.trim();
  if (!name) {
    throw new DomainError(
      'INSPECTION_SIGNATURE_EXTERNAL_NAME_REQUIRED',
      'External signature requires signer name.',
    );
  }
  return name;
}

export async function addInspectionSignatureCommand(
  deps: {
    readonly inspectionRepository: InspectionRepository;
    readonly documentRepository: DocumentRepository;
    readonly tenancyRepository: TenancyRepository;
    readonly partyRepository: PartyRepository;
    readonly staffDirectoryRepository: StaffDirectoryRepository;
    readonly idGenerator: IdGenerator;
    readonly clock: ClockPort;
  },
  actor: Actor,
  inspectionId: InspectionId,
  input: AddInspectionSignatureInput,
): Promise<InspectionSignature> {
  requireCapability(actor, 'inspections:write');
  const inspection = await requireInspection(deps.inspectionRepository, inspectionId);
  assertInspectionAccess(actor, inspection);
  await requireFinalVersion(
    deps.documentRepository,
    input.signatureDocumentVersionId,
  );

  if (['tenant', 'co_tenant'].includes(input.role)) {
    if (!inspection.tenancyId || !input.signerPartyId) {
      throw new DomainError(
        'INSPECTION_SIGNATURE_TENANCY_PARTY_MISMATCH',
        'Tenant signature requires a matching inspection Tenancy and Party.',
      );
    }
    const tenancy = await deps.tenancyRepository.getById(inspection.tenancyId);
    const partyId = asPartyId(input.signerPartyId);
    if (
      !tenancy ||
      !tenancy.parties.some(
        (party) => party.partyId === partyId && party.role === input.role,
      )
    ) {
      throw new DomainError(
        'INSPECTION_SIGNATURE_TENANCY_PARTY_MISMATCH',
        'Tenant signature must match current Tenancy party composition.',
      );
    }
  }

  const signerNameSnapshot = await resolveSignerName(deps, input);
  const signature = createInspectionSignature({
    id: asInspectionSignatureId(deps.idGenerator.next()),
    inspection,
    role: input.role,
    signerType: input.signerType,
    signerUserId:
      input.signerUserId === undefined || input.signerUserId === null
        ? null
        : asUserId(input.signerUserId),
    signerPartyId:
      input.signerPartyId === undefined || input.signerPartyId === null
        ? null
        : asPartyId(input.signerPartyId),
    signerNameSnapshot,
    signatureDocumentVersionId: input.signatureDocumentVersionId,
    signedAt: input.signedAt ?? deps.clock.now(),
    createdByUserId: actor.userId,
  });

  await deps.inspectionRepository.insertSignature(signature);
  return signature;
}

export async function unlockInspectionCommand(
  deps: {
    readonly inspectionRepository: InspectionRepository;
    readonly idGenerator: IdGenerator;
    readonly clock: ClockPort;
  },
  actor: Actor,
  inspectionId: InspectionId,
  expectedVersion: number,
  reason: string,
): Promise<Inspection> {
  requireCapability(actor, 'inspections:write');
  if (actor.role === 'inspector') {
    throw new DomainError(
      'INSPECTION_UNLOCK_FORBIDDEN',
      'Only admin or manager may unlock an inspection.',
    );
  }

  const current = await requireInspection(deps.inspectionRepository, inspectionId);
  assertExpectedVersion(current, expectedVersion);
  if (current.status !== 'locked') {
    throw new DomainError(
      'INSPECTION_INVALID_TRANSITION',
      'Only a locked inspection can be unlocked.',
    );
  }

  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new DomainError(
      'INSPECTION_UNLOCK_REASON_REQUIRED',
      'Unlock reason is required.',
    );
  }

  const signatures = await deps.inspectionRepository.listSignatures(current.id);
  const invalidatedSignatureCount = signatures.filter(
    (signature) => signature.status === 'valid',
  ).length;
  const now = deps.clock.now();
  const updated = unlockInspection(current, now);
  const event: InspectionUnlockEvent = {
    id: asInspectionUnlockEventId(deps.idGenerator.next()),
    inspectionId: current.id,
    reason: normalizedReason,
    previousVersion: current.version,
    previousContentRevision: current.contentRevision,
    invalidatedSignatureCount,
    unlockedByUserId: actor.userId,
    unlockedAt: now,
  };

  await deps.inspectionRepository.unlock(
    updated,
    current.version,
    current.contentRevision,
    event,
  );
  return updated;
}

async function snapshotVersionMap(
  repository: DocumentRepository,
  ids: readonly import('@portfolio/domain').DocumentVersionId[],
): Promise<ReadonlyMap<string, SnapshotDocumentVersion>> {
  const unique = [...new Set(ids)];
  const entries = await Promise.all(
    unique.map(async (id) => {
      const version = await requireFinalVersion(repository, id);
      return [id, snapshotDocumentVersion(version)] as const;
    }),
  );
  return new Map(entries);
}

export async function finalizeInspectionCommand(
  deps: {
    readonly inspectionRepository: InspectionRepository;
    readonly documentRepository: DocumentRepository;
    readonly fileStorage: FileStoragePort;
    readonly pdfPort: PdfPort;
    readonly idGenerator: IdGenerator;
    readonly clock: ClockPort;
  },
  actor: Actor,
  inspectionId: InspectionId,
  expectedVersion: number,
): Promise<{
  readonly inspection: Inspection;
  readonly finalization: InspectionFinalization;
  readonly finalReport: DocumentVersion;
}> {
  requireCapability(actor, 'inspections:write');
  const current = await requireInspection(deps.inspectionRepository, inspectionId);
  assertInspectionAccess(actor, current);
  assertExpectedVersion(current, expectedVersion);
  if (current.status !== 'locked') {
    throw new DomainError(
      'INSPECTION_FINALIZATION_REQUIRES_LOCK',
      'Inspection must be locked before finalization.',
    );
  }

  const [schema, sectionStates, responses, findings, evidence, signatures, unlockEvents] =
    await Promise.all([
      deps.inspectionRepository.getSchemaVersionById(current.schemaVersionId),
      deps.inspectionRepository.listSectionStates(current.id),
      deps.inspectionRepository.listResponses(current.id),
      deps.inspectionRepository.listFindings(current.id),
      deps.inspectionRepository.listEvidence(current.id),
      deps.inspectionRepository.listSignatures(current.id),
      deps.inspectionRepository.listUnlockEvents(current.id),
    ]);

  if (!schema) {
    throw new DomainError('INSPECTION_SCHEMA_NOT_FOUND', 'Inspection schema not found.');
  }

  const validInspectorSignature = signatures.some(
    (signature) =>
      signature.status === 'valid' &&
      signature.role === 'inspector' &&
      signature.signerType === 'staff' &&
      signature.signerUserId === current.assignedToUserId,
  );
  if (!validInspectorSignature) {
    throw new DomainError(
      'INSPECTION_FINALIZATION_INSPECTOR_SIGNATURE_REQUIRED',
      'Finalization requires a valid signature from the assigned inspector.',
    );
  }

  const documentIds = [
    ...evidence.map((item) => item.documentVersionId),
    ...signatures.map((item) => item.signatureDocumentVersionId),
  ];
  const versions = await snapshotVersionMap(deps.documentRepository, documentIds);

  const now = deps.clock.now();
  const finalizedInspection = finalizeInspection(current, now);
  const snapshot: InspectionFinalSnapshot = {
    snapshotVersion: 1,
    capturedAt: now,
    inspection: finalizedInspection,
    schema,
    sectionStates,
    responses,
    findings,
    evidence: evidence.map((item) => ({
      evidence: item,
      documentVersion: versions.get(item.documentVersionId)!,
    })),
    signatures: signatures.map((item) => ({
      signature: item,
      documentVersion: versions.get(item.signatureDocumentVersionId)!,
    })),
    unlockEvents,
  };

  const pdf = await deps.pdfPort.renderInspectionReport(snapshot);
  if (pdf.byteLength === 0) {
    throw new DomainError(
      'INSPECTION_FINAL_REPORT_EMPTY',
      'PDF renderer returned an empty final report.',
    );
  }

  const afterRender = await requireInspection(
    deps.inspectionRepository,
    current.id,
  );
  if (
    afterRender.status !== 'locked' ||
    afterRender.version !== current.version ||
    afterRender.contentRevision !== current.contentRevision
  ) {
    throw new DomainError(
      'INSPECTION_CONTENT_REVISION_CONFLICT',
      'Inspection changed while final report was being rendered.',
    );
  }

  const safeCode = current.code.replace(/[^A-Za-z0-9._-]+/g, '_');
  const finalReport = await storeGeneratedFinalDocument(
    {
      documentRepository: deps.documentRepository,
      fileStorage: deps.fileStorage,
      idGenerator: deps.idGenerator,
    },
    {
      title: `Inspection ${current.code} final report`,
      fileName: `inspection-${safeCode}.pdf`,
      mimeType: 'application/pdf',
      content: pdf,
      finalizedAt: now,
    },
  );

  const finalization = createInspectionFinalization({
    id: asInspectionFinalizationId(deps.idGenerator.next()),
    inspection: current,
    sourceVersion: current.version,
    sourceContentRevision: current.contentRevision,
    snapshot,
    finalReportDocumentVersionId: finalReport.id,
    finalizedByUserId: actor.userId,
    finalizedAt: now,
  });

  await deps.inspectionRepository.finalize(
    finalizedInspection,
    current.version,
    current.contentRevision,
    finalization,
  );

  return { inspection: finalizedInspection, finalization, finalReport };
}
