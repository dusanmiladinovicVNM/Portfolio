import type { BufferedDocumentBinaryPolicy } from './document-binary-policy.js';

export interface FileStoragePutInput {
  readonly objectKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
}

export interface StorageObjectReference {
  readonly provider: string;
  readonly objectId: string;
  readonly objectKey: string;
}

export interface StorageObjectMetadata extends StorageObjectReference {
  readonly byteSize: number;
  readonly sha256: string;
}

export interface StorageObjectContent extends StorageObjectMetadata {
  /**
   * Exact bytes represented by byteSize/sha256.
   * Implementations must calculate metadata from the returned content rather
   * than trusting stale provider metadata.
   */
  readonly content: Uint8Array;
}

export type StoragePutDisposition = 'created' | 'reused';

export interface StoredFile extends StorageObjectMetadata {
  readonly disposition: StoragePutDisposition;
}

export interface FileStorageWritePort {
  /**
   * objectKey is an idempotency identity. Implementations must reuse an
   * existing object only when its bytes match the supplied content and must
   * reject an objectKey collision with different content.
   */
  put(input: FileStoragePutInput): Promise<StoredFile>;
  stat(
    reference: StorageObjectReference,
  ): Promise<StorageObjectMetadata | null>;
  remove(reference: StorageObjectReference): Promise<void>;
}

export interface FileStorageReadPort {
  read(
    reference: StorageObjectReference,
    policy: BufferedDocumentBinaryPolicy,
  ): Promise<StorageObjectContent | null>;
}

export interface FileStoragePort
  extends FileStorageWritePort,
    FileStorageReadPort {}
