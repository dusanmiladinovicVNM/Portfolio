import {
  DomainError,
  type OwnershipPeriod,
  type UnitId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type { OwnershipRepository } from './ownership-repository.js';

export async function listOwnershipPeriodsByUnitQuery(
  deps: {
    portfolioRepository: PortfolioRepository;
    ownershipRepository: OwnershipRepository;
  },
  actor: Actor,
  unitId: UnitId,
): Promise<readonly OwnershipPeriod[]> {
  requireCapability(actor, 'ownership:read');

  if (!(await deps.portfolioRepository.getUnitById(unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  return deps.ownershipRepository.listByUnit(unitId);
}
