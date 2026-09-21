import {
  DomainError,
  type Property,
  type PropertyId,
  type Space,
  type Unit,
  type UnitId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { PortfolioRepository } from './portfolio-repository.js';

export function getPropertyQuery(
  repository: PortfolioRepository,
  actor: Actor,
  id: PropertyId,
): Promise<Property | null> {
  requireCapability(actor, 'portfolio:read');
  return repository.getPropertyById(id);
}

export function getUnitQuery(
  repository: PortfolioRepository,
  actor: Actor,
  id: UnitId,
): Promise<Unit | null> {
  requireCapability(actor, 'portfolio:read');
  return repository.getUnitById(id);
}

export function listPropertiesQuery(
  repository: PortfolioRepository,
  actor: Actor,
): Promise<readonly Property[]> {
  requireCapability(actor, 'portfolio:read');
  return repository.listProperties();
}

export async function listUnitsByPropertyQuery(
  repository: PortfolioRepository,
  actor: Actor,
  propertyId: PropertyId,
): Promise<readonly Unit[]> {
  requireCapability(actor, 'portfolio:read');

  if (!(await repository.getPropertyById(propertyId))) {
    throw new DomainError('PROPERTY_NOT_FOUND', 'Property not found.');
  }

  return repository.listUnitsByProperty(propertyId);
}

export async function listSpacesByUnitQuery(
  repository: PortfolioRepository,
  actor: Actor,
  unitId: UnitId,
): Promise<readonly Space[]> {
  requireCapability(actor, 'portfolio:read');

  if (!(await repository.getUnitById(unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  return repository.listSpacesByUnit(unitId);
}
