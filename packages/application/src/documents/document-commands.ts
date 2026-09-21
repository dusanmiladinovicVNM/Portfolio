import {
  DomainError,
  addStoredDocumentVersion,
  asDocumentId,
  asDocumentLinkId,
  asDocumentVersionId,
  createDocument,
  createDocumentLink,
  finalizeDocumentVersion,
  type Document,
  type DocumentCategory,
  type DocumentId,
  type DocumentLink,
  type DocumentLinkRelation,
  type DocumentVersion,
  type DocumentVersionId,
  type LeaseAgreementId,
  type LeaseAmendmentId,
  type PartyId,
  type PropertyId,
  type TenancyId,
  type UnitId,
} from '@portfolio/domain';
import { ApplicationError } from '../shared/application-error.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import { requireCapability, type Actor } from '../security/access.js';
import type { LeaseRepository } from '../contracts/lease-repository.js';
import type { PartyRepository } from '../parties/party-repository.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type { TenancyRepository } from '../tenancy/tenancy-repository.js';
import type { DocumentRepository } from './document-repository.js';
import type {
  FileStorageWritePort,
  StorageObjectMetadata,
  StorageObjectReference,
} from './file-storage-port.js';
import {
  assertStorageObjectMatchesVersion,
  storageMatchesVersion,
  storageReferenceMatches,
} from './document-storage-integrity.js';

export interface CreateDocumentCommandInput {
  readonly code: string;
  readonly title: string;
  readonly category: DocumentCategory;
}

export interface UploadDocumentVersionCommandInput {
  readonly documentId: DocumentId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
  readonly expectedDocumentRevision?: number;
}

interface LinkDocumentCommandBase {
  readonly documentId: DocumentId;
  readonly documentVersionId?: DocumentVersionId | null;
  readonly relation: DocumentLinkRelation;
}

export type LinkDocumentCommandInput =
  | (LinkDocumentCommandBase & {
      readonly targetType: 'property';
      readonly targetId: PropertyId;
    })
  | (LinkDocumentCommandBase & {
      readonly targetType: 'unit';
      readonly targetId: UnitId;
    })
  | (LinkDocumentCommandBase & {
      readonly targetType: 'party';
      readonly targetId: PartyId;
    })
  | (LinkDocumentCommandBase & {
      readonly targetType: 'tenancy';
      readonly targetId: TenancyId;
    })
  | (LinkDocumentCommandBase & {
      readonly targetType: 'lease_agreement';
      readonly targetId: LeaseAgreementId;
    })
  | (LinkDocumentCommandBase & {
      readonly targetType: 'lease_amendment';
      readonly targetId: LeaseAmendmentId;
    });

interface DocumentDependencies {
  readonly documentRepository: DocumentRepository;
  readonly idGenerator: IdGenerator;
}

export interface UploadDocumentVersionDependencies extends DocumentDependencies {
  readonly fileStorage: FileStorageWritePort;
}

export interface FinalizeDocumentVersionDependencies {
  readonly documentRepository: DocumentRepository;
  readonly fileStorage: Pick<FileStorageWritePort, 'stat'>;
  readonly clock: ClockPort;
}

export interface LinkDocumentDependencies extends DocumentDependencies {
  readonly portfolioRepository: PortfolioRepository;
  readonly partyRepository: PartyRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly leaseRepository: LeaseRepository;
}

async function requireDocument(
  repository: DocumentRepository,
  id: DocumentId,
): Promise<Document> {
  const document = await repository.getDocumentById(id);
  if (!document) {
    throw new DomainError('DOCUMENT_NOT_FOUND', 'Document not found.');
  }
  return document;
}

async function requireVersion(
  repository: DocumentRepository,
  id: DocumentVersionId,
): Promise<DocumentVersion> {
  const version = await repository.getVersionById(id);
  if (!version) {
    throw new DomainError(
      'DOCUMENT_VERSION_NOT_FOUND',
      'Document version not found.',
    );
  }
  return version;
}

export async function createDocumentCommand(
  deps: DocumentDependencies,
  actor: Actor,
  input: CreateDocumentCommandInput,
): Promise<Document> {
  requireCapability(actor, 'documents:write');

  const document = createDocument({
    id: asDocumentId(deps.idGenerator.next()),
    code: input.code,
    title: input.title,
    category: input.category,
  });

  if (await deps.documentRepository.documentCodeExists(document.code)) {
    throw new DomainError(
      'DOCUMENT_CODE_ALREADY_EXISTS',
      `Document code '${document.code}' already exists.`,
    );
  }

  await deps.documentRepository.insertDocument(document);
  return document;
}

export async function assertDocumentVersionStorageIntegrity(
  deps: Pick<UploadDocumentVersionDependencies, 'documentRepository' | 'fileStorage'>,
  version: DocumentVersion,
): Promise<StorageObjectMetadata> {
  const reference = await deps.documentRepository.getStorageReference(version.id);
  if (!reference) {
    throw new DomainError(
      'DOCUMENT_STORAGE_REFERENCE_MISSING',
      'Document version has no registered storage reference.',
    );
  }

  let metadata: StorageObjectMetadata | null;
  try {
    metadata = await deps.fileStorage.stat(reference);
  } catch {
    throw new ApplicationError(
      'DOCUMENT_STORAGE_VERIFICATION_FAILED',
      'Document binary could not be verified against its storage provider.',
    );
  }

  if (!metadata) {
    throw new DomainError(
      'DOCUMENT_BINARY_MISSING',
      'Document binary is missing from storage.',
    );
  }
  assertStorageObjectMatchesVersion(metadata, reference, version);
  return metadata;
}

export async function uploadDocumentVersionCommand(
  deps: UploadDocumentVersionDependencies,
  actor: Actor,
  input: UploadDocumentVersionCommandInput,
): Promise<DocumentVersion> {
  requireCapability(actor, 'documents:write');

  const document = await requireDocument(
    deps.documentRepository,
    input.documentId,
  );

  if (document.status !== 'active') {
    throw new DomainError(
      'DOCUMENT_NOT_ACTIVE',
      'A new version may only be added to an active document.',
    );
  }

  if (
    input.expectedDocumentRevision !== undefined &&
    document.revision !== input.expectedDocumentRevision
  ) {
    throw new DomainError(
      'DOCUMENT_VERSION_CONFLICT',
      'Document changed before the new version upload started.',
    );
  }

  if (!input.fileName.trim() || !input.mimeType.trim() || input.content.byteLength === 0) {
    throw new DomainError(
      'DOCUMENT_INVALID_UPLOAD',
      'fileName, mimeType and non-empty content are required.',
    );
  }

  const versionId = asDocumentVersionId(deps.idGenerator.next());
  const objectKey = `document-version:${versionId}`;

  const stored = await deps.fileStorage.put({
    objectKey,
    fileName: input.fileName.trim(),
    mimeType: input.mimeType.trim().toLowerCase(),
    content: input.content,
  });

  const added = addStoredDocumentVersion(document, {
    id: versionId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteSize: stored.byteSize,
    sha256: stored.sha256,
  });

  const storage: StorageObjectReference = {
    provider: stored.provider,
    objectId: stored.objectId,
    objectKey: stored.objectKey,
  };

  try {
    await deps.documentRepository.insertVersion(
      added.document,
      document.revision,
      added.version,
      storage,
    );
  } catch (persistenceError) {
    // The database may have committed even if the commit acknowledgement was
    // lost. Re-read the exact deterministic version id before deleting bytes.
    try {
      const persisted = await deps.documentRepository.getVersionById(versionId);
      if (persisted) {
        const persistedStorage =
          await deps.documentRepository.getStorageReference(versionId);
        if (
          persistedStorage &&
          storageReferenceMatches(persistedStorage, storage) &&
          persisted.documentId === added.version.documentId &&
          persisted.versionNumber === added.version.versionNumber &&
          persisted.fileName === added.version.fileName &&
          persisted.mimeType === added.version.mimeType &&
          storageMatchesVersion(stored, persisted)
        ) {
          return persisted;
        }

        throw new ApplicationError(
          'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED',
          'Document registration returned an error but persisted state does not match the uploaded binary.',
        );
      }
    } catch (reconciliationError) {
      if (
        reconciliationError instanceof ApplicationError &&
        reconciliationError.code === 'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED'
      ) {
        throw reconciliationError;
      }
      throw new ApplicationError(
        'DOCUMENT_STORAGE_RECONCILIATION_REQUIRED',
        'Document registration outcome could not be verified. The storage object was preserved for reconciliation.',
      );
    }

    // Only a newly-created object is eligible for compensation. A reused
    // object may belong to a prior retry/reconciliation attempt and is kept.
    if (stored.disposition === 'created') {
      try {
        await deps.fileStorage.remove(storage);
      } catch {
        throw new ApplicationError(
          'DOCUMENT_STORAGE_COMPENSATION_FAILED',
          'Document metadata was confirmed absent but the newly created storage object could not be removed. Manual storage reconciliation is required.',
        );
      }
    }
    throw persistenceError;
  }

  return added.version;
}

export async function finalizeDocumentVersionCommand(
  deps: FinalizeDocumentVersionDependencies,
  actor: Actor,
  versionId: DocumentVersionId,
): Promise<DocumentVersion> {
  requireCapability(actor, 'documents:write');

  const current = await requireVersion(deps.documentRepository, versionId);
  await assertDocumentVersionStorageIntegrity(deps, current);
  const finalized = finalizeDocumentVersion(current, deps.clock.now());
  await deps.documentRepository.finalizeVersion(finalized);
  return finalized;
}

async function assertTargetExists(
  deps: LinkDocumentDependencies,
  input: LinkDocumentCommandInput,
): Promise<void> {
  switch (input.targetType) {
    case 'property':
      if (!await deps.portfolioRepository.getPropertyById(input.targetId)) {
        throw new DomainError('PROPERTY_NOT_FOUND', 'Property not found.');
      }
      return;
    case 'unit':
      if (!await deps.portfolioRepository.getUnitById(input.targetId)) {
        throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
      }
      return;
    case 'party':
      if (!await deps.partyRepository.getById(input.targetId)) {
        throw new DomainError('PARTY_NOT_FOUND', 'Party not found.');
      }
      return;
    case 'tenancy':
      if (!await deps.tenancyRepository.getById(input.targetId)) {
        throw new DomainError('TENANCY_NOT_FOUND', 'Tenancy not found.');
      }
      return;
    case 'lease_agreement': {
      const agreement = await deps.leaseRepository.getAgreementById(
        input.targetId,
      );
      if (!agreement) {
        throw new DomainError(
          'LEASE_AGREEMENT_NOT_FOUND',
          'Lease agreement not found.',
        );
      }
      if (
        input.relation === 'signed_original' &&
        !['signed', 'superseded', 'terminated'].includes(agreement.status)
      ) {
        throw new DomainError(
          'DOCUMENT_SIGNED_ORIGINAL_TARGET_NOT_FINAL',
          'A signed original may only be linked to a signed legal record.',
        );
      }
      return;
    }
    case 'lease_amendment': {
      const amendment = await deps.leaseRepository.getAmendmentById(
        input.targetId,
      );
      if (!amendment) {
        throw new DomainError(
          'LEASE_AMENDMENT_NOT_FOUND',
          'Lease amendment not found.',
        );
      }
      if (
        input.relation === 'signed_original' &&
        amendment.status !== 'signed'
      ) {
        throw new DomainError(
          'DOCUMENT_SIGNED_ORIGINAL_TARGET_NOT_FINAL',
          'A signed original may only be linked to a signed legal record.',
        );
      }
    }
  }
}

export async function linkDocumentCommand(
  deps: LinkDocumentDependencies,
  actor: Actor,
  input: LinkDocumentCommandInput,
): Promise<DocumentLink> {
  requireCapability(actor, 'documents:write');

  const document = await requireDocument(
    deps.documentRepository,
    input.documentId,
  );

  let version: DocumentVersion | null = null;
  if (input.documentVersionId !== undefined && input.documentVersionId !== null) {
    version = await requireVersion(
      deps.documentRepository,
      input.documentVersionId,
    );
    if (version.documentId !== document.id) {
      throw new DomainError(
        'DOCUMENT_VERSION_DOCUMENT_MISMATCH',
        'Document version does not belong to the linked document.',
      );
    }
  }

  if (input.relation === 'signed_original' && version?.status !== 'final') {
    throw new DomainError(
      'DOCUMENT_SIGNED_ORIGINAL_VERSION_NOT_FINAL',
      'signed_original requires a finalized immutable document version.',
    );
  }

  await assertTargetExists(deps, input);

  const common = {
    id: asDocumentLinkId(deps.idGenerator.next()),
    documentId: document.id,
    documentVersionId: version?.id ?? null,
    relation: input.relation,
  };

  const link = createDocumentLink({
    ...common,
    targetType: input.targetType,
    targetId: input.targetId,
  } as DocumentLink);

  await deps.documentRepository.insertLink(link);
  return link;
}
