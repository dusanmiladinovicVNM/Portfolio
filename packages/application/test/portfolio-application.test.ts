import { describe, expect, it } from 'vitest';
import {
  createPropertyCommand,
  createSpaceCommand,
  createUnitCommand,
  listPropertiesQuery,
  listSpacesByUnitQuery,
  listUnitsByPropertyQuery,
  type IdGenerator,
  type PortfolioRepository,
} from '../src/index.js';
import type {
  Property,
  PropertyId,
  Space,
  SpaceId,
  Unit,
  UnitId,
} from '@portfolio/domain';

class SequenceIds implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  next(): string {
    const value = this.values[this.index];
    if (!value) throw new Error('No deterministic ID configured.');
    this.index += 1;
    return value;
  }
}

class InMemoryPortfolioRepository implements PortfolioRepository {
  private readonly properties = new Map<PropertyId, Property>();
  private readonly units = new Map<UnitId, Unit>();
  private readonly spaces = new Map<SpaceId, Space>();

  async getPropertyById(id: PropertyId): Promise<Property | null> {
    return this.properties.get(id) ?? null;
  }

  async getUnitById(id: UnitId): Promise<Unit | null> {
    return this.units.get(id) ?? null;
  }

  async getSpaceById(id: SpaceId): Promise<Space | null> {
    return this.spaces.get(id) ?? null;
  }

  async listProperties(): Promise<readonly Property[]> {
    return [...this.properties.values()];
  }

  async listUnitsByProperty(propertyId: PropertyId): Promise<readonly Unit[]> {
    return [...this.units.values()].filter((unit) => unit.propertyId === propertyId);
  }

  async listSpacesByUnit(unitId: UnitId): Promise<readonly Space[]> {
    return [...this.spaces.values()].filter((space) => space.unitId === unitId);
  }

  async propertyCodeExists(code: string): Promise<boolean> {
    return [...this.properties.values()].some(
      (property) => property.code.toLowerCase() === code.toLowerCase(),
    );
  }

  async unitCodeExists(code: string): Promise<boolean> {
    return [...this.units.values()].some(
      (unit) => unit.code.toLowerCase() === code.toLowerCase(),
    );
  }

  async unitNumberExists(propertyId: PropertyId, unitNumber: string): Promise<boolean> {
    return [...this.units.values()].some(
      (unit) =>
        unit.propertyId === propertyId &&
        unit.unitNumber.toLowerCase() === unitNumber.toLowerCase(),
    );
  }

  async spaceCodeExists(unitId: UnitId, code: string): Promise<boolean> {
    return [...this.spaces.values()].some(
      (space) => space.unitId === unitId && space.code.toLowerCase() === code.toLowerCase(),
    );
  }

  async insertProperty(property: Property): Promise<void> {
    this.properties.set(property.id, property);
  }

  async insertUnit(unit: Unit): Promise<void> {
    this.units.set(unit.id, unit);
  }

  async insertSpace(space: Space): Promise<void> {
    this.spaces.set(space.id, space);
  }
}

describe('Portfolio application vertical slice', () => {
  it('creates and queries Property → Unit → Space through application ports', async () => {
    const repository = new InMemoryPortfolioRepository();
    const ids = new SequenceIds([
      '6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f',
      'f05296da-8e3c-45e5-8357-957745830c86',
      'f5d0ee31-0f36-41cf-8660-6de2ed95bd2b',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository: repository, idGenerator: ids },
      {
        code: 'PROP-0001',
        name: 'Main Building',
        propertyType: 'apartment_building',
        street: 'Example Street',
        houseNumber: '10',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );

    const unit = await createUnitCommand(
      { portfolioRepository: repository, idGenerator: ids },
      {
        propertyId: property.id,
        code: 'UNIT-0001',
        unitNumber: '4B',
        unitType: 'apartment',
        areaM2: 72.5,
        rooms: 3,
      },
    );

    await createSpaceCommand(
      { portfolioRepository: repository, idGenerator: ids },
      {
        unitId: unit.id,
        code: 'KITCHEN',
        name: 'Kitchen',
        spaceType: 'kitchen',
      },
    );

    expect(await listPropertiesQuery(repository)).toHaveLength(1);
    expect(await listUnitsByPropertyQuery(repository, property.id)).toHaveLength(1);
    expect(await listSpacesByUnitQuery(repository, unit.id)).toHaveLength(1);
  });

  it('refuses a unit for a missing property before persistence', async () => {
    const repository = new InMemoryPortfolioRepository();
    const ids = new SequenceIds(['f05296da-8e3c-45e5-8357-957745830c86']);

    await expect(
      createUnitCommand(
        { portfolioRepository: repository, idGenerator: ids },
        {
          propertyId: '6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f' as PropertyId,
          code: 'UNIT-0001',
          unitNumber: '4B',
          unitType: 'apartment',
        },
      ),
    ).rejects.toMatchObject({ code: 'PROPERTY_NOT_FOUND' });
  });
});
