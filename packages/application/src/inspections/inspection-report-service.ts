import {
  DomainError,
  type DocumentVersion,
  type InspectionId,
} from '@portfolio/domain';
import { assertDocumentVersionStorageIntegrity } from '../documents/document-commands.js';
import type { DocumentRepository } from '../documents/document-repository.js';
import type { FileStorageWritePort } from '../documents/file-storage-port.js';
import type { InspectionRepository } from './inspection-repository.js';

export interface ResolveInspectionFinalReportDependencies {
  readonly inspectionRepository: InspectionRepository;
  readonly documentRepository: DocumentRepository;
  readonly fileStorage: Pick<FileStorageWritePort, 'stat'>;
}

export async function resolveInspectionFinalReport(
  deps: ResolveInspectionFinalReportDependencies,
  inspectionId: InspectionId,
): Promise<DocumentVersion | null> {
  const existing = (await deps.inspectionRepository.listEvidence(inspectionId))
    .find(
      (item) =>
        item.kind === 'final_report' &&
        item.sectionInstanceId === null &&
        item.sectionId === null &&
        item.itemId === null,
    );
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
}
