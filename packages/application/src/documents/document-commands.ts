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
  createDocumentRecord,
  finalizeDocumentVersionRecord,
  uploadDocumentVersionRecord,
} from './document-write-service.js';
export { assertDocumentVersionStorageIntegrity } from './document-write-service.js';

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
  return createDocumentRecord(deps, input);
}

export async function uploadDocumentVersionCommand(
  deps: UploadDocumentVersionDependencies,
  actor: Actor,
  input: UploadDocumentVersionCommandInput,
): Promise<DocumentVersion> {
  requireCapability(actor, 'documents:write');
  return uploadDocumentVersionRecord(deps, input);
}

export async function finalizeDocumentVersionCommand(
  deps: FinalizeDocumentVersionDependencies,
  actor: Actor,
  versionId: DocumentVersionId,
): Promise<DocumentVersion> {
  requireCapability(actor, 'documents:write');
  return finalizeDocumentVersionRecord(deps, versionId);
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
