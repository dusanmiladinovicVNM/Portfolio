import type {
  Document,
  DocumentId,
  DocumentLink,
  DocumentVersion,
  DocumentVersionId,
} from '@portfolio/domain';
import type { StorageObjectReference } from './file-storage-port.js';

export interface DocumentRepository {
  getDocumentById(id: DocumentId): Promise<Document | null>;
  listDocuments(): Promise<readonly Document[]>;
  documentCodeExists(code: string): Promise<boolean>;
  insertDocument(document: Document): Promise<void>;

  getVersionById(id: DocumentVersionId): Promise<DocumentVersion | null>;
  listVersionsByDocument(
    documentId: DocumentId,
  ): Promise<readonly DocumentVersion[]>;
  insertVersion(
    document: Document,
    expectedDocumentRevision: number,
    version: DocumentVersion,
    storage: StorageObjectReference,
  ): Promise<void>;
  finalizeVersion(version: DocumentVersion): Promise<void>;
  getStorageReference(
    versionId: DocumentVersionId,
  ): Promise<StorageObjectReference | null>;

  insertLink(link: DocumentLink): Promise<void>;
  listLinksByDocument(documentId: DocumentId): Promise<readonly DocumentLink[]>;
}
