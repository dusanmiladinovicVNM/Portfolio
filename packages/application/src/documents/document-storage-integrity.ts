import {
  DomainError,
  type DocumentVersion,
} from '@portfolio/domain';
import type {
  StorageObjectMetadata,
  StorageObjectReference,
} from './file-storage-port.js';

export function storageMatchesVersion(
  metadata: StorageObjectMetadata,
  version: DocumentVersion,
): boolean {
  return (
    metadata.byteSize === version.byteSize &&
    metadata.sha256.toLowerCase() === version.sha256.toLowerCase()
  );
}

export function storageReferenceMatches(
  left: StorageObjectReference,
  right: StorageObjectReference,
): boolean {
  return (
    left.provider === right.provider &&
    left.objectId === right.objectId &&
    left.objectKey === right.objectKey
  );
}

export function assertStorageObjectMatchesVersion(
  metadata: StorageObjectMetadata,
  reference: StorageObjectReference,
  version: DocumentVersion,
): void {
  if (
    !storageReferenceMatches(metadata, reference) ||
    !storageMatchesVersion(metadata, version)
  ) {
    throw new DomainError(
      'DOCUMENT_BINARY_INTEGRITY_MISMATCH',
      'Stored document binary no longer matches the immutable DocumentVersion metadata.',
    );
  }
}
