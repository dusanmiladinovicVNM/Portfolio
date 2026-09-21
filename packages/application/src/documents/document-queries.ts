import {
  DomainError,
  type Document,
  type DocumentId,
  type DocumentLink,
  type DocumentVersion,
  type LeaseAgreementId,
  type LeaseAmendmentId,
  type UnitId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type {
  DocumentRepository,
  TargetDocumentReference,
} from './document-repository.js';
import type { LeaseRepository } from '../contracts/lease-repository.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';

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
