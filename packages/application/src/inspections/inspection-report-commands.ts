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

  const existing = (await deps.inspectionRepository.listEvidence(inspectionId))
    .find((item) => item.kind === 'final_report');
  if (existing) {
    const version = await deps.documentRepository.getVersionById(
      existing.documentVersionId,
    );
    if (!version) {
      throw new DomainError(
        'INSPECTION_FINAL_REPORT_DOCUMENT_MISSING',
        'Final report evidence references a missing document version.',
      );
    }
    return version;
  }

  const snapshot = await deps.inspectionRepository.getFinalSnapshot(inspectionId);
  if (!snapshot) {
    throw new DomainError(
      'INSPECTION_FINAL_SNAPSHOT_NOT_FOUND',
      'Finalized inspection is missing its final snapshot.',
    );
  }

  const rendered = await deps.pdfPort.renderInspectionFinalReport(snapshot);
  if (rendered.content.byteLength === 0) {
    throw new DomainError(
      'INSPECTION_FINAL_REPORT_EMPTY',
      'PDF renderer returned empty content.',
    );
  }

  const document = await createDocumentCommand(
    {
      documentRepository: deps.documentRepository,
      idGenerator: deps.idGenerator,
    },
    actor,
    {
      code: `INSPECTION-FINAL-${inspection.id}`,
      title: `${inspection.code} final inspection report`,
      category: 'inspection',
    },
  );

  const stored = await uploadDocumentVersionCommand(
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
    },
  );

  const finalVersion = await finalizeDocumentVersionCommand(
    {
      documentRepository: deps.documentRepository,
      clock: deps.clock,
    },
    actor,
    stored.id,
  );

  const evidence = createInspectionFinalReportEvidence(inspection, {
    id: asInspectionEvidenceId(deps.idGenerator.next()),
    documentVersionId: finalVersion.id,
    createdByUserId: actor.userId,
    createdAt: deps.clock.now(),
  });
  await deps.inspectionRepository.insertFinalReportEvidence(evidence);

  return finalVersion;
}
