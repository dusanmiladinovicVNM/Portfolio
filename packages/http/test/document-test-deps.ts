import type {
  ClockPort,
  DocumentRepository,
  FileStoragePort,
  FileStoragePutInput,
  PdfPort,
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

  async insertGeneratedFinal(
    document: Document,
    version: DocumentVersion,
    storage: StorageObjectReference,
  ) {
    this.documents.set(document.id, document);
    this.versions.set(version.id, version);
    this.storage.set(version.id, storage);
  }

  async insertLink(link: DocumentLink) {
    this.links.push(link);
  }

  async listLinksByDocument(documentId: DocumentId) {
    return this.links.filter((link) => link.documentId === documentId);
  }
}

export class MemoryFileStorage implements FileStoragePort {
  readonly removed: StorageObjectReference[] = [];

  async put(input: FileStoragePutInput): Promise<StoredFile> {
    return {
      provider: 'memory',
      objectId: input.objectKey,
      objectKey: input.objectKey,
      byteSize: input.content.byteLength,
      sha256: 'a'.repeat(64),
    };
  }

  async remove(reference: StorageObjectReference): Promise<void> {
    this.removed.push(reference);
  }
}

export class FixedClock implements ClockPort {
  constructor(private readonly value = '2026-09-18T20:00:00.000Z') {}

  now(): string {
    return this.value;
  }
}

export class MemoryPdfPort implements PdfPort {
  readonly snapshots: import('@portfolio/domain').InspectionFinalSnapshot[] = [];

  async renderInspectionReport(
    snapshot: import('@portfolio/domain').InspectionFinalSnapshot,
  ): Promise<Uint8Array> {
    this.snapshots.push(snapshot);
    return new TextEncoder().encode(
      JSON.stringify({
        inspectionId: snapshot.inspection.id,
        contentRevision: snapshot.inspection.contentRevision,
      }),
    );
  }
}
