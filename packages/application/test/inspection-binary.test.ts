import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY,
  uploadInspectionBinaryCommand,
  type Actor,
  type DocumentRepository,
  type FileStorageWritePort,
  type IdGenerator,
  type InspectionRepository,
  type Sha256Port,
} from '../src/index.js';
import {
  asInspectionId,
  asInspectionSchemaVersionId,
  asUnitId,
  asUserId,
  createInspection,
  startInspection,
} from '@portfolio/domain';

const inspectorId = asUserId(
  '72000000-0000-4000-8000-000000000004',
);
const inspection = startInspection(
  createInspection({
    id: asInspectionId('72000000-0000-4000-8000-000000000001'),
    code: 'INS-BINARY-LIMIT',
    inspectionType: 'move_in',
    unitId: asUnitId('72000000-0000-4000-8000-000000000002'),
    tenancyId: null,
    schemaVersionId: asInspectionSchemaVersionId(
      '72000000-0000-4000-8000-000000000003',
    ),
    assignedToUserId: inspectorId,
    createdByUserId: inspectorId,
  }),
  '2026-09-22T20:00:00.000Z',
);

const actor: Actor = {
  userId: inspectorId,
  role: 'inspector',
};

describe('Inspection binary application boundary', () => {
  it('rejects an oversized binary before hashing or touching downstream storage', async () => {
    let hashCalls = 0;
    const sha256: Sha256Port = {
      async digest() {
        hashCalls += 1;
        throw new Error('hash must not run');
      },
    };

    const inspectionRepository = {
      async getById() {
        return inspection;
      },
    } as unknown as InspectionRepository;

    const neverDocumentRepository =
      {} as unknown as DocumentRepository;
    const neverStorage = {} as unknown as FileStorageWritePort;
    const neverIds: IdGenerator = {
      next() {
        throw new Error('id generation must not run');
      },
    };

    await expect(
      uploadInspectionBinaryCommand(
        {
          inspectionRepository,
          documentRepository: neverDocumentRepository,
          fileStorage: neverStorage,
          idGenerator: neverIds,
          clock: { now: () => '2026-09-22T20:00:00.000Z' },
          sha256,
        },
        actor,
        inspection.id,
        {
          purpose: 'photo',
          uploadKey: '72000000-0000-4000-8000-000000000099',
          fileName: 'oversized.jpg',
          mimeType: 'image/jpeg',
          content: new Uint8Array(
            DEFAULT_BUFFERED_DOCUMENT_BINARY_POLICY.maxBytes + 1,
          ),
        },
      ),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_BINARY_UPLOAD_LIMIT_EXCEEDED',
    });

    expect(hashCalls).toBe(0);
  });
});
