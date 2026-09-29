import {
  DomainError,
  type DocumentVersion,
  type InspectionId,
} from '@portfolio/domain';
import type { DocumentRepository } from '../documents/document-repository.js';
import type { FileStorageWritePort } from '../documents/file-storage-port.js';
import { requireCapability, type Actor } from '../security/access.js';
import { getInspectionQuery } from './inspection-queries.js';
import type { InspectionRepository } from './inspection-repository.js';
import { resolveInspectionFinalReport } from './inspection-report-service.js';

export interface GetInspectionFinalReportDependencies {
  readonly inspectionRepository: InspectionRepository;
  readonly documentRepository: DocumentRepository;
  readonly fileStorage: Pick<FileStorageWritePort, 'stat'>;
}

export async function getInspectionFinalReportQuery(
  deps: GetInspectionFinalReportDependencies,
  actor: Actor,
  inspectionId: InspectionId,
): Promise<DocumentVersion> {
  requireCapability(actor, 'documents:read');
  const inspection = await getInspectionQuery(
    deps.inspectionRepository,
    actor,
    inspectionId,
  );
  if (inspection.status !== 'finalized') {
    throw new DomainError(
      'INSPECTION_FINAL_REPORT_STATE_INVALID',
      'Final report requires a finalized inspection.',
    );
  }

  const version = await resolveInspectionFinalReport(deps, inspectionId);
  if (!version) {
    throw new DomainError(
      'INSPECTION_FINAL_REPORT_NOT_FOUND',
      'Finalized inspection has no canonical final report yet.',
    );
  }
  return version;
}
