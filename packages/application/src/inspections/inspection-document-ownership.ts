import {
  DomainError,
  type Document,
  type DocumentVersion,
  type InspectionEvidenceKind,
  type InspectionId,
} from '@portfolio/domain';
import type { DocumentRepository } from '../documents/document-repository.js';

type AttachmentPurpose = Exclude<InspectionEvidenceKind, 'final_report'>;
type ReferencePurpose = AttachmentPurpose | 'signature';

/**
 * Inspectors may supply a DocumentVersionId when recording evidence or
 * signatures. An authorized Inspection write is not authorization to bind
 * another Inspection's binary. All roles must preserve this ownership invariant.
 *
 * Inspection-scoped uploads have a canonical server-generated Document code.
 * Ordinary business documents may be attached as evidence only when no
 * Inspection already claims them; signatures must always be scoped uploads.
 */
export async function assertInspectionVersionOwnership(
  repository: DocumentRepository,
  inspectionId: InspectionId,
  version: DocumentVersion,
  purpose: ReferencePurpose,
): Promise<Document> {
  const document = await repository.getDocumentById(version.documentId);
  if (!document) {
    throw new DomainError('DOCUMENT_NOT_FOUND', 'Document version has no parent document.');
  }
  const deny = (): never => {
    throw new DomainError(
      'INSPECTION_ACCESS_DENIED',
      'Document version cannot be registered for this Inspection.',
    );
  };

  // Never rely on the absence of an adapter as evidence of global ownership.
  if (!repository.listInspectionIdsForDocument) return deny();
  const existingOwners = await repository.listInspectionIdsForDocument(document.id);
  if (existingOwners.some((owner) => owner !== inspectionId)) return deny();

  const code = document.code.toLowerCase();
  const expectedCode = `INSPECTION-${inspectionId}-${purpose}-${version.id}`.toLowerCase();
  const inspectionPrefixed = code.startsWith('inspection-');

  if (purpose === 'signature') {
    if (document.category !== 'signature' || code !== expectedCode) return deny();
  } else if (inspectionPrefixed) {
    const expectedCategory = purpose === 'photo' ? 'photo' : 'inspection';
    if (code !== expectedCode || document.category !== expectedCategory) return deny();
  } else {
    // Explicit global-document exception: a business document can be used as
    // evidence only before it is associated with another Inspection, and
    // neither signatures nor unscoped Inspection reports qualify.
    if (document.category === 'signature' || document.category === 'inspection') {
      return deny();
    }
    if (purpose === 'photo' && document.category !== 'photo') return deny();
  }

  return document;
}
