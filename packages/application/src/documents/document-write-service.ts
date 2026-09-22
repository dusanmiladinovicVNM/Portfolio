import {
  DomainError,
  addStoredDocumentVersion,
  asDocumentId,
  asDocumentVersionId,
  createDocument,
  finalizeDocumentVersion,
  type Document,
  type DocumentCategory,
  type DocumentId,
  type DocumentVersion,
  type DocumentVersionId,
} from '@portfolio/domain';
import { ApplicationError } from '../shared/application-error.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import { DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY } from './document-binary-policy.js';
import type { DocumentRepository } from './document-repository.js';
import type {
  FileStorageWritePort,
  StorageObjectMetadata,
  StorageObjectReference,
} from './file-storage-port.js';
import {
  assertStorageObjectMatchesVersion,
  storageMatchesVersion,
  storageReferenceMatches,
} from './document-storage-integrity.js';

export interface CreateDocumentRecordInput {
  readonly code: string;
  readonly title: string;
  readonly category: DocumentCategory;
  readonly documentId?: DocumentId;
}

export interface UploadDocumentVersionRecordInput {
  readonly documentId: DocumentId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
  readonly expectedDocumentRevision?: number;
  readonly versionId?: DocumentVersionId;
}

export interface DocumentWriteDependencies {
  readonly documentRepository: DocumentRepository;
  readonly idGenerator: IdGenerator;
}

export interface UploadDocumentVersionRecordDependencies
  extends DocumentWriteDependencies {
  readonly fileStorage: FileStorageWritePort;
}

export interface FinalizeDocumentVersionRecordDependencies {
  readonly documentRepository: DocumentRepository;
  readonly fileStorage: Pick<FileStorageWritePort, 'stat'>;
  readonly clock: ClockPort;
}

async function requireDocument(
  repository: DocumentRepository,
  id: DocumentId,
): Promise<Document> {
  const document = await repository.getDocumentById(id);
  if (!document) {
    throw new DomainError('DOCUMENT_NOT_FOUND', 'Document not found.');
  }
  return document;
}

async function requireVersion(
  repository: DocumentRepository,
  id: DocumentVersionId,
): Promise<DocumentVersion> {
  const version = await repository.getVersionById(id);
  if (!version) {
    throw new DomainError(
      'DOCUMENT_VERSION_NOT_FOUND',
      'Document version not found.',
    );
  }
  return version;
}

export async function createDocumentRecord(
  deps: DocumentWriteDependencies,
  input: CreateDocumentRecordInput,
): Promise<Document> {
  const document = createDocument({
    id: input.documentId ?? asDocumentId(deps.idGenerator.next()),
    code: input.code,
    title: input.title,
    category: input.category,
  });

  if (await deps.documentRepository.documentCodeExists(document.code)) {
    throw new DomainError(
      'DOCUMENT_CODE_ALREADY_EXISTS',
      `Document code '${document.code}' already exists.`,
    );
  }

  await deps.documentRepository.insertDocument(document);
  return document;
}

export async function assertDocumentVersionStorageIntegrity(
  deps: {
    readonly documentRepository: DocumentRepository;
    readonly fileStorage: Pick<FileStorageWritePort, 'stat'>;
  },
  version: DocumentVersion,
): Promise<StorageObjectMetadata> {
  const reference = await deps.documentRepository.getStorageReference(version.id);
  if (!reference) {
    throw new DomainError(
      'DOCUMENT_STORAGE_REFERENCE_MISSING',
      'Document version has no registered storage reference.',
    );
  }

  let metadata: StorageObjectMetadata | null;
  try {
    metadata = await deps.fileStorage.stat(reference);
  } catch {
    throw new ApplicationError(
      'DOCUMENT_STORAGE_VERIFICATION_FAILED',
      'Document binary could not be verified against its storage provider.',
    );
  }

  if (!metadata) {
    throw new DomainError(
      'DOCUMENT_BINARY_MISSING',
      'Document binary is missing from storage.',
    );
  }
  assertStorageObjectMatchesVersion(metadata, reference, version);
  return metadata;
}

export async function uploadDocumentVersionRecord(
  deps: UploadDocumentVersionRecordDependencies,
  input: UploadDocumentVersionRecordInput,
): Promise<DocumentVersion> {
  if (
    input.content.byteLength >
    DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY.maxBytes
  ) {
    throw new ApplicationError(
      'DOCUMENT_BINARY_UPLOAD_LIMIT_EXCEEDED',
      `Buffered Document binary writes support up to ${DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY.maxBytes} bytes.`,
    );
  }

  const document = await requireDocument(
    deps.documentRepository,
    input.documentId,
  );

  if (document.status !== 'active') {
    throw new DomainError(
      'DOCUMENT_NOT_ACTIVE',
      'A new version may only be added to an active document.',
    );
  }

  if (
    input.expectedDocumentRevision !== undefined &&
    document.revision !== input.expectedDocumentRevision
  ) {
    throw new DomainError(
      'DOCUMENT_VERSION_CONFLICT',
      'Document changed before the new version upload started.',
    );
  }

  if (!input.fileName.trim() || !input.mimeType.trim() || input.content.byteLength === 0) {
    throw new DomainError(
      'DOCUMENT_INVALID_UPLOAD',
      'fileName, mimeType and non-empty content are required.',
    );
  }

  const versionId = input.versionId ?? asDocumentVersionId(deps.idGenerator.next());
  const objectKey = `document-version:${versionId}`;

  const stored = await deps.fileStorage.put({
    objectKey,
    fileName: input.fileName.trim(),
    mimeType: input.mimeType.trim().toLowerCase(),
    content: input.content,
  });

  const added = addStoredDocumentVersion(document, {
    id: versionId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteSize: stored.byteSize,
    sha256: stored.sha256,
  });

  const storage: StorageObjectReference = {
    provider: stored.provider,
    objectId: stored.objectId,
    objectKey: stored.objectKey,
  };

  try {
    await deps.documentRepository.insertVersion(
      added.document,
      document.revision,
      added.version,
      storage,
    );
  } catch (persistenceError) {
    try {
      const persisted = await deps.documentRepository.getVersionById(versionId);
      if (persisted) {
        const persistedStorage =
          await deps.documentRepository.getStorageReference(versionId);
        const sameVersionRegistration =
          persistedStorage !== null &&
          persisted.documentId === added.version.documentId &&
          persisted.versionNumber === added.version.versionNumber &&
          persisted.fileName === added.version.fileName &&
          persisted.mimeType === added.version.mimeType &&
          storageMatchesVersion(stored, persisted);

        if (sameVersionRegistration && persistedStorage) {
          if (storageReferenceMatches(persistedStorage, storage)) {
            return persisted;
          }

          if (stored.disposition === 'created') {
            let canonicalMetadata: StorageObjectMetadata | null;
            try {
              canonicalMetadata = await deps.fileStorage.stat(
                persistedStorage,
              );
            } catch {
              throw new ApplicationError(
                'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED',
                'A concurrent DocumentVersion winner exists but its canonical storage object could not be verified. The losing upload was preserved for reconciliation.',
              );
            }

            if (!canonicalMetadata) {
              throw new ApplicationError(
                'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED',
                'A concurrent DocumentVersion winner exists but its canonical storage object is missing. The losing upload was preserved for reconciliation.',
              );
            }

            try {
              assertStorageObjectMatchesVersion(
                canonicalMetadata,
                persistedStorage,
                persisted,
              );
            } catch {
              throw new ApplicationError(
                'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED',
                'A concurrent DocumentVersion winner exists but canonical storage does not match it. The losing upload was preserved for reconciliation.',
              );
            }

            try {
              await deps.fileStorage.remove(storage);
            } catch {
              throw new ApplicationError(
                'DOCUMENT_STORAGE_COMPENSATION_FAILED',
                'A concurrent DocumentVersion winner was verified but the losing newly created storage object could not be removed.',
              );
            }

            return persisted;
          }
        }

        throw new ApplicationError(
          'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED',
          'Document registration returned an error but persisted state does not match the uploaded binary.',
        );
      }
    } catch (reconciliationError) {
      if (
        reconciliationError instanceof ApplicationError &&
        [
          'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED',
          'DOCUMENT_STORAGE_COMPENSATION_FAILED',
        ].includes(reconciliationError.code)
      ) {
        throw reconciliationError;
      }
      throw new ApplicationError(
        'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED',
        'Document registration outcome could not be verified. The storage object was preserved for reconciliation.',
      );
    }

    if (stored.disposition === 'created') {
      try {
        await deps.fileStorage.remove(storage);
      } catch {
        throw new ApplicationError(
          'DOCUMENT_STORAGE_COMPENSATION_FAILED',
          'Document metadata was confirmed absent but the newly created storage object could not be removed. Manual storage reconciliation is required.',
        );
      }
    }
    throw persistenceError;
  }

  return added.version;
}

export async function finalizeDocumentVersionRecord(
  deps: FinalizeDocumentVersionRecordDependencies,
  versionId: DocumentVersionId,
): Promise<DocumentVersion> {
  const current = await requireVersion(deps.documentRepository, versionId);
  await assertDocumentVersionStorageIntegrity(deps, current);
  const finalized = finalizeDocumentVersion(current, deps.clock.now());
  await deps.documentRepository.finalizeVersion(finalized);
  return finalized;
}
