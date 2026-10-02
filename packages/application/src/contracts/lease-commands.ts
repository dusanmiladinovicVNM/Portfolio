import {
  DomainError,
  asLeaseAgreementId,
  asLeaseAgreementPartyId,
  asLeaseAmendmentId,
  asTenancyTermVersionId,
  cancelLeaseAgreement,
  cancelLeaseAmendment,
  createLeaseAgreement,
  createLeaseAmendment,
  createTenancyTermVersion,
  inspectLuzernerLeaseFormReadiness,
  replaceLeaseAgreementParties,
  signLeaseAgreement,
  signLeaseAmendment,
  supersedeLeaseAgreement,
  type LeaseAgreement,
  type LeaseAgreementId,
  type LeaseAgreementPartyRole,
  type LeaseAgreementType,
  type LuzernerLeaseFormDraft,
  type LeaseAmendment,
  type LeaseAmendmentId,
  type PartyId,
  type Tenancy,
  type TenancyId,
  type TenancyTermVersion,
  type TermSnapshotInput,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import { ApplicationError } from '../shared/application-error.js';
import type { LuzernerLeasePdfPort } from './luzerner-lease-pdf-port.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { PartyRepository } from '../parties/party-repository.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type { TenancyRepository } from '../tenancy/tenancy-repository.js';
import type { AgreementSupersession, LeaseRepository } from './lease-repository.js';
import {
  buildLuzernerLeasePdfSnapshot,
  renderFrozenLuzernerLeasePdf,
} from './luzerner-lease-pdf-commands.js';

export interface LeaseAgreementPartyCommandInput {
  partyId: PartyId;
  role: LeaseAgreementPartyRole;
}

export interface CreateLeaseAgreementCommandInput {
  tenancyId: TenancyId;
  code: string;
  agreementType: LeaseAgreementType;
  predecessorAgreementId?: LeaseAgreementId | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  parties: readonly LeaseAgreementPartyCommandInput[];
}

export interface ReplaceLeaseAgreementPartiesCommandInput {
  agreementId: LeaseAgreementId;
  expectedVersion: number;
  parties: readonly LeaseAgreementPartyCommandInput[];
}

export interface CreateLeaseAmendmentCommandInput {
  agreementId: LeaseAgreementId;
  code: string;
  title: string;
  description?: string | null;
  effectiveFrom: string;
}

export interface LeaseDependencies {
  leaseRepository: LeaseRepository;
  tenancyRepository: TenancyRepository;
  partyRepository: PartyRepository;
  idGenerator: IdGenerator;
}

export interface SignLeaseAgreementDependencies extends LeaseDependencies {
  portfolioRepository: PortfolioRepository;
  luzernerLeasePdfPort?: LuzernerLeasePdfPort;
}

function moneyCents(value: string | null): bigint {
  return BigInt((value ?? '0.00').replace('.', ''));
}

function assertLuzernerLeaseSignConsistency(
  form: LuzernerLeaseFormDraft,
  agreement: LeaseAgreement,
  terms: TenancyTermVersion,
): void {
  const readiness = inspectLuzernerLeaseFormReadiness(form.content);
  if (!readiness.ready) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_INCOMPLETE',
      `The Luzerner lease form is incomplete: ${readiness.missing.join(', ')}.`,
    );
  }

  const content = form.content;
  const mismatches: string[] = [];

  if (content.moveInDate !== agreement.effectiveFrom) {
    mismatches.push('moveInDate/effectiveFrom');
  }
  if (content.signingDate !== agreement.signedAt) {
    mismatches.push('signingDate/signedAt');
  }

  if (content.durationKind === 'fixed_term') {
    if (content.fixedEndDate !== agreement.effectiveTo) {
      mismatches.push('fixedEndDate/effectiveTo');
    }
  } else if (agreement.effectiveTo !== null) {
    mismatches.push('durationKind/effectiveTo');
  }

  if (content.currency !== terms.currency) {
    mismatches.push('currency');
  }
  if (content.netRent !== terms.baseRent) {
    mismatches.push('netRent/baseRent');
  }
  if ((content.garageParkingRent ?? '0.00') !== terms.parkingRent) {
    mismatches.push('garageParkingRent/parkingRent');
  }

  const expectedAncillaryCents =
    moneyCents(content.ancillaryAdvance) + moneyCents(content.ancillaryFlat);
  if (expectedAncillaryCents !== moneyCents(terms.serviceCharge)) {
    mismatches.push('ancillaryCosts/serviceCharge');
  }
  if (terms.utilitiesAdvance !== '0.00') {
    mismatches.push('utilitiesAdvance');
  }
  if (terms.otherRecurringCharge !== '0.00') {
    mismatches.push('otherRecurringCharge');
  }

  if ((content.securityAmount ?? '0.00') !== terms.depositRequired) {
    mismatches.push('securityAmount/depositRequired');
  }
  if (content.paymentFrequency !== terms.billingFrequency) {
    mismatches.push('paymentFrequency/billingFrequency');
  }

  if (mismatches.length > 0) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_SIGN_MISMATCH',
      `The Luzerner lease form conflicts with the Agreement sign snapshot: ${mismatches.join(', ')}.`,
    );
  }
}

async function requireTenancy(
  repository: TenancyRepository,
  id: TenancyId,
): Promise<Tenancy> {
  const tenancy = await repository.getById(id);
  if (!tenancy) throw new DomainError('TENANCY_NOT_FOUND', 'Tenancy not found.');
  return tenancy;
}

async function requireAgreement(
  repository: LeaseRepository,
  id: LeaseAgreementId,
): Promise<LeaseAgreement> {
  const agreement = await repository.getAgreementById(id);
  if (!agreement) {
    throw new DomainError('LEASE_AGREEMENT_NOT_FOUND', 'Lease agreement not found.');
  }
  return agreement;
}

async function requireAmendment(
  repository: LeaseRepository,
  id: LeaseAmendmentId,
): Promise<LeaseAmendment> {
  const amendment = await repository.getAmendmentById(id);
  if (!amendment) {
    throw new DomainError('LEASE_AMENDMENT_NOT_FOUND', 'Lease amendment not found.');
  }
  return amendment;
}

function assertExpectedVersion(
  aggregate: { readonly version: number },
  expectedVersion: number,
  code: string,
  message: string,
): void {
  if (aggregate.version !== expectedVersion) {
    throw new DomainError(code, message);
  }
}

async function validateAgreementParties(
  partyRepository: PartyRepository,
  tenancy: Tenancy,
  parties: readonly LeaseAgreementPartyCommandInput[],
): Promise<void> {
  if (!parties.some((party) => party.role === 'landlord')) {
    throw new DomainError(
      'LEASE_AGREEMENT_MISSING_REQUIRED_PARTIES',
      'Agreement requires at least one landlord.',
    );
  }

  if (!parties.some((party) => party.role === 'tenant' || party.role === 'co_tenant')) {
    throw new DomainError(
      'LEASE_AGREEMENT_MISSING_REQUIRED_PARTIES',
      'Agreement requires at least one tenant or co-tenant.',
    );
  }

  const uniqueIds = [...new Set(parties.map((party) => party.partyId))];
  const persistedParties = await partyRepository.getByIds(uniqueIds);

  if (persistedParties.length !== uniqueIds.length) {
    throw new DomainError(
      'PARTY_NOT_FOUND',
      'One or more agreement parties do not exist.',
    );
  }

  if (persistedParties.some((party) => party.status !== 'active')) {
    throw new DomainError(
      'LEASE_AGREEMENT_INACTIVE_PARTY',
      'Inactive or archived parties cannot be added to a new lease agreement.',
    );
  }

  for (const party of parties) {
    if (
      party.role !== 'tenant' &&
      party.role !== 'co_tenant' &&
      party.role !== 'guarantor'
    ) {
      continue;
    }

    const matchingTenancyRole = tenancy.parties.some(
      (tenancyParty) =>
        tenancyParty.partyId === party.partyId &&
        tenancyParty.role === party.role,
    );

    if (!matchingTenancyRole) {
      throw new DomainError(
        'LEASE_AGREEMENT_TENANCY_PARTY_MISMATCH',
        'Tenant, co-tenant and guarantor agreement roles must match TenancyParty roles.',
      );
    }
  }
}

async function validateAgreementChain(
  repository: LeaseRepository,
  agreement: LeaseAgreement,
): Promise<LeaseAgreement | null> {
  if (agreement.predecessorAgreementId === null) {
    const existingInitial = (await repository.listAgreementsByTenancy(
      agreement.tenancyId,
    )).some(
      (candidate) =>
        candidate.id !== agreement.id &&
        candidate.agreementType === 'initial' &&
        candidate.status !== 'cancelled',
    );

    if (existingInitial) {
      throw new DomainError(
        'LEASE_AGREEMENT_INITIAL_ALREADY_EXISTS',
        'This tenancy already has a non-cancelled initial agreement.',
      );
    }

    return null;
  }

  const predecessor = await requireAgreement(
    repository,
    agreement.predecessorAgreementId,
  );

  if (predecessor.tenancyId !== agreement.tenancyId) {
    throw new DomainError(
      'LEASE_AGREEMENT_PREDECESSOR_TENANCY_MISMATCH',
      'A successor agreement must belong to the same tenancy as its predecessor.',
    );
  }

  if (predecessor.status !== 'signed') {
    throw new DomainError(
      'LEASE_AGREEMENT_PREDECESSOR_NOT_SIGNED',
      'A successor agreement requires a currently signed predecessor.',
    );
  }

  if (predecessor.effectiveFrom >= agreement.effectiveFrom) {
    throw new DomainError(
      'LEASE_AGREEMENT_PREDECESSOR_PERIOD_INVALID',
      'A successor agreement must become effective after its predecessor starts.',
    );
  }

  if (await repository.successorExists(predecessor.id)) {
    throw new DomainError(
      'LEASE_AGREEMENT_SUCCESSOR_ALREADY_EXISTS',
      'The predecessor already has a non-cancelled successor agreement.',
    );
  }

  return predecessor;
}

export async function createLeaseAgreementCommand(
  deps: LeaseDependencies,
  actor: Actor,
  input: CreateLeaseAgreementCommandInput,
): Promise<LeaseAgreement> {
  requireCapability(actor, 'contracts:write');

  const tenancy = await requireTenancy(deps.tenancyRepository, input.tenancyId);
  if (tenancy.status === 'cancelled') {
    throw new DomainError(
      'LEASE_AGREEMENT_TENANCY_CANCELLED',
      'A lease agreement cannot be created for a cancelled tenancy.',
    );
  }

  await validateAgreementParties(deps.partyRepository, tenancy, input.parties);

  const agreement = createLeaseAgreement({
    id: asLeaseAgreementId(deps.idGenerator.next()),
    tenancyId: input.tenancyId,
    code: input.code,
    agreementType: input.agreementType,
    ...(input.predecessorAgreementId !== undefined
      ? { predecessorAgreementId: input.predecessorAgreementId }
      : {}),
    effectiveFrom: input.effectiveFrom,
    ...(input.effectiveTo !== undefined ? { effectiveTo: input.effectiveTo } : {}),
    parties: input.parties.map((party) => ({
      id: asLeaseAgreementPartyId(deps.idGenerator.next()),
      partyId: party.partyId,
      role: party.role,
    })),
  });

  await validateAgreementChain(deps.leaseRepository, agreement);

  if (await deps.leaseRepository.agreementCodeExists(agreement.code)) {
    throw new DomainError(
      'LEASE_AGREEMENT_CODE_ALREADY_EXISTS',
      `Lease agreement code '${agreement.code}' already exists.`,
    );
  }

  await deps.leaseRepository.insertAgreement(agreement);
  return agreement;
}

export async function replaceLeaseAgreementPartiesCommand(
  deps: LeaseDependencies,
  actor: Actor,
  input: ReplaceLeaseAgreementPartiesCommandInput,
): Promise<LeaseAgreement> {
  requireCapability(actor, 'contracts:write');

  const agreement = await requireAgreement(
    deps.leaseRepository,
    input.agreementId,
  );
  assertExpectedVersion(
    agreement,
    input.expectedVersion,
    'LEASE_AGREEMENT_VERSION_CONFLICT',
    'Lease agreement has changed since the caller last read it.',
  );

  const tenancy = await requireTenancy(
    deps.tenancyRepository,
    agreement.tenancyId,
  );
  await validateAgreementParties(
    deps.partyRepository,
    tenancy,
    input.parties,
  );

  const updated = replaceLeaseAgreementParties(
    agreement,
    input.parties.map((party) => ({
      id: asLeaseAgreementPartyId(deps.idGenerator.next()),
      partyId: party.partyId,
      role: party.role,
    })),
  );

  await deps.leaseRepository.replaceAgreementParties(
    updated,
    agreement.version,
  );
  return updated;
}

export async function signLeaseAgreementCommand(
  deps: SignLeaseAgreementDependencies,
  actor: Actor,
  agreementId: LeaseAgreementId,
  expectedVersion: number,
  signedAt: string,
  terms: TermSnapshotInput,
): Promise<LeaseAgreement> {
  requireCapability(actor, 'contracts:write');

  const agreement = await requireAgreement(deps.leaseRepository, agreementId);
  assertExpectedVersion(
    agreement,
    expectedVersion,
    'LEASE_AGREEMENT_VERSION_CONFLICT',
    'Lease agreement has changed since the caller last read it.',
  );

  const tenancy = await requireTenancy(deps.tenancyRepository, agreement.tenancyId);
  if (tenancy.status === 'cancelled' || tenancy.status === 'ended') {
    throw new DomainError(
      'LEASE_AGREEMENT_TENANCY_NOT_SIGNABLE',
      'A new lease agreement cannot be signed for a cancelled or ended tenancy.',
    );
  }

  await validateAgreementParties(
    deps.partyRepository,
    tenancy,
    agreement.parties.map((party) => ({
      partyId: party.partyId,
      role: party.role,
    })),
  );

  let predecessorToSupersede: AgreementSupersession | undefined;
  if (agreement.predecessorAgreementId !== null) {
    const predecessor = await requireAgreement(
      deps.leaseRepository,
      agreement.predecessorAgreementId,
    );

    if (
      predecessor.tenancyId !== agreement.tenancyId ||
      predecessor.status !== 'signed'
    ) {
      throw new DomainError(
        'LEASE_AGREEMENT_PREDECESSOR_NOT_SIGNABLE',
        'The predecessor must still be the signed agreement for the same tenancy.',
      );
    }

    predecessorToSupersede = {
      agreement: supersedeLeaseAgreement(predecessor),
      expectedVersion: predecessor.version,
    };
  }

  const signed = signLeaseAgreement(agreement, signedAt);
  const luzernerForm = await deps.leaseRepository.getLuzernerLeaseForm(
    agreement.id,
  );

  if (
    luzernerForm !== null &&
    (terms.noticePeriodTenantDays != null ||
      terms.noticePeriodLandlordDays != null)
  ) {
    throw new DomainError(
      'LUZERNER_LEASE_FORM_NOTICE_PERIOD_OWNERSHIP',
      'Luzerner Kündigungsfrist is contract-form-owned and must not be duplicated as an approximate day count.',
    );
  }

  const termVersion = createTenancyTermVersion({
    id: asTenancyTermVersionId(deps.idGenerator.next()),
    tenancyId: agreement.tenancyId,
    sourceType: 'agreement',
    sourceAgreementId: agreement.id,
    effectiveFrom: agreement.effectiveFrom,
    ...terms,
    ...(luzernerForm !== null
      ? {
          noticePeriodTenantDays: null,
          noticePeriodLandlordDays: null,
        }
      : {}),
  });

  let luzernerPdfSnapshot = null;
  if (luzernerForm !== null) {
    assertLuzernerLeaseSignConsistency(luzernerForm, signed, termVersion);
    if (!deps.luzernerLeasePdfPort) {
      throw new ApplicationError(
        'LUZERNER_PDF_RENDERER_UNAVAILABLE',
        'Luzerner PDF rendering is required before a Luzerner Agreement can be signed.',
      );
    }
    const templateIdentity =
      deps.luzernerLeasePdfPort.getCurrentTemplateIdentity();
    if (templateIdentity.templateCode !== luzernerForm.templateCode) {
      throw new ApplicationError(
        'LUZERNER_PDF_TEMPLATE_MISMATCH',
        'Current Luzerner PDF renderer does not match the contract template being signed.',
      );
    }
    luzernerPdfSnapshot = await buildLuzernerLeasePdfSnapshot(
      deps,
      signed,
      luzernerForm.revision,
      templateIdentity,
    );
    await renderFrozenLuzernerLeasePdf(
      deps.luzernerLeasePdfPort,
      luzernerPdfSnapshot,
      luzernerForm.content,
    );
  }

  await deps.leaseRepository.signAgreement(
    signed,
    agreement.version,
    termVersion,
    predecessorToSupersede,
    luzernerForm?.revision ?? null,
    luzernerPdfSnapshot,
  );

  return signed;
}

export async function cancelLeaseAgreementCommand(
  deps: Pick<LeaseDependencies, 'leaseRepository'>,
  actor: Actor,
  agreementId: LeaseAgreementId,
  expectedVersion: number,
): Promise<LeaseAgreement> {
  requireCapability(actor, 'contracts:write');
  const agreement = await requireAgreement(deps.leaseRepository, agreementId);

  assertExpectedVersion(
    agreement,
    expectedVersion,
    'LEASE_AGREEMENT_VERSION_CONFLICT',
    'Lease agreement has changed since the caller last read it.',
  );

  const cancelled = cancelLeaseAgreement(agreement);
  await deps.leaseRepository.cancelAgreement(cancelled, agreement.version);
  return cancelled;
}

export async function createLeaseAmendmentCommand(
  deps: Pick<LeaseDependencies, 'leaseRepository' | 'idGenerator'>,
  actor: Actor,
  input: CreateLeaseAmendmentCommandInput,
): Promise<LeaseAmendment> {
  requireCapability(actor, 'contracts:write');

  const agreement = await requireAgreement(
    deps.leaseRepository,
    input.agreementId,
  );

  if (agreement.status !== 'signed') {
    throw new DomainError(
      'LEASE_AMENDMENT_AGREEMENT_NOT_SIGNED',
      'Amendments may only be created for a signed agreement.',
    );
  }

  const amendment = createLeaseAmendment({
    id: asLeaseAmendmentId(deps.idGenerator.next()),
    agreementId: agreement.id,
    code: input.code,
    title: input.title,
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    effectiveFrom: input.effectiveFrom,
  });

  if (amendment.effectiveFrom < agreement.effectiveFrom) {
    throw new DomainError(
      'LEASE_AMENDMENT_EFFECTIVE_DATE_OUTSIDE_AGREEMENT',
      'Amendment cannot become effective before its agreement.',
    );
  }

  if (
    agreement.effectiveTo !== null &&
    amendment.effectiveFrom > agreement.effectiveTo
  ) {
    throw new DomainError(
      'LEASE_AMENDMENT_EFFECTIVE_DATE_OUTSIDE_AGREEMENT',
      'Amendment cannot become effective after its agreement ends.',
    );
  }

  if (await deps.leaseRepository.amendmentCodeExists(amendment.code)) {
    throw new DomainError(
      'LEASE_AMENDMENT_CODE_ALREADY_EXISTS',
      `Lease amendment code '${amendment.code}' already exists.`,
    );
  }

  await deps.leaseRepository.insertAmendment(amendment);
  return amendment;
}

export async function signLeaseAmendmentCommand(
  deps: Pick<LeaseDependencies, 'leaseRepository' | 'tenancyRepository' | 'idGenerator'>,
  actor: Actor,
  amendmentId: LeaseAmendmentId,
  expectedVersion: number,
  signedAt: string,
  terms: TermSnapshotInput,
): Promise<LeaseAmendment> {
  requireCapability(actor, 'contracts:write');

  const amendment = await requireAmendment(deps.leaseRepository, amendmentId);
  assertExpectedVersion(
    amendment,
    expectedVersion,
    'LEASE_AMENDMENT_VERSION_CONFLICT',
    'Lease amendment has changed since the caller last read it.',
  );

  const agreement = await requireAgreement(
    deps.leaseRepository,
    amendment.agreementId,
  );

  if (agreement.status !== 'signed') {
    throw new DomainError(
      'LEASE_AMENDMENT_AGREEMENT_NOT_SIGNED',
      'A lease amendment can only be signed while its agreement is signed.',
    );
  }

  await requireTenancy(deps.tenancyRepository, agreement.tenancyId);

  const signed = signLeaseAmendment(amendment, signedAt);
  const termVersion = createTenancyTermVersion({
    id: asTenancyTermVersionId(deps.idGenerator.next()),
    tenancyId: agreement.tenancyId,
    sourceType: 'amendment',
    sourceAmendmentId: amendment.id,
    effectiveFrom: amendment.effectiveFrom,
    ...terms,
  });

  await deps.leaseRepository.signAmendment(
    signed,
    amendment.version,
    termVersion,
  );

  return signed;
}

export async function cancelLeaseAmendmentCommand(
  deps: Pick<LeaseDependencies, 'leaseRepository'>,
  actor: Actor,
  amendmentId: LeaseAmendmentId,
  expectedVersion: number,
): Promise<LeaseAmendment> {
  requireCapability(actor, 'contracts:write');

  const amendment = await requireAmendment(deps.leaseRepository, amendmentId);
  assertExpectedVersion(
    amendment,
    expectedVersion,
    'LEASE_AMENDMENT_VERSION_CONFLICT',
    'Lease amendment has changed since the caller last read it.',
  );

  const cancelled = cancelLeaseAmendment(amendment);
  await deps.leaseRepository.cancelAmendment(cancelled, amendment.version);
  return cancelled;
}
