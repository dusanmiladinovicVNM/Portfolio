import {
  DomainError,
  createLuzernerLeaseFormProfile,
  updateLuzernerLeaseFormProfile,
  type DocumentVersionId,
  type LeaseAgreementId,
  type LuzernerLeaseFormDataInput,
  type LuzernerLeaseFormProfile,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { DocumentRepository } from '../documents/document-repository.js';
import type { LeaseRepository } from './lease-repository.js';

export async function getLuzernerLeaseFormProfileQuery(
  deps: {
    readonly leaseRepository: LeaseRepository;
  },
  actor: Actor,
  agreementId: LeaseAgreementId,
): Promise<LuzernerLeaseFormProfile | null> {
  requireCapability(actor, 'contracts:read');

  const agreement = await deps.leaseRepository.getAgreementById(agreementId);
  if (!agreement) {
    throw new DomainError(
      'LEASE_AGREEMENT_NOT_FOUND',
      'Lease agreement not found.',
    );
  }

  return deps.leaseRepository.getLuzernerLeaseFormProfile(agreementId);
}

async function assertTemplateVersion(
  documentRepository: DocumentRepository,
  versionId: DocumentVersionId | null,
): Promise<void> {
  if (versionId === null) return;

  const version = await documentRepository.getVersionById(versionId);
  if (!version) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_TEMPLATE_VERSION_NOT_FOUND',
      'Template document version not found.',
    );
  }
  if (version.status !== 'final') {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_TEMPLATE_VERSION_NOT_FINAL',
      'Luzerner template must reference a final immutable DocumentVersion.',
    );
  }

  const document = await documentRepository.getDocumentById(version.documentId);
  if (!document) {
    throw new DomainError(
      'DOCUMENT_NOT_FOUND',
      'Template parent document not found.',
    );
  }
  if (document.category !== 'legal' || document.status !== 'active') {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_TEMPLATE_INVALID',
      'Luzerner template must be an active legal Document.',
    );
  }
  if (version.mimeType !== 'application/pdf') {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_TEMPLATE_NOT_PDF',
      'Luzerner template must be a PDF DocumentVersion.',
    );
  }
}

export async function upsertLuzernerLeaseFormProfileCommand(
  deps: {
    readonly leaseRepository: LeaseRepository;
    readonly documentRepository: DocumentRepository;
  },
  actor: Actor,
  agreementId: LeaseAgreementId,
  input: {
    readonly expectedRevision: number;
    readonly templateDocumentVersionId?: DocumentVersionId | null;
    readonly data: LuzernerLeaseFormDataInput;
  },
): Promise<LuzernerLeaseFormProfile> {
  requireCapability(actor, 'contracts:write');

  const agreement = await deps.leaseRepository.getAgreementById(agreementId);
  if (!agreement) {
    throw new DomainError(
      'LEASE_AGREEMENT_NOT_FOUND',
      'Lease agreement not found.',
    );
  }
  if (agreement.status !== 'draft') {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_AGREEMENT_NOT_DRAFT',
      'Luzerner lease form data may only be edited while the Agreement is draft.',
    );
  }

  const current =
    await deps.leaseRepository.getLuzernerLeaseFormProfile(agreementId);

  if (input.expectedRevision === 0) {
    if (current !== null) {
      throw new DomainError(
        'LUZERNER_LEASE_FORM_REVISION_CONFLICT',
        'Luzerner lease form already exists; reread before saving.',
      );
    }
  } else if (
    current === null ||
    current.revision !== input.expectedRevision
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_REVISION_CONFLICT',
      'Luzerner lease form changed since it was last read.',
    );
  }

  const templateDocumentVersionId =
    input.templateDocumentVersionId === undefined
      ? current?.templateDocumentVersionId ?? null
      : input.templateDocumentVersionId;
  await assertTemplateVersion(
    deps.documentRepository,
    templateDocumentVersionId,
  );

  const profile =
    current === null
      ? createLuzernerLeaseFormProfile({
          agreementId,
          templateDocumentVersionId,
          data: input.data,
        })
      : updateLuzernerLeaseFormProfile(current, {
          templateDocumentVersionId,
          data: input.data,
        });

  await deps.leaseRepository.saveLuzernerLeaseFormProfile(
    profile,
    input.expectedRevision,
  );
  return profile;
}
