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

export type StoragePutDisposition = 'created' | 'reused';

export interface StoredFile extends StorageObjectMetadata {
  readonly disposition: StoragePutDisposition;
}

export interface FileStoragePort {
  put(input: FileStoragePutInput): Promise<StoredFile>;
  stat(reference: StorageObjectReference): Promise<StorageObjectMetadata | null>;
  remove(reference: StorageObjectReference): Promise<void>;
}
