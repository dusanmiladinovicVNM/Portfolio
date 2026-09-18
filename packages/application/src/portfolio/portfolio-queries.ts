import type { Property, PropertyId, Space, Unit, UnitId } from '@portfolio/domain';
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

export function listPropertiesQuery(
  repository: PortfolioRepository,
  actor: Actor,
): Promise<readonly Property[]> {
  requireCapability(actor, 'portfolio:read');
  return repository.listProperties();
}

export function listUnitsByPropertyQuery(
  repository: PortfolioRepository,
  actor: Actor,
  propertyId: PropertyId,
): Promise<readonly Unit[]> {
  requireCapability(actor, 'portfolio:read');
  return repository.listUnitsByProperty(propertyId);
}

export function listSpacesByUnitQuery(
  repository: PortfolioRepository,
  actor: Actor,
  unitId: UnitId,
): Promise<readonly Space[]> {
  requireCapability(actor, 'portfolio:read');
  return repository.listSpacesByUnit(unitId);
}
