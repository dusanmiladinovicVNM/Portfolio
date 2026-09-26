import {
  DomainError,
  type LeaseAgreementId,
  type LuzernLeaseProfile,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { LeaseRepository } from './lease-repository.js';
import type { LuzernLeaseProfileRepository } from './luzern-lease-profile-repository.js';

export async function getLuzernLeaseProfileQuery(
  deps: {
    readonly leaseRepository: LeaseRepository;
    readonly profileRepository: LuzernLeaseProfileRepository;
  },
  actor: Actor,
  agreementId: LeaseAgreementId,
): Promise<LuzernLeaseProfile | null> {
  requireCapability(actor, 'contracts:read');
  if (!(await deps.leaseRepository.getAgreementById(agreementId))) {
    throw new DomainError(
      'LEASE_AGREEMENT_NOT_FOUND',
      'Lease agreement not found.',
    );
  }
  return deps.profileRepository.getByAgreementId(agreementId);
}
