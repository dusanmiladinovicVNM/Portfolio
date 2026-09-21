import {
  DomainError,
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
import type { LeaseRepository } from '../contracts/lease-repository.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import {
  assertStorageObjectMatchesVersion,
} from './document-storage-integrity.js';
import type { BufferedDocumentBinaryPolicy } from './document-binary-policy.js';
import type { FileStorageReadPort } from './file-storage-port.js';

export async function listDocumentsQuery(
  repository: DocumentRepository,
  actor: Actor,
): Promise<readonly Document[]> {
  requireCapability(actor, 'documents:read');
  return repository.listDocuments();
}

export async function getDocumentQuery(
  repository: DocumentRepository,
  actor: Actor,
  id: DocumentId,
): Promise<Document> {
  requireCapability(actor, 'documents:read');
  const document = await repository.getDocumentById(id);
  if (!document) throw new DomainError('DOCUMENT_NOT_FOUND', 'Document not found.');
  return document;
}

export async function listDocumentVersionsQuery(
  repository: DocumentRepository,
  actor: Actor,
  id: DocumentId,
): Promise<readonly DocumentVersion[]> {
  requireCapability(actor, 'documents:read');
  const document = await repository.getDocumentById(id);
  if (!document) throw new DomainError('DOCUMENT_NOT_FOUND', 'Document not found.');
  return repository.listVersionsByDocument(id);
}

export async function listDocumentLinksQuery(
  repository: DocumentRepository,
  actor: Actor,
  id: DocumentId,
): Promise<readonly DocumentLink[]> {
  requireCapability(actor, 'documents:read');
  const document = await repository.getDocumentById(id);
  if (!document) throw new DomainError('DOCUMENT_NOT_FOUND', 'Document not found.');
  return repository.listLinksByDocument(id);
}


export async function listUnitDocumentsQuery(
  documentRepository: DocumentRepository,
  portfolioRepository: PortfolioRepository,
  actor: Actor,
  unitId: UnitId,
): Promise<readonly TargetDocumentReference[]> {
  requireCapability(actor, 'documents:read');

  if (!(await portfolioRepository.getUnitById(unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  return documentRepository.listTargetDocuments({
    targetType: 'unit',
    targetId: unitId,
  });
}

export async function listLeaseAgreementDocumentsQuery(
  documentRepository: DocumentRepository,
  leaseRepository: LeaseRepository,
  actor: Actor,
  agreementId: LeaseAgreementId,
): Promise<readonly TargetDocumentReference[]> {
  requireCapability(actor, 'documents:read');

  if (!(await leaseRepository.getAgreementById(agreementId))) {
    throw new DomainError(
      'LEASE_AGREEMENT_NOT_FOUND',
      'Lease agreement not found.',
    );
  }

  return documentRepository.listTargetDocuments({
    targetType: 'lease_agreement',
    targetId: agreementId,
  });
}

export async function listLeaseAmendmentDocumentsQuery(
  documentRepository: DocumentRepository,
  leaseRepository: LeaseRepository,
  actor: Actor,
  amendmentId: LeaseAmendmentId,
): Promise<readonly TargetDocumentReference[]> {
  requireCapability(actor, 'documents:read');

  if (!(await leaseRepository.getAmendmentById(amendmentId))) {
    throw new DomainError(
      'LEASE_AMENDMENT_NOT_FOUND',
      'Lease amendment not found.',
    );
  }

  return documentRepository.listTargetDocuments({
    targetType: 'lease_amendment',
    targetId: amendmentId,
  });
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
