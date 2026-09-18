import {
  DomainError,
  asOwnershipPeriodId,
  createOwnershipPeriod,
  type OwnershipPeriod,
  type PartyId,
  type UnitId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { PartyRepository } from '../parties/party-repository.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type { OwnershipRepository } from './ownership-repository.js';

export interface OwnershipShareCommandInput {
  partyId: PartyId;
  shareBasisPoints: number;
}

export interface CreateOwnershipPeriodCommandInput {
  unitId: UnitId;
  validFrom: string;
  validTo?: string | null;
  owners: readonly OwnershipShareCommandInput[];
}

export interface CreateOwnershipPeriodDependencies {
  portfolioRepository: PortfolioRepository;
  partyRepository: PartyRepository;
  ownershipRepository: OwnershipRepository;
  idGenerator: IdGenerator;
}

export async function createOwnershipPeriodCommand(
  deps: CreateOwnershipPeriodDependencies,
  actor: Actor,
  input: CreateOwnershipPeriodCommandInput,
): Promise<OwnershipPeriod> {
  requireCapability(actor, 'ownership:write');

  if (!(await deps.portfolioRepository.getUnitById(input.unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  const period = createOwnershipPeriod({
    id: asOwnershipPeriodId(deps.idGenerator.next()),
    unitId: input.unitId,
    validFrom: input.validFrom,
    ...(input.validTo !== undefined ? { validTo: input.validTo } : {}),
    owners: input.owners,
  });

  const uniquePartyIds = [...new Set(period.owners.map((owner) => owner.partyId))];
  const parties = await deps.partyRepository.getByIds(uniquePartyIds);

  if (parties.length !== uniquePartyIds.length) {
    throw new DomainError('PARTY_NOT_FOUND', 'One or more owners do not exist.');
  }

  if (parties.some((party) => party.status !== 'active')) {
    throw new DomainError(
      'OWNERSHIP_INACTIVE_PARTY',
      'Ownership cannot be assigned to an inactive or archived party.',
    );
  }

  if (
    await deps.ownershipRepository.overlaps(
      period.unitId,
      period.validFrom,
      period.validTo,
    )
  ) {
    throw new DomainError(
      'OWNERSHIP_PERIOD_OVERLAP',
      'Ownership periods for the same unit cannot overlap.',
    );
  }

  await deps.ownershipRepository.insert(period);
  return period;
}
