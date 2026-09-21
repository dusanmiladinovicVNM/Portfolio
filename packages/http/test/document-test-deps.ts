import type {
  ClockPort,
  DocumentRepository,
  FileStoragePort,
  FileStoragePutInput,
  StorageObjectReference,
  StoredFile,
} from '@portfolio/application';
import type {
  Document,
  DocumentId,
  DocumentLink,
  DocumentVersion,
  DocumentVersionId,
} from '@portfolio/domain';

export class InMemoryDocumentRepository implements DocumentRepository {
  readonly documents = new Map<DocumentId, Document>();
  readonly versions = new Map<DocumentVersionId, DocumentVersion>();
  readonly storage = new Map<DocumentVersionId, StorageObjectReference>();
  readonly links: DocumentLink[] = [];

  async getDocumentById(id: DocumentId) {
    return this.documents.get(id) ?? null;
  }

  async listDocuments() {
    return [...this.documents.values()];
  }

  async documentCodeExists(code: string) {
    return [...this.documents.values()].some(
      (document) => document.code.toLowerCase() === code.toLowerCase(),
    );
  }

  async insertDocument(document: Document) {
    this.documents.set(document.id, document);
  }

  async getVersionById(id: DocumentVersionId) {
    return this.versions.get(id) ?? null;
  }

  async listVersionsByDocument(documentId: DocumentId) {
    return [...this.versions.values()]
      .filter((version) => version.documentId === documentId)
      .sort((left, right) => left.versionNumber - right.versionNumber);
  }

  async insertVersion(
    document: Document,
    expectedDocumentRevision: number,
    version: DocumentVersion,
    storage: StorageObjectReference,
  ) {
    const current = this.documents.get(document.id);
    if (!current || current.revision !== expectedDocumentRevision) {
      throw Object.assign(new Error('version conflict'), {
        code: 'DOCUMENT_VERSION_CONFLICT',
      });
    }
    this.documents.set(document.id, document);
    this.versions.set(version.id, version);
    this.storage.set(version.id, storage);
  }

  async finalizeVersion(version: DocumentVersion) {
    const current = this.versions.get(version.id);
    if (!current || current.status !== 'stored') {
      throw Object.assign(new Error('version conflict'), {
        code: 'DOCUMENT_VERSION_CONFLICT',
      });
    }
    this.versions.set(version.id, version);
  }

  async getStorageReference(versionId: DocumentVersionId) {
    return this.storage.get(versionId) ?? null;
  }

  async insertLink(link: DocumentLink) {
    this.links.push(link);
  }

  async listLinksByDocument(documentId: DocumentId) {
    return this.links.filter((link) => link.documentId === documentId);
  }

  async listTargetDocuments(
    target: import('@portfolio/application').DocumentReadTarget,
  ) {
    return this.links
      .filter(
        (link) =>
          link.targetType === target.targetType &&
          link.targetId === target.targetId,
      )
      .map((link) => {
        const document = this.documents.get(link.documentId);
        if (!document) {
          throw new Error(
            'In-memory document link references a missing document.',
          );
        }

        const linkedVersion =
          link.documentVersionId === null
            ? null
            : this.versions.get(link.documentVersionId) ?? null;

        if (link.documentVersionId !== null && linkedVersion === null) {
          throw new Error(
            'In-memory document link references a missing document version.',
          );
        }

        return { document, link, linkedVersion };
      });
  }
}

export class MemoryFileStorage implements FileStoragePort {
  readonly removed: StorageObjectReference[] = [];
  readonly objects = new Map<string, StoredFile>();

  async put(input: FileStoragePutInput): Promise<StoredFile> {
    const existing = this.objects.get(input.objectKey);
    if (existing) return { ...existing, disposition: 'reused' };

    const stored: StoredFile = {
      provider: 'memory',
      objectId: input.objectKey,
      objectKey: input.objectKey,
      byteSize: input.content.byteLength,
      sha256: 'a'.repeat(64),
      disposition: 'created',
    };
    this.objects.set(input.objectKey, stored);
    return stored;
  }

  async stat(reference: StorageObjectReference) {
    const stored = this.objects.get(reference.objectKey);
    if (!stored || stored.objectId !== reference.objectId) return null;
    return {
      provider: stored.provider,
      objectId: stored.objectId,
      objectKey: stored.objectKey,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
    };
  }

  async remove(reference: StorageObjectReference): Promise<void> {
    this.removed.push(reference);
    this.objects.delete(reference.objectKey);
  }
}

export class FixedClock implements ClockPort {
  constructor(private readonly value = '2026-09-18T20:00:00.000Z') {}

  now(): string {
    return this.value;
  }
}
