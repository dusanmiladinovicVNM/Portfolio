import { describe, expect, it } from 'vitest';
import {
  relocateDocumentVersionStorage,
  type DocumentStorageLocationRepository,
  type StorageObjectReference,
} from '../src/index.js';
import {
  asDocumentId,
  asDocumentVersionId,
  type DocumentVersion,
} from '@portfolio/domain';

const version: DocumentVersion = {
  id: asDocumentVersionId('63000000-0000-4000-8000-000000000001'),
  documentId: asDocumentId('63000000-0000-4000-8000-000000000002'),
  versionNumber: 1,
  fileName: 'evidence.pdf',
  mimeType: 'application/pdf',
  byteSize: 4,
  sha256: 'a'.repeat(64),
  status: 'final',
  finalizedAt: '2026-09-24T12:00:00.000Z',
};

const current: StorageObjectReference = {
  provider: 'google-drive',
  objectId: 'old-drive-id',
  objectKey: `document-version:${version.id}`,
};

const replacement: StorageObjectReference = {
  provider: 'google-drive',
  objectId: 'recovered-drive-id',
  objectKey: current.objectKey,
};

function repositorySpy() {
  const relocations: unknown[] = [];
  const repository: DocumentStorageLocationRepository & {
    getVersionById(id: typeof version.id): Promise<DocumentVersion | null>;
  } = {
    async getVersionById(id) {
      return id === version.id ? version : null;
    },
    async getStorageReference() {
      return current;
    },
    async relocateStorageReference(...args) {
      relocations.push(args);
    },
  };
  return { repository, relocations };
}

describe('document storage disaster recovery', () => {
  it('activates only a replacement whose exact bytes match the immutable version', async () => {
    const { repository, relocations } = repositorySpy();

    await expect(
      relocateDocumentVersionStorage(
        {
          documentRepository: repository,
          replacementStorage: {
            async stat(reference) {
              return {
                ...reference,
                byteSize: version.byteSize,
                sha256: version.sha256,
              };
            },
          },
        },
        {
          versionId: version.id,
          expectedCurrent: current,
          replacement,
          reason: 'restore from verified secondary backup',
        },
      ),
    ).resolves.toEqual(replacement);

    expect(relocations).toEqual([
      [
        version.id,
        current,
        replacement,
        'restore from verified secondary backup',
      ],
    ]);
  });

  it('refuses a recovered object with different bytes', async () => {
    const { repository, relocations } = repositorySpy();

    await expect(
      relocateDocumentVersionStorage(
        {
          documentRepository: repository,
          replacementStorage: {
            async stat(reference) {
              return {
                ...reference,
                byteSize: version.byteSize,
                sha256: 'b'.repeat(64),
              };
            },
          },
        },
        {
          versionId: version.id,
          expectedCurrent: current,
          replacement,
          reason: 'restore',
        },
      ),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_BINARY_INTEGRITY_MISMATCH',
    });

    expect(relocations).toEqual([]);
  });

  it('refuses changing the stable Portfolio object key', async () => {
    const { repository, relocations } = repositorySpy();

    await expect(
      relocateDocumentVersionStorage(
        {
          documentRepository: repository,
          replacementStorage: {
            async stat() {
              throw new Error('must not inspect provider after key mismatch');
            },
          },
        },
        {
          versionId: version.id,
          expectedCurrent: current,
          replacement: {
            ...replacement,
            objectKey: 'different-key',
          },
          reason: 'restore',
        },
      ),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_STORAGE_RELOCATION_OBJECT_KEY_CHANGED',
    });

    expect(relocations).toEqual([]);
  });
});
