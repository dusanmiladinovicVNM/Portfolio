import {
  DomainError,
  createLuzernLeaseProfile,
  type LeaseAgreementId,
  type LuzernLeaseProfile,
  type LuzernLeaseProfileDraftInput,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { LeaseRepository } from './lease-repository.js';
import type { LuzernLeaseProfileRepository } from './luzern-lease-profile-repository.js';

export async function saveLuzernLeaseProfileCommand(
  deps: {
    readonly leaseRepository: LeaseRepository;
    readonly profileRepository: LuzernLeaseProfileRepository;
  },
  actor: Actor,
  agreementId: LeaseAgreementId,
  expectedRevision: number | null,
  input: LuzernLeaseProfileDraftInput,
): Promise<LuzernLeaseProfile> {
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
      'LUZERN_LEASE_PROFILE_IMMUTABLE',
      'Luzerner Mietvertrag preparation may only be edited while the Agreement is draft.',
    );
  }

  const current = await deps.profileRepository.getByAgreementId(agreementId);
  if (
    (current === null && expectedRevision !== null) ||
    (current !== null && expectedRevision !== current.revision)
  ) {
    throw new DomainError(
      'LUZERN_LEASE_PROFILE_VERSION_CONFLICT',
      'Luzerner Mietvertrag preparation changed before this save.',
    );
  }

  const profile = createLuzernLeaseProfile(
    agreementId,
    input,
    current === null ? 1 : current.revision + 1,
  );
  await deps.profileRepository.save(profile, expectedRevision);
  return profile;
}
