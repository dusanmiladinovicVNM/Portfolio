import { describe, expect, it } from 'vitest';
import {
  type Actor,
  type IdGenerator,
  type PortfolioRepository,
} from '@portfolio/application';
import {
  asPropertyId,
  asUnitId,
  createUnit,
  type Property,
  type PropertyId,
  type Space,
  type SpaceId,
  type Unit,
  type UnitId,
} from '@portfolio/domain';
import { handlePortfolioHttp } from '../src/portfolio-http-routes.js';

const inspector: Actor = {
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as Actor['userId'],
  role: 'inspector',
};

const unit = createUnit({
  id: asUnitId('22222222-2222-4222-8222-222222222222'),
  propertyId: asPropertyId('11111111-1111-4111-8111-111111111111'),
  code: 'UNIT-1',
  unitNumber: '1A',
  unitType: 'apartment',
  floor: '1',
  areaM2: 55,
  rooms: 2,
});

class ReadRepository implements PortfolioRepository {
  constructor(private readonly storedUnit: Unit | null) {}

  async getPropertyById(_id: PropertyId): Promise<Property | null> {
    return null;
  }

  async getUnitById(id: UnitId): Promise<Unit | null> {
    return this.storedUnit?.id === id ? this.storedUnit : null;
  }

  async getSpaceById(_id: SpaceId): Promise<Space | null> {
    return null;
  }

  async listProperties(): Promise<readonly Property[]> {
    return [];
  }

  async listUnitsByProperty(_propertyId: PropertyId): Promise<readonly Unit[]> {
    return [];
  }

  async listSpacesByUnit(_unitId: UnitId): Promise<readonly Space[]> {
    return [];
  }

  async propertyCodeExists(_code: string): Promise<boolean> {
    return false;
  }

  async unitCodeExists(_code: string): Promise<boolean> {
    return false;
  }

  async unitNumberExists(
    _propertyId: PropertyId,
    _unitNumber: string,
  ): Promise<boolean> {
    return false;
  }

  async spaceCodeExists(_unitId: UnitId, _code: string): Promise<boolean> {
    return false;
  }

  async insertProperty(_property: Property): Promise<void> {}

  async insertUnit(_unit: Unit): Promise<void> {}

  async insertSpace(_space: Space): Promise<void> {}
}

const idGenerator: IdGenerator = {
  next: () => '33333333-3333-4333-8333-333333333333',
};

describe('Portfolio Unit read route', () => {
  it('restores canonical Unit metadata from URL identity', async () => {
    const response = await handlePortfolioHttp(
      {
        portfolioRepository: new ReadRepository(unit),
        idGenerator,
      },
      inspector,
      new Request(`https://portfolio.test/units/${unit.id}`),
      `/units/${unit.id}`,
    );

    if (!response) throw new Error('Unit route was not handled.');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        id: unit.id,
        propertyId: unit.propertyId,
        code: 'UNIT-1',
        unitNumber: '1A',
        unitType: 'apartment',
        floor: '1',
        areaM2: 55,
        rooms: 2,
        status: 'active',
        notes: '',
      },
    });
  });

  it('returns UNIT_NOT_FOUND for an unknown deep-link identity', async () => {
    const missingId = asUnitId('44444444-4444-4444-8444-444444444444');
    const response = await handlePortfolioHttp(
      {
        portfolioRepository: new ReadRepository(null),
        idGenerator,
      },
      inspector,
      new Request(`https://portfolio.test/units/${missingId}`),
      `/units/${missingId}`,
    );

    if (!response) throw new Error('Unit route was not handled.');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'UNIT_NOT_FOUND',
        message: 'Unit not found.',
      },
    });
  });
});
