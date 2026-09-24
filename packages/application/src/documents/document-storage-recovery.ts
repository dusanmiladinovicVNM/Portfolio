import { DomainError, type DocumentVersionId } from '@portfolio/domain';
import { ApplicationError } from '../shared/application-error.js';
import type {
  DocumentRepository,
  DocumentStorageLocationRepository,
} from './document-repository.js';
import type {
  FileStorageWritePort,
  StorageObjectReference,
} from './file-storage-port.js';
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
