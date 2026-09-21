import { describe, expect, it } from 'vitest';
import {
  uploadDocumentVersionCommand,
  type Actor,
  type DocumentRepository,
  type FileStoragePort,
  type IdGenerator,
  type StorageObjectReference,
} from '../src/index.js';
import {
  asDocumentId,
  createDocument,
  type Document,
  type DocumentId,
  type DocumentLink,
  type DocumentVersion,
  type DocumentVersionId,
  type UnitId,
} from '@portfolio/domain';

const actor: Actor = {
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as never,
  role: 'admin',
};

class FixedId implements IdGenerator {
  next() {
    return '50000000-0000-4000-8000-000000000002';
  }
}

class FailingDocumentRepository implements DocumentRepository {
  readonly document: Document = createDocument({
    id: asDocumentId('50000000-0000-4000-8000-000000000001'),
    code: 'DOC-1',
    title: 'Document',
    category: 'legal',
  });

  async getDocumentById(id: DocumentId) {
    return id === this.document.id ? this.document : null;
  }
  async listDocuments() { return [this.document]; }
  async documentCodeExists() { return false; }
  async insertDocument() {}
  async getVersionById(_id: DocumentVersionId): Promise<DocumentVersion | null> { return null; }
  async listVersionsByDocument(): Promise<readonly DocumentVersion[]> { return []; }
  async insertVersion(
    _document: Document,
    _expectedDocumentRevision: number,
    _version: DocumentVersion,
    _storage: StorageObjectReference,
  ) { throw new Error('database unavailable'); }
  async finalizeVersion() {}
  async getStorageReference(
    _versionId: DocumentVersionId,
  ): Promise<StorageObjectReference | null> { return null; }
  async insertLink(_link: DocumentLink) {}
  async listLinksByDocument(): Promise<readonly DocumentLink[]> { return []; }
  async listUnitDocuments(_unitId: UnitId) { return []; }
}

class TrackingStorage implements FileStoragePort {
  readonly removed: StorageObjectReference[] = [];
  constructor(private readonly removeFails = false) {}

  async put(input: { objectKey: string; content: Uint8Array }) {
    return {
      provider: 'test',
      objectId: 'stored-object',
      objectKey: input.objectKey,
      byteSize: input.content.byteLength,
      sha256: 'a'.repeat(64),
      disposition: 'created' as const,
    };
  }

  async stat(reference: StorageObjectReference) {
    return {
      ...reference,
      byteSize: 3,
      sha256: 'a'.repeat(64),
    };
  }

  async remove(reference: StorageObjectReference) {
    this.removed.push(reference);
    if (this.removeFails) throw new Error('delete failed');
  }
}

class AmbiguousCommitDocumentRepository extends FailingDocumentRepository {
  private persisted: DocumentVersion | null = null;
  private persistedStorage: StorageObjectReference | null = null;

  override async getVersionById(id: DocumentVersionId) {
    return this.persisted?.id === id ? this.persisted : null;
  }

  override async getStorageReference(versionId: DocumentVersionId) {
    return this.persisted?.id === versionId ? this.persistedStorage : null;
  }

  override async insertVersion(
    _document: Document,
    _expectedDocumentRevision: number,
    version: DocumentVersion,
    storage: StorageObjectReference,
  ) {
    this.persisted = version;
    this.persistedStorage = storage;
    throw new Error('commit acknowledgement lost');
  }
}

describe('Document application workflow', () => {
  it('removes the uploaded object when database registration fails', async () => {
    const repository = new FailingDocumentRepository();
    const storage = new TrackingStorage();

    await expect(
      uploadDocumentVersionCommand(
        {
          documentRepository: repository,
          fileStorage: storage,
          idGenerator: new FixedId(),
        },
        actor,
        {
          documentId: repository.document.id,
          fileName: 'lease.pdf',
          mimeType: 'application/pdf',
          content: new Uint8Array([1, 2, 3]),
        },
      ),
    ).rejects.toThrowError('database unavailable');

    expect(storage.removed).toEqual([
      {
        provider: 'test',
        objectId: 'stored-object',
        objectKey:
          'document-version:50000000-0000-4000-8000-000000000002',
      },
    ]);
  });

  it('recovers a committed version when the database acknowledgement is lost', async () => {
    const repository = new AmbiguousCommitDocumentRepository();
    const storage = new TrackingStorage();

    const version = await uploadDocumentVersionCommand(
      {
        documentRepository: repository,
        fileStorage: storage,
        idGenerator: new FixedId(),
      },
      actor,
      {
        documentId: repository.document.id,
        fileName: 'lease.pdf',
        mimeType: 'application/pdf',
        content: new Uint8Array([1, 2, 3]),
      },
    );

    expect(version.id).toBe(
      '50000000-0000-4000-8000-000000000002',
    );
    expect(storage.removed).toEqual([]);
  });

  it('surfaces a reconciliation error if compensating storage delete also fails', async () => {
    const repository = new FailingDocumentRepository();
    const storage = new TrackingStorage(true);

    await expect(
      uploadDocumentVersionCommand(
        {
          documentRepository: repository,
          fileStorage: storage,
          idGenerator: new FixedId(),
        },
        actor,
        {
          documentId: repository.document.id,
          fileName: 'lease.pdf',
          mimeType: 'application/pdf',
          content: new Uint8Array([1]),
        },
      ),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_STORAGE_COMPENSATION_FAILED',
    });
  });
});
