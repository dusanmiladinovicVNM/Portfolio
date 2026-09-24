import { DomainError, type DocumentVersionId } from '@portfolio/domain';
import { ApplicationError } from '../shared/application-error.js';
import type { Sha256Port } from '../shared/sha256-port.js';
import type {
  DocumentRepository,
  DocumentStorageLocationRepository,
} from './document-repository.js';
import type {
  FileStorageWritePort,
  StorageObjectReference,
} from './file-storage-port.js';
import { assertBufferedDocumentBinaryWriteSize } from './document-binary-policy.js';
import {
  assertStorageObjectMatchesVersion,
  storageReferenceMatches,
} from './document-storage-integrity.js';

export interface RelocateDocumentVersionStorageDependencies {
  readonly documentRepository: Pick<DocumentRepository, 'getVersionById'> &
    DocumentStorageLocationRepository;
  readonly replacementStorage: Pick<FileStorageWritePort, 'stat'>;
}

export interface RelocateDocumentVersionStorageInput {
  readonly versionId: DocumentVersionId;
  readonly expectedCurrent: StorageObjectReference;
  readonly replacement: StorageObjectReference;
  readonly reason: string;
}

export async function relocateDocumentVersionStorage(
  deps: RelocateDocumentVersionStorageDependencies,
  input: RelocateDocumentVersionStorageInput,
): Promise<StorageObjectReference> {
  const version = await deps.documentRepository.getVersionById(input.versionId);
  if (!version) {
    throw new DomainError(
      'DOCUMENT_VERSION_NOT_FOUND',
      'Document version not found.',
    );
  }

  const reason = input.reason.trim();
  if (!reason) {
    throw new DomainError(
      'DOCUMENT_STORAGE_RELOCATION_REASON_REQUIRED',
      'Storage relocation requires a non-empty recovery reason.',
    );
  }

  if (storageReferenceMatches(input.expectedCurrent, input.replacement)) {
    throw new DomainError(
      'DOCUMENT_STORAGE_RELOCATION_NOOP',
      'Replacement storage locator must differ from the current locator.',
    );
  }

  if (input.expectedCurrent.objectKey !== input.replacement.objectKey) {
    throw new DomainError(
      'DOCUMENT_STORAGE_RELOCATION_OBJECT_KEY_CHANGED',
      'Storage relocation must preserve the stable Portfolio object key.',
    );
  }

  let metadata;
  try {
    metadata = await deps.replacementStorage.stat(input.replacement);
  } catch {
    throw new ApplicationError(
      'DOCUMENT_STORAGE_VERIFICATION_FAILED',
      'Recovered document binary could not be verified against its storage provider.',
    );
  }

  if (!metadata) {
    throw new DomainError(
      'DOCUMENT_BINARY_MISSING',
      'Recovered document binary is missing from storage.',
    );
  }

  assertStorageObjectMatchesVersion(metadata, input.replacement, version);

  await deps.documentRepository.relocateStorageReference(
    version.id,
    input.expectedCurrent,
    input.replacement,
    reason,
  );

  return input.replacement;
}


export interface RecoverDocumentVersionBinaryDependencies {
  readonly documentRepository: Pick<DocumentRepository, 'getVersionById'> &
    DocumentStorageLocationRepository;
  readonly recoveryStorage: FileStorageWritePort;
  readonly sha256: Sha256Port;
}

export interface RecoverDocumentVersionBinaryInput {
  readonly versionId: DocumentVersionId;
  readonly expectedCurrent: StorageObjectReference;
  readonly content: Uint8Array;
  readonly reason: string;
}

export async function recoverDocumentVersionBinary(
  deps: RecoverDocumentVersionBinaryDependencies,
  input: RecoverDocumentVersionBinaryInput,
): Promise<StorageObjectReference> {
  const version = await deps.documentRepository.getVersionById(input.versionId);
  if (!version) {
    throw new DomainError(
      'DOCUMENT_VERSION_NOT_FOUND',
      'Document version not found.',
    );
  }

  const current = await deps.documentRepository.getStorageReference(version.id);
  if (!current) {
    throw new DomainError(
      'DOCUMENT_STORAGE_REFERENCE_MISSING',
      'Document version has no registered storage reference.',
    );
  }
  if (!storageReferenceMatches(current, input.expectedCurrent)) {
    throw new DomainError(
      'DOCUMENT_STORAGE_RELOCATION_CONFLICT',
      'Document storage location changed before recovery upload started.',
    );
  }

  assertBufferedDocumentBinaryWriteSize(input.content.byteLength);

  if (input.content.byteLength !== version.byteSize) {
    throw new DomainError(
      'DOCUMENT_BINARY_INTEGRITY_MISMATCH',
      'Recovery bytes do not match the immutable DocumentVersion byte size.',
    );
  }

  const contentSha256 = (await deps.sha256.digest(input.content)).toLowerCase();
  if (contentSha256 !== version.sha256.toLowerCase()) {
    throw new DomainError(
      'DOCUMENT_BINARY_INTEGRITY_MISMATCH',
      'Recovery bytes do not match the immutable DocumentVersion SHA-256.',
    );
  }

  const stored = await deps.recoveryStorage.put({
    objectKey: input.expectedCurrent.objectKey,
    fileName: version.fileName,
    mimeType: version.mimeType,
    content: input.content,
  });

  assertStorageObjectMatchesVersion(stored, {
    provider: stored.provider,
    objectId: stored.objectId,
    objectKey: stored.objectKey,
  }, version);

  const replacement: StorageObjectReference = {
    provider: stored.provider,
    objectId: stored.objectId,
    objectKey: stored.objectKey,
  };

  if (storageReferenceMatches(input.expectedCurrent, replacement)) {
    return replacement;
  }

  try {
    await deps.documentRepository.relocateStorageReference(
      version.id,
      input.expectedCurrent,
      replacement,
      input.reason.trim() ||
        'restore immutable DocumentVersion from verified backup',
    );
  } catch {
    let persisted: StorageObjectReference | null = null;
    try {
      persisted = await deps.documentRepository.getStorageReference(version.id);
    } catch {
      // Preserve the verified replacement when canonical outcome is unknown.
    }

    if (persisted && storageReferenceMatches(persisted, replacement)) {
      return replacement;
    }

    throw new ApplicationError(
      'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED',
      'Recovered binary was verified in storage but its canonical relocation could not be confirmed. The replacement object was preserved for reconciliation.',
    );
  }

  return replacement;
}
