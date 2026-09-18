import { describe, expect, it } from 'vitest';
import {
  type Actor,
  type IdGenerator,
  type OwnershipRepository,
  type PartyRepository,
  type PortfolioRepository,
  type UserAccessRepository,
  type VerifiedIdentity,
} from '@portfolio/application';
import {
  asUserId,
  type DateOnly,
  type OwnershipPeriod,
  type Party,
  type PartyId,
  type Property,
  type PropertyId,
  type Space,
  type SpaceId,
  type Unit,
  type UnitId,
} from '@portfolio/domain';
import { createPortfolioHttpHandler } from '../src/index.js';

const adminIdentity: VerifiedIdentity = {
  provider: 'supabase',
  subject: 'admin-subject',
};

const inspectorIdentity: VerifiedIdentity = {
  provider: 'supabase',
  subject: 'inspector-subject',
};

class FixedIds implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  next(): string {
    const value = this.values[this.index++];
    if (!value) throw new Error('No test ID configured.');
    return value;
  }
}

class InMemoryAccessRepository implements UserAccessRepository {
  async findActorByIdentity(identity: VerifiedIdentity): Promise<Actor | null> {
    if (identity.subject === 'admin-subject') {
      return {
        userId: asUserId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        role: 'admin',
      };
    }
    if (identity.subject === 'inspector-subject') {
      return {
        userId: asUserId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
        role: 'inspector',
      };
    }
    return null;
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
    return [...this.units.values()].filter((item) => item.propertyId === propertyId);
  }
  async listSpacesByUnit(unitId: UnitId): Promise<readonly Space[]> {
    return [...this.spaces.values()].filter((item) => item.unitId === unitId);
  }
  async propertyCodeExists(code: string): Promise<boolean> {
    return [...this.properties.values()].some(
      (item) => item.code.toLowerCase() === code.toLowerCase(),
    );
  }
  async unitCodeExists(code: string): Promise<boolean> {
    return [...this.units.values()].some(
      (item) => item.code.toLowerCase() === code.toLowerCase(),
    );
  }
  async unitNumberExists(propertyId: PropertyId, unitNumber: string): Promise<boolean> {
    return [...this.units.values()].some(
      (item) =>
        item.propertyId === propertyId &&
        item.unitNumber.toLowerCase() === unitNumber.toLowerCase(),
    );
  }
  async spaceCodeExists(unitId: UnitId, code: string): Promise<boolean> {
    return [...this.spaces.values()].some(
      (item) => item.unitId === unitId && item.code.toLowerCase() === code.toLowerCase(),
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

class InMemoryPartyRepository implements PartyRepository {
  private readonly parties = new Map<PartyId, Party>();

  async getById(id: PartyId): Promise<Party | null> {
    return this.parties.get(id) ?? null;
  }

  async getByIds(ids: readonly PartyId[]): Promise<readonly Party[]> {
    return ids.flatMap((id) => {
      const party = this.parties.get(id);
      return party ? [party] : [];
    });
  }

  async list(): Promise<readonly Party[]> {
    return [...this.parties.values()];
  }

  async codeExists(code: string): Promise<boolean> {
    return [...this.parties.values()].some(
      (party) => party.code.toLowerCase() === code.toLowerCase(),
    );
  }

  async insert(party: Party): Promise<void> {
    this.parties.set(party.id, party);
  }
}

class InMemoryOwnershipRepository implements OwnershipRepository {
  private readonly periods: OwnershipPeriod[] = [];

  async listByUnit(unitId: UnitId): Promise<readonly OwnershipPeriod[]> {
    return this.periods.filter((period) => period.unitId === unitId);
  }

  async overlaps(
    unitId: UnitId,
    validFrom: DateOnly,
    validTo: DateOnly | null,
  ): Promise<boolean> {
    const rightEnd = validTo ?? '9999-12-31';
    return this.periods.some((period) => {
      if (period.unitId !== unitId) return false;
      const leftEnd = period.validTo ?? '9999-12-31';
      return period.validFrom <= rightEnd && validFrom <= leftEnd;
    });
  }

  async insert(period: OwnershipPeriod): Promise<void> {
    this.periods.push(period);
  }
}

function buildHandler(
  ids: readonly string[] = [
    '6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f',
    'f05296da-8e3c-45e5-8357-957745830c86',
    'f5d0ee31-0f36-41cf-8660-6de2ed95bd2b',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  ],
) {
  return createPortfolioHttpHandler({
    portfolioRepository: new InMemoryPortfolioRepository(),
    partyRepository: new InMemoryPartyRepository(),
    ownershipRepository: new InMemoryOwnershipRepository(),
    userAccessRepository: new InMemoryAccessRepository(),
    idGenerator: new FixedIds(ids),
  });
}

const propertyBody = {
  code: 'PROP-0001',
  name: 'Main Building',
  propertyType: 'apartment_building',
  street: 'Example Street',
  houseNumber: '10',
  postalCode: '18000',
  city: 'Niš',
  countryCode: 'RS',
};

describe('Portfolio HTTP boundary', () => {
  it('requires a verified identity', async () => {
    const response = await buildHandler()(
      new Request('https://portfolio.test/properties'),
      null,
    );
    expect(response.status).toBe(401);
  });

  it('rejects an authenticated identity that is not an active internal user', async () => {
    const response = await buildHandler()(
      new Request('https://portfolio.test/properties'),
      { provider: 'supabase', subject: 'unknown' },
    );
    expect(response.status).toBe(401);
  });

  it('allows admin create then read through the stable HTTP contract', async () => {
    const handler = buildHandler();

    const created = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(propertyBody),
      }),
      adminIdentity,
    );

    expect(created.status).toBe(201);

    const listed = await handler(
      new Request('https://portfolio.test/properties'),
      adminIdentity,
    );

    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      data: { items: [{ code: 'PROP-0001' }] },
    });
  });

  it('allows inspector reads but rejects master-data writes', async () => {
    const handler = buildHandler();

    const read = await handler(
      new Request('https://portfolio.test/properties'),
      inspectorIdentity,
    );
    expect(read.status).toBe(200);

    const write = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(propertyBody),
      }),
      inspectorIdentity,
    );

    expect(write.status).toBe(403);
  });

  it('returns 400 for invalid transport input before reaching the domain', async () => {
    const response = await buildHandler()(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: '' }),
      }),
      adminIdentity,
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 when a child collection is requested for a missing parent', async () => {
    const handler = buildHandler();

    const response = await handler(
      new Request(
        'https://portfolio.test/properties/11111111-1111-4111-8111-111111111111/units',
      ),
      adminIdentity,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'PROPERTY_NOT_FOUND' },
    });
  });

  it('keeps inspectors read-only for Party master data', async () => {
    const handler = buildHandler();

    const read = await handler(
      new Request('https://portfolio.test/parties'),
      inspectorIdentity,
    );
    expect(read.status).toBe(200);

    const write = await handler(
      new Request('https://portfolio.test/parties', {
        method: 'POST',
        body: JSON.stringify({
          code: 'PTY-READONLY',
          partyType: 'person',
          firstName: 'Read',
          lastName: 'Only',
        }),
      }),
      inspectorIdentity,
    );

    expect(write.status).toBe(403);
  });

  it('creates a Party master without encoding owner/tenant role in the identity', async () => {
    const handler = buildHandler();

    const response = await handler(
      new Request('https://portfolio.test/parties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'PTY-0001',
          partyType: 'company',
          legalName: 'Example Property d.o.o.',
          contactPoints: [
            {
              contactType: 'email',
              value: 'office@example.test',
              isPrimary: true,
            },
          ],
        }),
      }),
      adminIdentity,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      data: {
        code: 'PTY-0001',
        partyType: 'company',
        legalName: 'Example Property d.o.o.',
      },
    });
  });

  it('creates and reads a complete ownership composition for a Unit', async () => {
    const handler = buildHandler([
      '6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f',
      'f05296da-8e3c-45e5-8357-957745830c86',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);

    await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        body: JSON.stringify(propertyBody),
      }),
      adminIdentity,
    );

    const unitResponse = await handler(
      new Request('https://portfolio.test/units', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: '6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f',
          code: 'UNIT-0001',
          unitNumber: '4B',
          unitType: 'apartment',
        }),
      }),
      adminIdentity,
    );
    expect(unitResponse.status).toBe(201);

    const partyResponse = await handler(
      new Request('https://portfolio.test/parties', {
        method: 'POST',
        body: JSON.stringify({
          code: 'PTY-0001',
          partyType: 'person',
          firstName: 'Ana',
          lastName: 'Jovanović',
        }),
      }),
      adminIdentity,
    );
    expect(partyResponse.status).toBe(201);

    const ownership = await handler(
      new Request(
        'https://portfolio.test/units/f05296da-8e3c-45e5-8357-957745830c86/ownership-periods',
        {
          method: 'POST',
          body: JSON.stringify({
            validFrom: '2026-01-01',
            owners: [
              {
                partyId: '11111111-1111-4111-8111-111111111111',
                sharePercent: 100,
              },
            ],
          }),
        },
      ),
      adminIdentity,
    );

    expect(ownership.status).toBe(201);
    expect(await ownership.json()).toMatchObject({
      data: {
        validFrom: '2026-01-01',
        owners: [{ sharePercent: 100 }],
      },
    });

    const listed = await handler(
      new Request(
        'https://portfolio.test/units/f05296da-8e3c-45e5-8357-957745830c86/ownership-periods',
      ),
      adminIdentity,
    );

    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      data: { items: [{ owners: [{ sharePercent: 100 }] }] },
    });
  });

  it('rejects incomplete ownership compositions', async () => {
    const handler = buildHandler([
      '6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f',
      'f05296da-8e3c-45e5-8357-957745830c86',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);

    await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        body: JSON.stringify(propertyBody),
      }),
      adminIdentity,
    );
    await handler(
      new Request('https://portfolio.test/units', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: '6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f',
          code: 'UNIT-0001',
          unitNumber: '4B',
          unitType: 'apartment',
        }),
      }),
      adminIdentity,
    );
    await handler(
      new Request('https://portfolio.test/parties', {
        method: 'POST',
        body: JSON.stringify({
          code: 'PTY-0001',
          partyType: 'person',
          firstName: 'Ana',
          lastName: 'Jovanović',
        }),
      }),
      adminIdentity,
    );

    const response = await handler(
      new Request(
        'https://portfolio.test/units/f05296da-8e3c-45e5-8357-957745830c86/ownership-periods',
        {
          method: 'POST',
          body: JSON.stringify({
            validFrom: '2026-01-01',
            owners: [
              {
                partyId: '11111111-1111-4111-8111-111111111111',
                sharePercent: 75,
              },
            ],
          }),
        },
      ),
      adminIdentity,
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'OWNERSHIP_SHARES_NOT_COMPLETE' },
    });
  });

  it('supports a configurable host base path without leaking provider details', async () => {
    const handler = createPortfolioHttpHandler(
      {
        portfolioRepository: new InMemoryPortfolioRepository(),
        partyRepository: new InMemoryPartyRepository(),
        ownershipRepository: new InMemoryOwnershipRepository(),
        userAccessRepository: new InMemoryAccessRepository(),
        idGenerator: new FixedIds(['6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f']),
      },
      { basePath: '/functions/v1/api' },
    );

    const response = await handler(
      new Request('https://project.test/functions/v1/api/properties'),
      adminIdentity,
    );

    expect(response.status).toBe(200);
  });
});
