import {
  DomainError,
  type Tenancy,
  type TenancyId,
  type UnitId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type { TenancyRepository } from './tenancy-repository.js';

export async function getTenancyQuery(
  repository: TenancyRepository,
  actor: Actor,
  id: TenancyId,
): Promise<Tenancy> {
  requireCapability(actor, 'tenancy:read');
  const tenancy = await repository.getById(id);
  if (!tenancy) throw new DomainError('TENANCY_NOT_FOUND', 'Tenancy not found.');
  return tenancy;
}

export async function listTenanciesByUnitQuery(
  deps: {
    tenancyRepository: TenancyRepository;
    portfolioRepository: PortfolioRepository;
  },
  actor: Actor,
  unitId: UnitId,
): Promise<readonly Tenancy[]> {
  requireCapability(actor, 'tenancy:read');

  if (!(await deps.portfolioRepository.getUnitById(unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  return deps.tenancyRepository.listByUnit(unitId);
}
