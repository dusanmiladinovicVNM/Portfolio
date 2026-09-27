import {
  DomainError,
  asDocumentLinkId,
  createDocumentLink,
  type Document,
  type DocumentVersion,
  type LeaseAgreementId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { Sha256Port } from '../shared/sha256-port.js';
import { assertDocumentVersionStorageIntegrity } from '../documents/document-commands.js';
import {
  createDocumentRecord,
  finalizeDocumentVersionRecord,
  uploadDocumentVersionRecord,
} from '../documents/document-write-service.js';
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
  readonly sha256: Sha256Port;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

function generatedContract(
  references: readonly TargetDocumentReference[],
): TargetDocumentReference | null {
  const matches = references.filter(
    (reference) => reference.link.relation === 'generated_contract',
  );
  if (matches.length > 1) {
    throw new DomainError(
      'LUZERNER_GENERATED_CONTRACT_LINK_CONFLICT',
      'Agreement has more than one generated-contract Document link.',
    );
  }
  return matches[0] ?? null;
}

function assertExpectedCanonicalVersion(
  version: DocumentVersion,
  expectedSha256: string,
): void {
  if (version.mimeType !== 'application/pdf') {
    throw new DomainError(
      'LUZERNER_FINAL_DOCUMENT_INVALID',
      'Canonical final contract must be an application/pdf DocumentVersion.',
    );
  }
  if (version.sha256 !== expectedSha256) {
    throw new DomainError(
      'LUZERNER_FINAL_DOCUMENT_HASH_MISMATCH',
      'Existing final-contract bytes do not match the deterministic canonical render.',
    );
  }
}

async function resolveExistingGeneratedContract(
  deps: Pick<
    GenerateLuzernerLeaseFinalDocumentDependencies,
    'documentRepository' | 'fileStorage'
  >,
  agreementId: LeaseAgreementId,
  expectedSha256: string,
): Promise<DocumentVersion | null> {
  const reference = generatedContract(
    await deps.documentRepository.listTargetDocuments({
      targetType: 'lease_agreement',
      targetId: agreementId,
    }),
  );
  if (!reference) return null;

  const version = reference.linkedVersion;
  if (version === null || version.status !== 'final') {
    throw new DomainError(
      'LUZERNER_FINAL_DOCUMENT_INVALID',
      'Generated-contract link must reference one final PDF DocumentVersion.',
    );
  }

  assertExpectedCanonicalVersion(version, expectedSha256);
  await assertDocumentVersionStorageIntegrity(deps, version);
  return version;
}

async function createGeneratedContractDocument(
  deps: Pick<
    GenerateLuzernerLeaseFinalDocumentDependencies,
    'documentRepository' | 'idGenerator'
  >,
  agreementCode: string,
): Promise<Document> {
  return createDocumentRecord(deps, {
    code: `LUZERNER-FINAL-${agreementCode}`,
    title: `${agreementCode} Luzerner Mietvertrag`,
    category: 'legal',
  });
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
  const expectedSha256 = (
    await deps.sha256.digest(rendered.content)
  ).toLowerCase();

  const existing = await resolveExistingGeneratedContract(
    deps,
    agreement.id,
    expectedSha256,
  );
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
      document = await createGeneratedContractDocument(deps, agreement.code);
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

  if (
    document.code.toLowerCase() !== documentCode.toLowerCase() ||
    document.category !== 'legal' ||
    document.status !== 'active'
  ) {
    throw new DomainError(
      'LUZERNER_FINAL_DOCUMENT_INVALID',
      'Canonical final contract Document has an invalid identity, category or status.',
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
    const version = versions[0] ?? null;
    if (version) {
      assertExpectedCanonicalVersion(version, expectedSha256);
    }
    return version;
  };

  const ensureFinal = async (
    candidate: DocumentVersion,
  ): Promise<DocumentVersion> => {
    assertExpectedCanonicalVersion(candidate, expectedSha256);

    if (candidate.status === 'final') {
      await assertDocumentVersionStorageIntegrity(deps, candidate);
      return candidate;
    }

    try {
      const finalized = await finalizeDocumentVersionRecord(
        {
          documentRepository: deps.documentRepository,
          fileStorage: deps.fileStorage,
          clock: deps.clock,
        },
        candidate.id,
      );
      assertExpectedCanonicalVersion(finalized, expectedSha256);
      return finalized;
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
      assertExpectedCanonicalVersion(winner, expectedSha256);
      await assertDocumentVersionStorageIntegrity(deps, winner);
      return winner;
    }
  };

  let canonicalVersion = await resolveCanonicalVersion();
  if (!canonicalVersion) {
    const expectedDocumentRevision = document.revision;
    try {
      canonicalVersion = await uploadDocumentVersionRecord(
        {
          documentRepository: deps.documentRepository,
          fileStorage: deps.fileStorage,
          idGenerator: deps.idGenerator,
        },
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
    relation: 'generated_contract',
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
        'DOCUMENT_GENERATED_CONTRACT_ALREADY_EXISTS',
        'DOCUMENT_LINK_ALREADY_EXISTS',
      ].includes(error.code)
    ) {
      throw error;
    }

    const winner = await resolveExistingGeneratedContract(
      deps,
      agreement.id,
      expectedSha256,
    );
    if (!winner) {
      throw new DomainError(
        'LUZERNER_FINAL_DOCUMENT_RECONCILIATION_REQUIRED',
        'Generated-contract uniqueness was claimed but the canonical link cannot be resolved.',
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
