import {
  DomainError,
  asInspectionEvidenceId,
  createInspectionFinalReportEvidence,
  type DocumentVersion,
  type InspectionId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import {
  assertDocumentVersionStorageIntegrity,
  createDocumentCommand,
  finalizeDocumentVersionCommand,
  uploadDocumentVersionCommand,
} from '../documents/document-commands.js';
import type { DocumentRepository } from '../documents/document-repository.js';
import type { FileStoragePort } from '../documents/file-storage-port.js';
import type { PdfPort } from '../documents/pdf-port.js';
import type { InspectionRepository } from './inspection-repository.js';

export interface GenerateInspectionFinalReportDependencies {
  readonly inspectionRepository: InspectionRepository;
  readonly documentRepository: DocumentRepository;
  readonly fileStorage: FileStoragePort;
  readonly pdfPort: PdfPort;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

export async function generateInspectionFinalReportCommand(
  deps: GenerateInspectionFinalReportDependencies,
  actor: Actor,
  inspectionId: InspectionId,
): Promise<DocumentVersion> {
  requireCapability(actor, 'documents:write');
  requireCapability(actor, 'inspections:read');

  const inspection = await deps.inspectionRepository.getById(inspectionId);
  if (!inspection) {
    throw new DomainError('INSPECTION_NOT_FOUND', 'Inspection not found.');
  }
  if (inspection.status !== 'finalized') {
    throw new DomainError(
      'INSPECTION_FINAL_REPORT_STATE_INVALID',
      'Final report requires a finalized inspection.',
    );
  }

  const resolveExistingEvidence = async (): Promise<DocumentVersion | null> => {
    const existing = (await deps.inspectionRepository.listEvidence(inspectionId))
      .find((item) => item.kind === 'final_report');
    if (!existing) return null;

    const version = await deps.documentRepository.getVersionById(
      existing.documentVersionId,
    );
    if (!version) {
      throw new DomainError(
        'INSPECTION_FINAL_REPORT_DOCUMENT_MISSING',
        'Final report evidence references a missing document version.',
      );
    }
    if (version.status !== 'final' || version.mimeType !== 'application/pdf') {
      throw new DomainError(
        'INSPECTION_FINAL_REPORT_DOCUMENT_INVALID',
        'Final report evidence must reference one final PDF DocumentVersion.',
      );
    }
    await assertDocumentVersionStorageIntegrity(deps, version);
    return version;
  };

  const existing = await resolveExistingEvidence();
  if (existing) return existing;

  const snapshot = await deps.inspectionRepository.getFinalSnapshot(inspectionId);
  if (!snapshot) {
    throw new DomainError(
      'INSPECTION_FINAL_SNAPSHOT_NOT_FOUND',
      'Finalized inspection is missing its final snapshot.',
    );
  }

  const reportCode = `INSPECTION-FINAL-${inspection.id}`;
  const findReportDocument = async () =>
    (await deps.documentRepository.listDocuments()).find(
      (document) => document.code.toLowerCase() === reportCode.toLowerCase(),
    ) ?? null;

  let document = await findReportDocument();
  if (!document) {
    try {
      document = await createDocumentCommand(
        {
          documentRepository: deps.documentRepository,
          idGenerator: deps.idGenerator,
        },
        actor,
        {
          code: reportCode,
          title: `${inspection.code} final inspection report`,
          category: 'inspection',
        },
      );
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== 'DOCUMENT_CODE_ALREADY_EXISTS') {
        throw error;
      }
      document = await findReportDocument();
      if (!document) {
        throw new DomainError(
          'INSPECTION_FINAL_REPORT_RECONCILIATION_REQUIRED',
          'Final report document reservation exists but cannot be resolved.',
        );
      }
    }
  }

  if (document.category !== 'inspection' || document.status !== 'active') {
    throw new DomainError(
      'INSPECTION_FINAL_REPORT_DOCUMENT_INVALID',
      'Canonical final report document has an invalid category or status.',
    );
  }

  const resolveCanonicalVersion = async (): Promise<DocumentVersion | null> => {
    const versions = await deps.documentRepository.listVersionsByDocument(document.id);
    if (versions.length > 1) {
      throw new DomainError(
        'INSPECTION_FINAL_REPORT_VERSION_CONFLICT',
        'Canonical final report document contains more than one version.',
      );
    }
    return versions[0] ?? null;
  };

  const ensureFinal = async (candidate: DocumentVersion): Promise<DocumentVersion> => {
    if (candidate.status === 'final') {
      await assertDocumentVersionStorageIntegrity(deps, candidate);
      return candidate;
    }

    try {
      return await finalizeDocumentVersionCommand(
        {
          documentRepository: deps.documentRepository,
          fileStorage: deps.fileStorage,
          clock: deps.clock,
        },
        actor,
        candidate.id,
      );
    } catch (error) {
      if (
        !(error instanceof DomainError) ||
        ![
          'DOCUMENT_VERSION_CONFLICT',
          'DOCUMENT_VERSION_INVALID_TRANSITION',
        ].includes(error.code)
      ) {
        throw error;
      }
      const winner = await deps.documentRepository.getVersionById(candidate.id);
      if (!winner || winner.status !== 'final') throw error;
      await assertDocumentVersionStorageIntegrity(deps, winner);
      return winner;
    }
  };

  let canonicalVersion = await resolveCanonicalVersion();
  if (!canonicalVersion) {
    const expectedDocumentRevision = document.revision;
    const rendered = await deps.pdfPort.renderInspectionFinalReport(snapshot);
    if (rendered.content.byteLength === 0) {
      throw new DomainError(
        'INSPECTION_FINAL_REPORT_EMPTY',
        'PDF renderer returned empty content.',
      );
    }

    try {
      canonicalVersion = await uploadDocumentVersionCommand(
        {
          documentRepository: deps.documentRepository,
          fileStorage: deps.fileStorage,
          idGenerator: deps.idGenerator,
        },
        actor,
        {
          documentId: document.id,
          fileName: rendered.fileName,
          mimeType: 'application/pdf',
          content: rendered.content,
          expectedDocumentRevision,
        },
      );
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== 'DOCUMENT_VERSION_CONFLICT') {
        throw error;
      }
      canonicalVersion = await resolveCanonicalVersion();
      if (!canonicalVersion) throw error;
    }
  }

  const finalVersion = await ensureFinal(canonicalVersion);

  const evidence = createInspectionFinalReportEvidence(inspection, {
    id: asInspectionEvidenceId(deps.idGenerator.next()),
    documentVersionId: finalVersion.id,
    createdByUserId: actor.userId,
    createdAt: deps.clock.now(),
  });

  try {
    await deps.inspectionRepository.insertFinalReportEvidence(evidence);
    return finalVersion;
  } catch (error) {
    if (
      !(error instanceof DomainError) ||
      ![
        'INSPECTION_FINAL_REPORT_ALREADY_EXISTS',
        'INSPECTION_EVIDENCE_ALREADY_EXISTS',
      ].includes(error.code)
    ) {
      throw error;
    }
    const winner = await resolveExistingEvidence();
    if (!winner) {
      throw new DomainError(
        'INSPECTION_FINAL_REPORT_RECONCILIATION_REQUIRED',
        'Final report uniqueness was claimed but the canonical evidence cannot be resolved.',
      );
    }
    if (winner.id !== finalVersion.id) {
      throw new DomainError(
        'INSPECTION_FINAL_REPORT_VERSION_CONFLICT',
        'Concurrent final report generation resolved to different document versions.',
      );
    }
    return winner;
  }
}
