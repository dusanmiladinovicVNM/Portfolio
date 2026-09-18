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

export interface StoredFile extends StorageObjectReference {
  readonly byteSize: number;
  readonly sha256: string;
}

export interface FileStoragePort {
  put(input: FileStoragePutInput): Promise<StoredFile>;
  remove(reference: StorageObjectReference): Promise<void>;
}
