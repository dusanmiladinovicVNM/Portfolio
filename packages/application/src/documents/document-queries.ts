import {
  DomainError,
  type Document,
  type DocumentId,
  type DocumentLink,
  type DocumentVersion,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { DocumentRepository } from './document-repository.js';

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
