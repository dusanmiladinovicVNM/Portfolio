import {
  DomainError,
  asDocumentVersionId,
  assertInspectionContentEditable,
  type Document,
  type DocumentCategory,
  type DocumentVersion,
  type Inspection,
  type InspectionId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { DocumentRepository } from '../documents/document-repository.js';
import type { FileStorageWritePort } from '../documents/file-storage-port.js';
import {
  assertDocumentVersionStorageIntegrity,
  createDocumentRecord,
  finalizeDocumentVersionRecord,
  uploadDocumentVersionRecord,
} from '../documents/document-write-service.js';
import type { InspectionRepository } from './inspection-repository.js';

export const INSPECTION_BINARY_PURPOSES = [
  'photo',
  'attachment',
  'signature',
] as const;

export type InspectionBinaryPurpose =
  (typeof INSPECTION_BINARY_PURPOSES)[number];

export interface UploadInspectionBinaryInput {
  readonly purpose: InspectionBinaryPurpose;
  readonly uploadKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
}

export interface UploadInspectionBinaryDependencies {
  readonly inspectionRepository: InspectionRepository;
  readonly documentRepository: DocumentRepository;
  readonly fileStorage: FileStorageWritePort;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

function assertInspectionAccess(actor: Actor, inspection: Inspection): void {
  if (
    actor.role === 'inspector' &&
    inspection.assignedToUserId !== actor.userId
  ) {
    throw new DomainError(
      'INSPECTION_ACCESS_DENIED',
      'Inspector may only access inspections assigned to them.',
    );
  }
}

function categoryForPurpose(
  purpose: InspectionBinaryPurpose,
): DocumentCategory {
  switch (purpose) {
    case 'photo':
      return 'photo';
    case 'attachment':
      return 'inspection';
    case 'signature':
      return 'signature';
  }
}

function documentCode(
  inspectionId: InspectionId,
  purpose: InspectionBinaryPurpose,
  uploadKey: string,
): string {
  return `INSPECTION-${inspectionId}-${purpose}-${uploadKey}`;
}

function assertExistingDocument(
  document: Document,
  expectedCode: string,
  expectedCategory: DocumentCategory,
): void {
  if (
    document.code.toLowerCase() !== expectedCode.toLowerCase() ||
    document.category !== expectedCategory ||
    document.status !== 'active'
  ) {
    throw new DomainError(
      'INSPECTION_BINARY_DOCUMENT_CONFLICT',
      'Inspection binary upload key resolves to an incompatible Document.',
    );
  }
}

async function resolveDocument(
  deps: UploadInspectionBinaryDependencies,
  inspection: Inspection,
  input: UploadInspectionBinaryInput,
): Promise<Document> {
  const code = documentCode(inspection.id, input.purpose, input.uploadKey);
  const category = categoryForPurpose(input.purpose);
  const find = async () =>
    (await deps.documentRepository.listDocuments()).find(
      (document) => document.code.toLowerCase() === code.toLowerCase(),
    ) ?? null;

  let document = await find();
  if (!document) {
    try {
      document = await createDocumentRecord(
        {
          documentRepository: deps.documentRepository,
          idGenerator: deps.idGenerator,
        },
        {
          code,
          title: `${inspection.code} ${input.purpose}: ${input.fileName.trim()}`,
          category,
        },
      );
    } catch (error) {
      if (
        !(error instanceof DomainError) ||
        error.code !== 'DOCUMENT_CODE_ALREADY_EXISTS'
      ) {
        throw error;
      }
      document = await find();
      if (!document) {
        throw new DomainError(
          'INSPECTION_BINARY_RECONCILIATION_REQUIRED',
          'Inspection binary Document reservation exists but cannot be resolved.',
        );
      }
    }
  }

  assertExistingDocument(document, code, category);
  return document;
}

function assertExistingVersion(
  version: DocumentVersion,
  document: Document,
  input: UploadInspectionBinaryInput,
): void {
  const expectedId = asDocumentVersionId(input.uploadKey);
  const normalizedMimeType = input.mimeType.trim().toLowerCase();
  if (
    version.id !== expectedId ||
    version.documentId !== document.id ||
    version.versionNumber !== 1 ||
    version.fileName !== input.fileName.trim() ||
    version.mimeType !== normalizedMimeType ||
    version.byteSize !== input.content.byteLength
  ) {
    throw new DomainError(
      'INSPECTION_BINARY_VERSION_CONFLICT',
      'Inspection upload key already represents a different binary registration.',
    );
  }
}

export async function uploadInspectionBinaryCommand(
  deps: UploadInspectionBinaryDependencies,
  actor: Actor,
  inspectionId: InspectionId,
  input: UploadInspectionBinaryInput,
): Promise<DocumentVersion> {
  requireCapability(actor, 'inspections:write');

  const inspection = await deps.inspectionRepository.getById(inspectionId);
  if (!inspection) {
    throw new DomainError('INSPECTION_NOT_FOUND', 'Inspection not found.');
  }
  assertInspectionAccess(actor, inspection);

  if (input.purpose === 'signature') {
    if (inspection.status !== 'locked') {
      throw new DomainError(
        'INSPECTION_SIGNATURE_STATE_INVALID',
        'Signature binaries may only be uploaded while the inspection is locked.',
      );
    }
  } else {
    assertInspectionContentEditable(inspection);
  }

  if (
    !input.uploadKey.trim() ||
    !input.fileName.trim() ||
    !input.mimeType.trim() ||
    input.content.byteLength === 0
  ) {
    throw new DomainError(
      'INSPECTION_BINARY_INVALID_UPLOAD',
      'uploadKey, fileName, mimeType and non-empty content are required.',
    );
  }

  const expectedVersionId = asDocumentVersionId(input.uploadKey);
  const document = await resolveDocument(deps, inspection, input);
  let versions = await deps.documentRepository.listVersionsByDocument(document.id);

  if (versions.length > 1) {
    throw new DomainError(
      'INSPECTION_BINARY_VERSION_CONFLICT',
      'Inspection-scoped binary Document contains more than one version.',
    );
  }

  let version = versions[0] ?? null;
  if (!version) {
    try {
      version = await uploadDocumentVersionRecord(
        {
          documentRepository: deps.documentRepository,
          fileStorage: deps.fileStorage,
          idGenerator: deps.idGenerator,
        },
        {
          documentId: document.id,
          fileName: input.fileName,
          mimeType: input.mimeType,
          content: input.content,
          expectedDocumentRevision: document.revision,
          versionId: expectedVersionId,
        },
      );
    } catch (error) {
      if (
        !(error instanceof DomainError) ||
        error.code !== 'DOCUMENT_VERSION_CONFLICT'
      ) {
        throw error;
      }
      versions = await deps.documentRepository.listVersionsByDocument(document.id);
      if (versions.length !== 1) throw error;
      version = versions[0]!;
    }
  }

  assertExistingVersion(version, document, input);
  await assertDocumentVersionStorageIntegrity(deps, version);

  if (input.purpose === 'signature' && version.status !== 'final') {
    try {
      version = await finalizeDocumentVersionRecord(deps, version.id);
    } catch (error) {
      const winner = await deps.documentRepository.getVersionById(version.id);
      if (!winner || winner.status !== 'final') throw error;
      assertExistingVersion(winner, document, input);
      await assertDocumentVersionStorageIntegrity(deps, winner);
      version = winner;
    }
  }

  return version;
}
