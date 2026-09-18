import {
  addStoredDocumentVersion,
  asDocumentId,
  asDocumentVersionId,
  createDocument,
  finalizeDocumentVersion,
  type DocumentVersion,
} from '@portfolio/domain';
import { ApplicationError } from '../shared/application-error.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { DocumentRepository } from './document-repository.js';
import type { FileStoragePort, StorageObjectReference } from './file-storage-port.js';

export interface StoreGeneratedFinalDocumentInput {
  readonly title: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
  readonly finalizedAt: string;
}

export async function storeGeneratedFinalDocument(
  deps: {
    readonly documentRepository: DocumentRepository;
    readonly fileStorage: FileStoragePort;
    readonly idGenerator: IdGenerator;
  },
  input: StoreGeneratedFinalDocumentInput,
): Promise<DocumentVersion> {
  const documentId = asDocumentId(deps.idGenerator.next());
  const versionId = asDocumentVersionId(deps.idGenerator.next());

  const document = createDocument({
    id: documentId,
    code: `GENERATED-${documentId}`,
    title: input.title,
    category: 'inspection',
  });

  const objectKey = `document-version:${versionId}`;
  const stored = await deps.fileStorage.put({
    objectKey,
    fileName: input.fileName,
    mimeType: input.mimeType,
    content: input.content,
  });

  const withVersion = addStoredDocumentVersion(document, {
    id: versionId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteSize: stored.byteSize,
    sha256: stored.sha256,
  });
  const finalVersion = finalizeDocumentVersion(
    withVersion.version,
    input.finalizedAt,
  );

  const storage: StorageObjectReference = {
    provider: stored.provider,
    objectId: stored.objectId,
    objectKey: stored.objectKey,
  };

  try {
    await deps.documentRepository.insertGeneratedFinal(
      withVersion.document,
      finalVersion,
      storage,
    );
  } catch (persistenceError) {
    try {
      await deps.fileStorage.remove(storage);
    } catch {
      throw new ApplicationError(
        'DOCUMENT_STORAGE_COMPENSATION_FAILED',
        'Generated document metadata could not be persisted and the uploaded object could not be removed.',
      );
    }
    throw persistenceError;
  }

  return finalVersion;
}
