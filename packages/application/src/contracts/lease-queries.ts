import {
  asDateOnly,
  DomainError,
  type LeaseAgreement,
  type LeaseAgreementId,
  type LeaseAmendment,
  type TenancyId,
  type TenancyTermVersion,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { TenancyRepository } from '../tenancy/tenancy-repository.js';
import type { LeaseRepository } from './lease-repository.js';

export async function listLeaseAgreementsByTenancyQuery(
  deps: {
    leaseRepository: LeaseRepository;
    tenancyRepository: TenancyRepository;
  },
  actor: Actor,
  tenancyId: TenancyId,
): Promise<readonly LeaseAgreement[]> {
  requireCapability(actor, 'contracts:read');

  if (!(await deps.tenancyRepository.getById(tenancyId))) {
    throw new DomainError('TENANCY_NOT_FOUND', 'Tenancy not found.');
  }

  return deps.leaseRepository.listAgreementsByTenancy(tenancyId);
}

export async function getLeaseAgreementQuery(
  repository: LeaseRepository,
  actor: Actor,
  id: LeaseAgreementId,
): Promise<LeaseAgreement> {
  requireCapability(actor, 'contracts:read');

  const agreement = await repository.getAgreementById(id);
  if (!agreement) {
    throw new DomainError('LEASE_AGREEMENT_NOT_FOUND', 'Lease agreement not found.');
  }

  return agreement;
}

export async function listLeaseAmendmentsByAgreementQuery(
  repository: LeaseRepository,
  actor: Actor,
  agreementId: LeaseAgreementId,
): Promise<readonly LeaseAmendment[]> {
  requireCapability(actor, 'contracts:read');

  if (!(await repository.getAgreementById(agreementId))) {
    throw new DomainError('LEASE_AGREEMENT_NOT_FOUND', 'Lease agreement not found.');
  }

  return repository.listAmendmentsByAgreement(agreementId);
}

export async function getEffectiveTenancyTermsQuery(
  deps: {
    leaseRepository: LeaseRepository;
    tenancyRepository: TenancyRepository;
  },
  actor: Actor,
  tenancyId: TenancyId,
  effectiveAtValue: string,
): Promise<TenancyTermVersion> {
  requireCapability(actor, 'contracts:read');

  if (!(await deps.tenancyRepository.getById(tenancyId))) {
    throw new DomainError('TENANCY_NOT_FOUND', 'Tenancy not found.');
  }

  const effectiveAt = asDateOnly(effectiveAtValue);
  const terms = await deps.leaseRepository.getEffectiveTermsAt(
    tenancyId,
    effectiveAt,
  );

  if (!terms) {
    throw new DomainError(
      'TENANCY_TERMS_NOT_FOUND',
      'No effective tenancy terms exist for the requested date.',
    );
  }

  return terms;
}
