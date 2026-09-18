import type { Property, PropertyId, Space, Unit, UnitId } from '@portfolio/domain';
import type { PortfolioRepository } from './portfolio-repository.js';

export const getPropertyQuery = (
  repository: PortfolioRepository,
  id: PropertyId,
): Promise<Property | null> => repository.getPropertyById(id);

export const listPropertiesQuery = (
  repository: PortfolioRepository,
): Promise<readonly Property[]> => repository.listProperties();

export const listUnitsByPropertyQuery = (
  repository: PortfolioRepository,
  propertyId: PropertyId,
): Promise<readonly Unit[]> => repository.listUnitsByProperty(propertyId);

export const listSpacesByUnitQuery = (
  repository: PortfolioRepository,
  unitId: UnitId,
): Promise<readonly Space[]> => repository.listSpacesByUnit(unitId);
