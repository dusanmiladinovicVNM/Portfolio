import type { Property, PropertyId, Unit, UnitId, Space, SpaceId } from '@portfolio/domain';

export interface PortfolioRepository {
  getPropertyById(id: PropertyId): Promise<Property | null>;
  getUnitById(id: UnitId): Promise<Unit | null>;
  getSpaceById(id: SpaceId): Promise<Space | null>;

  propertyCodeExists(code: string): Promise<boolean>;
  unitCodeExists(code: string): Promise<boolean>;

  insertProperty(property: Property): Promise<void>;
  insertUnit(unit: Unit): Promise<void>;
  insertSpace(space: Space): Promise<void>;
}
