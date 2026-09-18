import type {
  Property,
  PropertyId,
  Space,
  SpaceId,
  Unit,
  UnitId,
} from '@portfolio/domain';

export interface PortfolioRepository {
  getPropertyById(id: PropertyId): Promise<Property | null>;
  getUnitById(id: UnitId): Promise<Unit | null>;
  getSpaceById(id: SpaceId): Promise<Space | null>;

  listProperties(): Promise<readonly Property[]>;
  listUnitsByProperty(propertyId: PropertyId): Promise<readonly Unit[]>;
  listSpacesByUnit(unitId: UnitId): Promise<readonly Space[]>;

  propertyCodeExists(code: string): Promise<boolean>;
  unitCodeExists(code: string): Promise<boolean>;
  unitNumberExists(propertyId: PropertyId, unitNumber: string): Promise<boolean>;
  spaceCodeExists(unitId: UnitId, code: string): Promise<boolean>;

  insertProperty(property: Property): Promise<void>;
  insertUnit(unit: Unit): Promise<void>;
  insertSpace(space: Space): Promise<void>;
}
