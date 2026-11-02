import {
  DomainError,
  asInspectionId,
  type InspectionId,
  type Document,
  type DocumentId,
  type DocumentLink,
  type DocumentVersion,
  type DocumentVersionId,
  type LeaseAgreementId,
  type LeaseAmendmentId,
  type UnitId,
} from '@portfolio/domain';
import { ApplicationError } from '../shared/application-error.js';
import { requireCapability, type Actor } from '../security/access.js';
import type {
  DocumentRepository,
  TargetDocumentReference,
} from './document-repository.js';
import type { InspectionRepository } from '../inspections/inspection-repository.js';
import type { LeaseRepository } from '../contracts/lease-repository.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import {
  assertStorageObjectMatchesVersion,
} from './document-storage-integrity.js';
import type { BufferedDocumentBinaryPolicy } from './document-binary-policy.js';
import type { FileStorageReadPort } from './file-storage-port.js';

type InspectionReadRepository = Pick<InspectionRepository, 'getById'>;

/** Canonical inspection-generated documents also exist before they are
 * attached to evidence/signatures. The source ID is therefore extracted from
 * the server-generated Document.code AND checked against FK provenance. */
function canonicalInspectionId(document: Document): InspectionId | null {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const final = new RegExp('^INSPECTION-FINAL-(' + uuid + ')$', 'i').exec(document.code);
  const binary = new RegExp('^INSPECTION-(' + uuid + ')-(?:photo|attachment|signature)-' + uuid + '$', 'i').exec(document.code);
  const id = final?.[1] ?? binary?.[1];
  return id ? asInspectionId(id) : null;
}

async function canReadDocument(
  documentRepository: DocumentRepository,
  inspectionRepository: InspectionReadRepository,
  actor: Actor,
  document: Document,
): Promise<boolean> {
  if (actor.role !== 'inspector') return true;

  // A missing provenance adapter must never turn into an allow-all policy.
  if (!documentRepository.listInspectionIdsForDocument) return false;
  const related = await documentRepository.listInspectionIdsForDocument(document.id);
  const canonical = canonicalInspectionId(document);
  const prefixed = document.code.toUpperCase().startsWith('INSPECTION-');
  if (prefixed && !canonical) return false;

  const owners = new Set<InspectionId>(related);
  if (canonical) owners.add(canonical);
  if (owners.size === 0) {
    // An unclassified signature/report is not a company-wide document.
    return document.category !== 'signature' && document.category !== 'inspection';
  }
  for (const id of owners) {
    const inspection = await inspectionRepository.getById(id);
    if (!inspection || inspection.assignedToUserId !== actor.userId) return false;
  }
  return true;
}

async function assertDocumentReadable(
  documentRepository: DocumentRepository,
  inspectionRepository: InspectionReadRepository,
  actor: Actor,
  document: Document,
): Promise<void> {
  if (!(await canReadDocument(documentRepository, inspectionRepository, actor, document))) {
    throw new DomainError(
      'INSPECTION_ACCESS_DENIED',
      'Inspector may only access documents belonging to their assigned inspections.',
    );
  }
}

async function visibleDocumentReferences(
  documentRepository: DocumentRepository,
  inspectionRepository: InspectionReadRepository,
  actor: Actor,
  references: readonly TargetDocumentReference[],
): Promise<readonly TargetDocumentReference[]> {
  if (actor.role !== 'inspector') return references;
  const allowed = await Promise.all(references.map(async (reference) =>
    canReadDocument(documentRepository, inspectionRepository, actor, reference.document),
  ));
  return references.filter((_, index) => allowed[index]);
}

export async function listDocumentsQuery(
  repository: DocumentRepository,
  actor: Actor,
  inspections: InspectionReadRepository,
): Promise<readonly Document[]> {
  requireCapability(actor, 'documents:read');
  const documents = await repository.listDocuments();
  if (actor.role !== 'inspector') return documents;
  const allowed = await Promise.all(documents.map((document) =>
    canReadDocument(repository, inspections, actor, document),
  ));
  return documents.filter((_, index) => allowed[index]);
}

export async function getDocumentQuery(
  repository: DocumentRepository,
  actor: Actor,
  id: DocumentId,
  inspections: InspectionReadRepository,
): Promise<Document> {
  requireCapability(actor, 'documents:read');
  const document = await repository.getDocumentById(id);
  if (!document) throw new DomainError('DOCUMENT_NOT_FOUND', 'Document not found.');
  await assertDocumentReadable(repository, inspections, actor, document);
  return document;
}

export async function listDocumentVersionsQuery(
  repository: DocumentRepository,
  actor: Actor,
  id: DocumentId,
  inspections: InspectionReadRepository,
): Promise<readonly DocumentVersion[]> {
  const document = await getDocumentQuery(repository, actor, id, inspections);
  return repository.listVersionsByDocument(document.id);
}

export async function listDocumentLinksQuery(
  repository: DocumentRepository,
  actor: Actor,
  id: DocumentId,
  inspections: InspectionReadRepository,
): Promise<readonly DocumentLink[]> {
  const document = await getDocumentQuery(repository, actor, id, inspections);
  return repository.listLinksByDocument(document.id);
}

export async function listUnitDocumentsQuery(
  documentRepository: DocumentRepository,
  portfolioRepository: PortfolioRepository,
  actor: Actor,
  unitId: UnitId,
  inspections: InspectionReadRepository,
): Promise<readonly TargetDocumentReference[]> {
  requireCapability(actor, 'documents:read');
  if (!(await portfolioRepository.getUnitById(unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }
  return visibleDocumentReferences(
    documentRepository, inspections, actor,
    await documentRepository.listUnitDossierDocuments(unitId),
  );
}

export async function listLeaseAgreementDocumentsQuery(
  documentRepository: DocumentRepository,
  leaseRepository: LeaseRepository,
  actor: Actor,
  agreementId: LeaseAgreementId,
  inspections: InspectionReadRepository,
): Promise<readonly TargetDocumentReference[]> {
  requireCapability(actor, 'documents:read');
  if (!(await leaseRepository.getAgreementById(agreementId))) {
    throw new DomainError('LEASE_AGREEMENT_NOT_FOUND', 'Lease agreement not found.');
  }
  return visibleDocumentReferences(
    documentRepository, inspections, actor,
    await documentRepository.listTargetDocuments({ targetType: 'lease_agreement', targetId: agreementId }),
  );
}

export async function listLeaseAmendmentDocumentsQuery(
  documentRepository: DocumentRepository,
  leaseRepository: LeaseRepository,
  actor: Actor,
  amendmentId: LeaseAmendmentId,
  inspections: InspectionReadRepository,
): Promise<readonly TargetDocumentReference[]> {
  requireCapability(actor, 'documents:read');
  if (!(await leaseRepository.getAmendmentById(amendmentId))) {
    throw new DomainError('LEASE_AMENDMENT_NOT_FOUND', 'Lease amendment not found.');
  }
  return visibleDocumentReferences(
    documentRepository, inspections, actor,
    await documentRepository.listTargetDocuments({ targetType: 'lease_amendment', targetId: amendmentId }),
  );
}

export interface DocumentVersionContent {
  readonly version: DocumentVersion;
  readonly content: Uint8Array;
}

export async function getDocumentVersionContentQuery(
  deps: {
    readonly documentRepository: DocumentRepository;
    readonly fileStorage: FileStorageReadPort;
    readonly binaryPolicy: BufferedDocumentBinaryPolicy;
    readonly inspectionRepository?: InspectionReadRepository;
  },
  actor: Actor,
  versionId: DocumentVersionId,
): Promise<DocumentVersionContent> {
  requireCapability(actor, 'documents:read');

  const version = await deps.documentRepository.getVersionById(versionId);
  if (!version) {
    throw new DomainError(
      'DOCUMENT_VERSION_NOT_FOUND',
      'Document version not found.',
    );
  }

  if (actor.role === 'inspector') {
    if (!deps.inspectionRepository) {
      throw new DomainError('INSPECTION_ACCESS_DENIED', 'Inspection document scope is unavailable.');
    }
    const document = await deps.documentRepository.getDocumentById(version.documentId);
    if (!document) throw new DomainError('DOCUMENT_NOT_FOUND', 'Document not found.');
    await assertDocumentReadable(deps.documentRepository, deps.inspectionRepository, actor, document);
  }

  if (version.byteSize > deps.binaryPolicy.maxBytes) {
    throw new ApplicationError(
      'DOCUMENT_BINARY_DELIVERY_LIMIT_EXCEEDED',
      `Buffered binary delivery supports DocumentVersions up to ${deps.binaryPolicy.maxBytes} bytes.`,
    );
  }

  const reference =
    await deps.documentRepository.getStorageReference(version.id);
  if (!reference) {
    throw new DomainError(
      'DOCUMENT_STORAGE_REFERENCE_MISSING',
      'Document version has no registered storage reference.',
    );
  }

  let stored;
  try {
    stored = await deps.fileStorage.read(reference, deps.binaryPolicy);
  } catch {
    throw new ApplicationError(
      'DOCUMENT_STORAGE_READ_FAILED',
      'Document binary could not be read from its storage provider.',
    );
  }

  if (!stored) {
    throw new DomainError(
      'DOCUMENT_BINARY_MISSING',
      'Document binary is missing from storage.',
    );
  }

  if (stored.content.byteLength !== stored.byteSize) {
    throw new DomainError(
      'DOCUMENT_BINARY_INTEGRITY_MISMATCH',
      'Stored document binary length does not match storage metadata.',
    );
  }

  assertStorageObjectMatchesVersion(stored, reference, version);

  return {
    version,
    content: stored.content,
  };
}
