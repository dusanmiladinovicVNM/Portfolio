import {
  DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY,
  recoverDocumentVersionBinary,
  type DocumentRepository,
  type DocumentStorageLocationRepository,
  type FileStoragePort,
  type Sha256Port,
} from '@portfolio/application';
import type {
  DocumentId,
  DocumentVersionId,
} from '@portfolio/domain';

export interface BinaryRecoverySnapshotItem {
  readonly versionId: DocumentVersionId;
  readonly documentId: DocumentId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly provider: string;
  readonly objectId: string;
  readonly objectKey: string;
}

export interface RestoreDocumentBinarySnapshotDependencies {
  readonly documentRepository: Pick<DocumentRepository, 'getVersionById'> &
    DocumentStorageLocationRepository;
  readonly recoveryStorage: FileStoragePort;
  readonly sha256: Sha256Port;
  readonly readContent: (
    item: BinaryRecoverySnapshotItem,
  ) => Promise<Uint8Array>;
}

export interface RestoreDocumentBinarySnapshotResult {
  readonly restored: number;
  readonly totalBytes: number;
}

function sameReference(
  left: {
    readonly provider: string;
    readonly objectId: string;
    readonly objectKey: string;
  },
  right: {
    readonly provider: string;
    readonly objectId: string;
    readonly objectKey: string;
  },
): boolean {
  return (
    left.provider === right.provider &&
    left.objectId === right.objectId &&
    left.objectKey === right.objectKey
  );
}

export async function restoreDocumentBinarySnapshot(
  deps: RestoreDocumentBinarySnapshotDependencies,
  items: readonly BinaryRecoverySnapshotItem[],
  reason = 'restore immutable DocumentVersion from verified binary backup',
): Promise<RestoreDocumentBinarySnapshotResult> {
  let totalBytes = 0;

  for (const item of items) {
    const version = await deps.documentRepository.getVersionById(item.versionId);
    if (!version) {
      throw new Error(
        `Binary recovery manifest references missing DocumentVersion ${item.versionId}.`,
      );
    }

    if (
      version.documentId !== item.documentId ||
      version.fileName !== item.fileName ||
      version.mimeType !== item.mimeType ||
      version.byteSize !== item.byteSize ||
      version.sha256.toLowerCase() !== item.sha256.toLowerCase()
    ) {
      throw new Error(
        `Binary recovery manifest does not match canonical DocumentVersion ${item.versionId}.`,
      );
    }

    const current = await deps.documentRepository.getStorageReference(
      version.id,
    );
    if (!current) {
      throw new Error(
        `DocumentVersion ${item.versionId} has no canonical storage reference.`,
      );
    }

    if (current.objectKey !== item.objectKey) {
      throw new Error(
        `Binary recovery objectKey does not match canonical DocumentVersion ${item.versionId}.`,
      );
    }

    const content = await deps.readContent(item);
    const replacement = await recoverDocumentVersionBinary(
      {
        documentRepository: deps.documentRepository,
        recoveryStorage: deps.recoveryStorage,
        sha256: deps.sha256,
      },
      {
        versionId: version.id,
        expectedCurrent: current,
        content,
        reason,
      },
    );

    const persisted = await deps.documentRepository.getStorageReference(
      version.id,
    );
    if (!persisted || !sameReference(persisted, replacement)) {
      throw new Error(
        `Recovered locator was not persisted for DocumentVersion ${item.versionId}.`,
      );
    }

    const reread = await deps.recoveryStorage.read(
      persisted,
      DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY,
    );
    if (!reread) {
      throw new Error(
        `Recovered binary cannot be read back for DocumentVersion ${item.versionId}.`,
      );
    }

    const rereadSha = (await deps.sha256.digest(reread.content)).toLowerCase();
    if (
      reread.byteSize !== version.byteSize ||
      reread.sha256.toLowerCase() !== version.sha256.toLowerCase() ||
      reread.content.byteLength !== version.byteSize ||
      rereadSha !== version.sha256.toLowerCase()
    ) {
      throw new Error(
        `Recovered binary read-back does not match DocumentVersion ${item.versionId}.`,
      );
    }

    totalBytes += version.byteSize;
  }

  return {
    restored: items.length,
    totalBytes,
  };
}
