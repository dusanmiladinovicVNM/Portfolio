import {
  DomainError,
  asDocumentLinkId,
  createDocumentLink,
  type DocumentVersion,
  type LeaseAgreementId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import {
  assertDocumentVersionStorageIntegrity,
  createDocumentCommand,
  finalizeDocumentVersionCommand,
  uploadDocumentVersionCommand,
} from '../documents/document-commands.js';
import type {
  DocumentRepository,
  TargetDocumentReference,
} from '../documents/document-repository.js';
import type { FileStorageWritePort } from '../documents/file-storage-port.js';
import type { PartyRepository } from '../parties/party-repository.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type { TenancyRepository } from '../tenancy/tenancy-repository.js';
import type { LeaseRepository } from './lease-repository.js';
import type { LuzernerLeasePdfPort } from './luzerner-lease-pdf-port.js';
import { renderLuzernerLeasePdfCommand } from './luzerner-lease-pdf-commands.js';

export interface GenerateLuzernerLeaseFinalDocumentDependencies {
  readonly leaseRepository: LeaseRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly partyRepository: PartyRepository;
  readonly documentRepository: DocumentRepository;
  readonly fileStorage: FileStorageWritePort;
  readonly luzernerLeasePdfPort: LuzernerLeasePdfPort;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

function signedOriginal(
  references: readonly TargetDocumentReference[],
): TargetDocumentReference | null {
  const matches = references.filter(
    (reference) => reference.link.relation === 'signed_original',
  );
  if (matches.length > 1) {
    throw new DomainError(
      'LUZERNER_FINAL_DOCUMENT_LINK_CONFLICT',
      'Agreement has more than one signed-original Document link.',
    );
  }
  return matches[0] ?? null;
}

async function resolveExistingSignedOriginal(
  deps: Pick<
    GenerateLuzernerLeaseFinalDocumentDependencies,
    'documentRepository' | 'fileStorage'
  >,
  agreementId: LeaseAgreementId,
): Promise<DocumentVersion | null> {
  const reference = signedOriginal(
    await deps.documentRepository.listTargetDocuments({
      targetType: 'lease_agreement',
      targetId: agreementId,
    }),
  );
  if (!reference) return null;

  const version = reference.linkedVersion;
  if (
    version === null ||
    version.status !== 'final' ||
    version.mimeType !== 'application/pdf'
  ) {
    throw new DomainError(
      'LUZERNER_FINAL_DOCUMENT_INVALID',
      'Signed-original link must reference one final PDF DocumentVersion.',
    );
  }

  await assertDocumentVersionStorageIntegrity(deps, version);
  return version;
}

export async function generateLuzernerLeaseFinalDocumentCommand(
  deps: GenerateLuzernerLeaseFinalDocumentDependencies,
  actor: Actor,
  agreementId: LeaseAgreementId,
): Promise<DocumentVersion> {
  requireCapability(actor, 'documents:write');
  requireCapability(actor, 'contracts:read');

  const agreement = await deps.leaseRepository.getAgreementById(agreementId);
  if (!agreement) {
    throw new DomainError(
      'LEASE_AGREEMENT_NOT_FOUND',
      'Lease agreement not found.',
    );
  }
  if (!['signed', 'superseded', 'terminated'].includes(agreement.status)) {
    throw new DomainError(
      'LUZERNER_FINAL_DOCUMENT_STATE_INVALID',
      'Final Luzerner PDF requires a signed legal Agreement.',
    );
  }

  const existing = await resolveExistingSignedOriginal(deps, agreement.id);
  if (existing) return existing;

  const documentCode = `LUZERNER-FINAL-${agreement.code}`;
  const findDocument = async () =>
    (await deps.documentRepository.listDocuments()).find(
      (document) =>
        document.code.toLowerCase() === documentCode.toLowerCase(),
    ) ?? null;

  let document = await findDocument();
  if (!document) {
    try {
      document = await createDocumentCommand(
        {
          documentRepository: deps.documentRepository,
          idGenerator: deps.idGenerator,
        },
        actor,
        {
          code: documentCode,
          title: `${agreement.code} Luzerner Mietvertrag`,
          category: 'legal',
        },
      );
    } catch (error) {
      if (
        !(error instanceof DomainError) ||
        error.code !== 'DOCUMENT_CODE_ALREADY_EXISTS'
      ) {
        throw error;
      }
      document = await findDocument();
      if (!document) {
        throw new DomainError(
          'LUZERNER_FINAL_DOCUMENT_RECONCILIATION_REQUIRED',
          'Final contract Document reservation exists but cannot be resolved.',
        );
      }
    }
  }

  if (document.category !== 'legal' || document.status !== 'active') {
    throw new DomainError(
      'LUZERNER_FINAL_DOCUMENT_INVALID',
      'Canonical final contract Document has an invalid category or status.',
    );
  }

  const resolveCanonicalVersion = async (): Promise<DocumentVersion | null> => {
    const versions = await deps.documentRepository.listVersionsByDocument(
      document!.id,
    );
    if (versions.length > 1) {
      throw new DomainError(
        'LUZERNER_FINAL_DOCUMENT_VERSION_CONFLICT',
        'Canonical final contract Document contains more than one version.',
      );
    }
    return versions[0] ?? null;
  };

  const ensureFinal = async (
    candidate: DocumentVersion,
  ): Promise<DocumentVersion> => {
    if (candidate.status === 'final') {
      await assertDocumentVersionStorageIntegrity(deps, candidate);
      return candidate;
    }

    try {
      return await finalizeDocumentVersionCommand(
        {
          documentRepository: deps.documentRepository,
          fileStorage: deps.fileStorage,
          clock: deps.clock,
        },
        actor,
        candidate.id,
      );
    } catch (error) {
      if (
        !(error instanceof DomainError) ||
        ![
          'DOCUMENT_VERSION_CONFLICT',
          'DOCUMENT_VERSION_INVALID_TRANSITION',
        ].includes(error.code)
      ) {
        throw error;
      }

      const winner = await deps.documentRepository.getVersionById(candidate.id);
      if (!winner || winner.status !== 'final') throw error;
      await assertDocumentVersionStorageIntegrity(deps, winner);
      return winner;
    }
  };

  let canonicalVersion = await resolveCanonicalVersion();
  if (!canonicalVersion) {
    const expectedDocumentRevision = document.revision;
    const rendered = await renderLuzernerLeasePdfCommand(
      deps,
      actor,
      agreement.id,
    );
    if (rendered.content.byteLength === 0) {
      throw new DomainError(
        'LUZERNER_FINAL_DOCUMENT_EMPTY',
        'Luzerner PDF renderer returned empty content.',
      );
    }

    try {
      canonicalVersion = await uploadDocumentVersionCommand(
        {
          documentRepository: deps.documentRepository,
          fileStorage: deps.fileStorage,
          idGenerator: deps.idGenerator,
        },
        actor,
        {
          documentId: document.id,
          fileName: rendered.fileName,
          mimeType: 'application/pdf',
          content: rendered.content,
          expectedDocumentRevision,
        },
      );
    } catch (error) {
      if (
        !(error instanceof DomainError) ||
        error.code !== 'DOCUMENT_VERSION_CONFLICT'
      ) {
        throw error;
      }
      canonicalVersion = await resolveCanonicalVersion();
      if (!canonicalVersion) throw error;
    }
  }

  const finalVersion = await ensureFinal(canonicalVersion);

  const link = createDocumentLink({
    id: asDocumentLinkId(deps.idGenerator.next()),
    documentId: document.id,
    documentVersionId: finalVersion.id,
    relation: 'signed_original',
    targetType: 'lease_agreement',
    targetId: agreement.id,
  });

  try {
    await deps.documentRepository.insertLink(link);
    return finalVersion;
  } catch (error) {
    if (
      !(error instanceof DomainError) ||
      ![
        'DOCUMENT_SIGNED_ORIGINAL_ALREADY_EXISTS',
        'DOCUMENT_LINK_ALREADY_EXISTS',
      ].includes(error.code)
    ) {
      throw error;
    }

    const winner = await resolveExistingSignedOriginal(deps, agreement.id);
    if (!winner) {
      throw new DomainError(
        'LUZERNER_FINAL_DOCUMENT_RECONCILIATION_REQUIRED',
        'Signed-original uniqueness was claimed but the canonical link cannot be resolved.',
      );
    }
    if (winner.id !== finalVersion.id) {
      throw new DomainError(
        'LUZERNER_FINAL_DOCUMENT_VERSION_CONFLICT',
        'Concurrent final contract generation resolved to different DocumentVersions.',
      );
    }
    return winner;
  }
}
