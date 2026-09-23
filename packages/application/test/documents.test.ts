import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY,
  finalizeDocumentVersionCommand,
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
  putCalls = 0;
  constructor(private readonly removeFails = false) {}

  async put(input: { objectKey: string; content: Uint8Array }) {
    this.putCalls += 1;
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

class ConcurrentWinnerDocumentRepository
  extends FailingDocumentRepository {
  private persisted: DocumentVersion | null = null;
  private persistedStorage: StorageObjectReference | null = null;

  override async getVersionById(id: DocumentVersionId) {
    return this.persisted?.id === id ? this.persisted : null;
  }

  override async getStorageReference(versionId: DocumentVersionId) {
    return this.persisted?.id === versionId
      ? this.persistedStorage
      : null;
  }

  override async insertVersion(
    _document: Document,
    _expectedDocumentRevision: number,
    version: DocumentVersion,
    storage: StorageObjectReference,
  ) {
    this.persisted = version;
    this.persistedStorage = {
      ...storage,
      objectId: 'canonical-winner-object',
    };
    throw new Error('concurrent winner committed first');
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
  it('rejects an oversized internal binary write before storage is touched', async () => {
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
          fileName: 'oversized.pdf',
          mimeType: 'application/pdf',
          content: new Uint8Array(
            DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY.maxBytes + 1,
          ),
        },
      ),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_BINARY_UPLOAD_LIMIT_EXCEEDED',
    });

    expect(storage.putCalls).toBe(0);
  });

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

  it('reconciles a concurrent same-version storage loser against the canonical DB winner', async () => {
    const repository = new ConcurrentWinnerDocumentRepository();
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
    expect(storage.removed).toEqual([
      {
        provider: 'test',
        objectId: 'stored-object',
        objectKey:
          'document-version:50000000-0000-4000-8000-000000000002',
      },
    ]);
  });

  it('surfaces cleanup failure after a concurrent canonical winner was verified', async () => {
    const repository = new ConcurrentWinnerDocumentRepository();
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
          content: new Uint8Array([1, 2, 3]),
        },
      ),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_STORAGE_COMPENSATION_FAILED',
    });

    expect(storage.removed).toHaveLength(1);
  });

  it('preserves the losing upload when the concurrent canonical storage cannot be verified', async () => {
    const repository = new ConcurrentWinnerDocumentRepository();

    class InvalidWinnerStorage extends TrackingStorage {
      override async stat(reference: StorageObjectReference) {
        return {
          ...reference,
          byteSize: 3,
          sha256: 'b'.repeat(64),
        };
      }
    }

    const storage = new InvalidWinnerStorage();

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
    ).rejects.toMatchObject({
      code: 'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED',
    });

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

  it('preserves the strict finalize lifecycle for an already-final DocumentVersion', async () => {
    const repository = new FailingDocumentRepository();
    const versionId =
      '50000000-0000-4000-8000-000000000009' as DocumentVersionId;
    const version: DocumentVersion = {
      id: versionId,
      documentId: repository.document.id,
      versionNumber: 1,
      fileName: 'already-final.pdf',
      mimeType: 'application/pdf',
      byteSize: 3,
      sha256: 'a'.repeat(64),
      status: 'final',
      finalizedAt: '2026-09-18T19:00:00.000Z',
    };
    const reference: StorageObjectReference = {
      provider: 'test',
      objectId: 'object-9',
      objectKey: `document-version:${versionId}`,
    };

    class FinalRepository extends FailingDocumentRepository {
      override async getVersionById(id: DocumentVersionId) {
        return id === version.id ? version : null;
      }
      override async getStorageReference(id: DocumentVersionId) {
        return id === version.id ? reference : null;
      }
    }

    await expect(
      finalizeDocumentVersionCommand(
        {
          documentRepository: new FinalRepository(),
          fileStorage: new TrackingStorage(),
          clock: { now: () => '2026-09-18T20:00:00.000Z' },
        },
        actor,
        versionId,
      ),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_VERSION_INVALID_TRANSITION',
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
          binaryPolicy: DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY,
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
          binaryPolicy: DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY,
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
