import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY,
  getDocumentVersionContentQuery,
  uploadDocumentVersionCommand,
  type Actor,
  type DocumentRepository,
  type FileStorageReadPort,
  type FileStorageWritePort,
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
  async listTargetDocuments() { return []; }
}

class TrackingStorage implements FileStorageWritePort {
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

  it('reads stored DocumentVersion bytes through the authorized storage reference', async () => {
    const repository = new FailingDocumentRepository();
    const versionId =
      '50000000-0000-4000-8000-000000000010' as DocumentVersionId;
    const version: DocumentVersion = {
      id: versionId,
      documentId: repository.document.id,
      versionNumber: 1,
      fileName: 'draft-lease.pdf',
      mimeType: 'application/pdf',
      byteSize: 3,
      sha256: 'b'.repeat(64),
      status: 'stored',
      finalizedAt: null,
    };
    const reference: StorageObjectReference = {
      provider: 'test',
      objectId: 'object-10',
      objectKey: `document-version:${versionId}`,
    };

    class ReadRepository extends FailingDocumentRepository {
      override async getVersionById(id: DocumentVersionId) {
        return id === version.id ? version : null;
      }
      override async getStorageReference(id: DocumentVersionId) {
        return id === version.id ? reference : null;
      }
    }

    const storage: FileStorageReadPort = {
      async read(requested) {
        return {
          ...requested,
          byteSize: 3,
          sha256: 'b'.repeat(64),
          content: new Uint8Array([1, 2, 3]),
        };
      },
    };

    const result = await getDocumentVersionContentQuery(
      {
        documentRepository: new ReadRepository(),
        fileStorage: storage,
        binaryPolicy: DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY,
      },
      actor,
      versionId,
    );

    expect(result.version.status).toBe('stored');
    expect([...result.content]).toEqual([1, 2, 3]);
  });

  it('fails closed when storage bytes do not match canonical DocumentVersion metadata', async () => {
    const repository = new FailingDocumentRepository();
    const versionId =
      '50000000-0000-4000-8000-000000000011' as DocumentVersionId;
    const version: DocumentVersion = {
      id: versionId,
      documentId: repository.document.id,
      versionNumber: 1,
      fileName: 'lease.pdf',
      mimeType: 'application/pdf',
      byteSize: 3,
      sha256: 'b'.repeat(64),
      status: 'final',
      finalizedAt: '2026-09-18T20:00:00.000Z',
    };
    const reference: StorageObjectReference = {
      provider: 'test',
      objectId: 'object-11',
      objectKey: `document-version:${versionId}`,
    };

    class ReadRepository extends FailingDocumentRepository {
      override async getVersionById(id: DocumentVersionId) {
        return id === version.id ? version : null;
      }
      override async getStorageReference(id: DocumentVersionId) {
        return id === version.id ? reference : null;
      }
    }

    const storage: FileStorageReadPort = {
      async read(requested) {
        return {
          ...requested,
          byteSize: 3,
          sha256: 'c'.repeat(64),
          content: new Uint8Array([1, 2, 3]),
        };
      },
    };

    await expect(
      getDocumentVersionContentQuery(
        {
          documentRepository: new ReadRepository(),
          fileStorage: storage,
        },
        actor,
        versionId,
      ),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_BINARY_INTEGRITY_MISMATCH',
    });
  });

  it('maps provider read failures to a storage read application error', async () => {
    const repository = new FailingDocumentRepository();
    const versionId =
      '50000000-0000-4000-8000-000000000012' as DocumentVersionId;
    const version: DocumentVersion = {
      id: versionId,
      documentId: repository.document.id,
      versionNumber: 1,
      fileName: 'lease.pdf',
      mimeType: 'application/pdf',
      byteSize: 3,
      sha256: 'b'.repeat(64),
      status: 'final',
      finalizedAt: '2026-09-18T20:00:00.000Z',
    };
    const reference: StorageObjectReference = {
      provider: 'test',
      objectId: 'object-12',
      objectKey: `document-version:${versionId}`,
    };

    class ReadRepository extends FailingDocumentRepository {
      override async getVersionById(id: DocumentVersionId) {
        return id === version.id ? version : null;
      }
      override async getStorageReference(id: DocumentVersionId) {
        return id === version.id ? reference : null;
      }
    }

    const storage: FileStorageReadPort = {
      async read() {
        throw new Error('provider unavailable');
      },
    };

    await expect(
      getDocumentVersionContentQuery(
        {
          documentRepository: new ReadRepository(),
          fileStorage: storage,
        },
        actor,
        versionId,
      ),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_STORAGE_READ_FAILED',
    });
  });


  it('rejects an oversized canonical DocumentVersion before storage is read', async () => {
    const repository = new FailingDocumentRepository();
    const versionId =
      '50000000-0000-4000-8000-000000000013' as DocumentVersionId;
    const version: DocumentVersion = {
      id: versionId,
      documentId: repository.document.id,
      versionNumber: 1,
      fileName: 'oversized.pdf',
      mimeType: 'application/pdf',
      byteSize: 17,
      sha256: 'd'.repeat(64),
      status: 'final',
      finalizedAt: '2026-09-18T20:00:00.000Z',
    };
    const reference: StorageObjectReference = {
      provider: 'test',
      objectId: 'object-13',
      objectKey: `document-version:${versionId}`,
    };

    class ReadRepository extends FailingDocumentRepository {
      override async getVersionById(id: DocumentVersionId) {
        return id === version.id ? version : null;
      }
      override async getStorageReference(id: DocumentVersionId) {
        return id === version.id ? reference : null;
      }
    }

    let readCalls = 0;
    const storage: FileStorageReadPort = {
      async read() {
        readCalls += 1;
        throw new Error('storage must not be touched');
      },
    };

    await expect(
      getDocumentVersionContentQuery(
        {
          documentRepository: new ReadRepository(),
          fileStorage: storage,
          binaryPolicy: { maxBytes: 16 },
        },
        actor,
        versionId,
      ),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_BINARY_DELIVERY_LIMIT_EXCEEDED',
    });
    expect(readCalls).toBe(0);
  });

});
