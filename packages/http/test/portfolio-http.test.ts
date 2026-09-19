import { describe, expect, it } from 'vitest';
import {
  type Actor,
  type IdGenerator,
  type LeaseRepository,
  type OwnershipRepository,
  type PartyRepository,
  type PortfolioRepository,
  type TenancyRepository,
  type UserAccessRepository,
  type VerifiedIdentity,
} from '@portfolio/application';
import {
  asUserId,
  type DateOnly,
  type LeaseAgreement,
  type LeaseAgreementId,
  type LeaseAmendment,
  type LeaseAmendmentId,
  type OwnershipPeriod,
  type Party,
  type PartyId,
  type Property,
  type PropertyId,
  type Space,
  type SpaceId,
  type Tenancy,
  type TenancyId,
  type TenancyParty,
  type TenancyTermVersion,
  type Unit,
  type UnitId,
} from '@portfolio/domain';
import { createPortfolioHttpHandler } from '../src/index.js';
import { InMemoryAssetInventoryRepository, InMemoryAssetRepository } from './asset-test-deps.js';
import {
  FixedClock,
  InMemoryDocumentRepository,
  MemoryFileStorage,
} from './document-test-deps.js';
import {
  InMemoryInspectionRepository,
  InMemoryStaffDirectoryRepository,
} from './inspection-test-deps.js';

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


class EmptyTenancyRepository implements TenancyRepository {
  async getById(_id: TenancyId): Promise<Tenancy | null> { return null; }
  async listByUnit(_unitId: UnitId): Promise<readonly Tenancy[]> { return []; }
  async codeExists(_code: string): Promise<boolean> { return false; }
  async hasPlannedReservationOverlap() { return false; }
  async hasActualOccupancyOverlap() { return false; }
  async insert(_tenancy: Tenancy): Promise<void> {}
  async insertParty(
    _tenancyParty: TenancyParty,
    _expectedTenancyVersion: number,
    _newTenancyVersion: number,
  ): Promise<void> {}
  async updateLifecycle(
    _tenancy: Tenancy,
    _expectedVersion: number,
  ): Promise<void> {}
}

class EmptyLeaseRepository implements LeaseRepository {
  async getAgreementById(_id: LeaseAgreementId): Promise<LeaseAgreement | null> { return null; }
  async listAgreementsByTenancy(_tenancyId: TenancyId): Promise<readonly LeaseAgreement[]> { return []; }
  async agreementCodeExists(_code: string): Promise<boolean> { return false; }
  async successorExists(_predecessorAgreementId: LeaseAgreementId): Promise<boolean> { return false; }
  async insertAgreement(_agreement: LeaseAgreement): Promise<void> {}
  async signAgreement(
    _agreement: LeaseAgreement,
    _expectedVersion: number,
    _terms: TenancyTermVersion,
  ): Promise<void> {}
  async cancelAgreement(
    _agreement: LeaseAgreement,
    _expectedVersion: number,
  ): Promise<void> {}
  async getAmendmentById(_id: LeaseAmendmentId): Promise<LeaseAmendment | null> { return null; }
  async listAmendmentsByAgreement(
    _agreementId: LeaseAgreementId,
  ): Promise<readonly LeaseAmendment[]> { return []; }
  async amendmentCodeExists(_code: string): Promise<boolean> { return false; }
  async insertAmendment(_amendment: LeaseAmendment): Promise<void> {}
  async signAmendment(
    _amendment: LeaseAmendment,
    _expectedVersion: number,
    _terms: TenancyTermVersion,
  ): Promise<void> {}
  async cancelAmendment(
    _amendment: LeaseAmendment,
    _expectedVersion: number,
  ): Promise<void> {}
  async getEffectiveTermsAt(): Promise<TenancyTermVersion | null> { return null; }
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
    assetRepository: new InMemoryAssetRepository(),
    assetInventoryRepository: new InMemoryAssetInventoryRepository(),
    portfolioRepository: new InMemoryPortfolioRepository(),
    partyRepository: new InMemoryPartyRepository(),
    ownershipRepository: new InMemoryOwnershipRepository(),
    tenancyRepository: new EmptyTenancyRepository(),
    leaseRepository: new EmptyLeaseRepository(),
    documentRepository: new InMemoryDocumentRepository(),
    inspectionRepository: new InMemoryInspectionRepository(),
    staffDirectoryRepository: new InMemoryStaffDirectoryRepository(),
    fileStorage: new MemoryFileStorage(),
    clock: new FixedClock(),
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

  it('runs Asset Registry create, lifecycle and replacement through HTTP', async () => {
    const handler = buildHandler([
      'd1000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000003',
      'd1000000-0000-4000-8000-000000000004',
      'd1000000-0000-4000-8000-000000000005',
      'd1000000-0000-4000-8000-000000000006',
      'd1000000-0000-4000-8000-000000000007',
      'd1000000-0000-4000-8000-000000000008',
      'd1000000-0000-4000-8000-000000000009',
    ]);

    const propertyResponse = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...propertyBody,
          code: 'PROP-ASSET-HTTP',
        }),
      }),
      adminIdentity,
    );
    expect(propertyResponse.status).toBe(201);
    const property = (await propertyResponse.json()).data;

    const unitResponse = await handler(
      new Request('https://portfolio.test/units', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId: property.id,
          code: 'UNIT-ASSET-HTTP',
          unitNumber: 'A-HTTP',
          unitType: 'apartment',
        }),
      }),
      adminIdentity,
    );
    expect(unitResponse.status).toBe(201);
    const unit = (await unitResponse.json()).data;

    const spaceResponse = await handler(
      new Request('https://portfolio.test/spaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          unitId: unit.id,
          code: 'KITCHEN',
          name: 'Kitchen',
          spaceType: 'kitchen',
        }),
      }),
      adminIdentity,
    );
    expect(spaceResponse.status).toBe(201);
    const space = (await spaceResponse.json()).data;

    const assetResponse = await handler(
      new Request('https://portfolio.test/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'ASSET-HTTP-001',
          name: 'Refrigerator',
          propertyId: property.id,
          unitId: unit.id,
          spaceId: space.id,
          manufacturer: 'Bosh',
          model: 'KGN39',
          identifiers: [
            {
              identifierType: 'serial_number',
              value: 'HTTP-SN-001',
            },
          ],
        }),
      }),
      adminIdentity,
    );
    expect(assetResponse.status).toBe(201);
    const asset = (await assetResponse.json()).data;
    expect(asset).toMatchObject({
      status: 'active',
      version: 1,
      propertyId: property.id,
      unitId: unit.id,
      spaceId: space.id,
      manufacturer: 'Bosh',
      model: 'KGN39',
    });
    expect(asset.identifiers).toHaveLength(1);

    const buildingAssetResponse = await handler(
      new Request('https://portfolio.test/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'ASSET-BUILDING-HTTP',
          name: 'Lift controller',
          propertyId: property.id,
        }),
      }),
      adminIdentity,
    );
    expect(buildingAssetResponse.status).toBe(201);
    expect(await buildingAssetResponse.json()).toMatchObject({
      data: {
        code: 'ASSET-BUILDING-HTTP',
        propertyId: property.id,
        unitId: null,
        spaceId: null,
      },
    });

    const propertyAssetsResponse = await handler(
      new Request(`https://portfolio.test/properties/${property.id}/assets`),
      inspectorIdentity,
    );
    expect(propertyAssetsResponse.status).toBe(200);
    expect(await propertyAssetsResponse.json()).toMatchObject({
      data: {
        items: [
          { code: 'ASSET-BUILDING-HTTP', unitId: null },
          { code: 'ASSET-HTTP-001', unitId: unit.id },
        ],
      },
    });

    const metadataResponse = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/metadata`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 1,
          manufacturer: 'Bosch',
        }),
      }),
      adminIdentity,
    );
    expect(metadataResponse.status).toBe(200);
    expect(await metadataResponse.json()).toMatchObject({
      data: {
        id: asset.id,
        manufacturer: 'Bosch',
        version: 2,
        propertyId: property.id,
        unitId: unit.id,
        spaceId: space.id,
      },
    });

    const inspectorList = await handler(
      new Request(`https://portfolio.test/units/${unit.id}/assets`),
      inspectorIdentity,
    );
    expect(inspectorList.status).toBe(200);
    expect(await inspectorList.json()).toMatchObject({
      data: { items: [{ id: asset.id, code: 'ASSET-HTTP-001' }] },
    });

    const inspectorWrite = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 2,
          status: 'inactive',
        }),
      }),
      inspectorIdentity,
    );
    expect(inspectorWrite.status).toBe(403);

    const inactiveResponse = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 2,
          status: 'inactive',
        }),
      }),
      adminIdentity,
    );
    expect(inactiveResponse.status).toBe(200);
    expect(await inactiveResponse.json()).toMatchObject({
      data: { id: asset.id, status: 'inactive', version: 3 },
    });

    const replacementResponse = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/replacement`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 3,
          code: 'ASSET-HTTP-002',
          name: 'Replacement refrigerator',
          manufacturer: 'Bosch',
          model: 'KGN49',
          identifiers: [
            {
              identifierType: 'serial_number',
              value: 'HTTP-SN-002',
            },
          ],
        }),
      }),
      adminIdentity,
    );
    expect(replacementResponse.status).toBe(201);
    const replacementBody = await replacementResponse.json();
    expect(replacementBody).toMatchObject({
      data: {
        replacedAsset: {
          id: asset.id,
          status: 'replaced',
          version: 4,
        },
        replacementAsset: {
          code: 'ASSET-HTTP-002',
          status: 'active',
          version: 1,
          propertyId: property.id,
          unitId: unit.id,
          spaceId: space.id,
        },
        replacement: {
          replacedAssetId: asset.id,
        },
      },
    });

    const lineageResponse = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/replacements`),
      adminIdentity,
    );
    expect(lineageResponse.status).toBe(200);
    expect(await lineageResponse.json()).toMatchObject({
      data: {
        predecessor: null,
        successor: {
          replacedAssetId: asset.id,
          replacementAssetId: replacementBody.data.replacementAsset.id,
        },
      },
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

  it('normalizes malformed JSON to the same 400 contract across route modules', async () => {
    const handler = buildHandler();
    const requests = [
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        body: '{',
      }),
      new Request('https://portfolio.test/parties', {
        method: 'POST',
        body: '{',
      }),
      new Request(
        'https://portfolio.test/units/11111111-1111-4111-8111-111111111111/ownership-periods',
        {
          method: 'POST',
          body: '{',
        },
      ),
      new Request(
        'https://portfolio.test/units/11111111-1111-4111-8111-111111111111/tenancies',
        {
          method: 'POST',
          body: '{',
        },
      ),
      new Request(
        'https://portfolio.test/tenancies/11111111-1111-4111-8111-111111111111/agreements',
        {
          method: 'POST',
          body: '{',
        },
      ),
    ];

    for (const request of requests) {
      const response = await handler(request, adminIdentity);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'INVALID_REQUEST' },
      });
    }
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
        assetRepository: new InMemoryAssetRepository(),
    assetInventoryRepository: new InMemoryAssetInventoryRepository(),
        portfolioRepository: new InMemoryPortfolioRepository(),
        partyRepository: new InMemoryPartyRepository(),
        ownershipRepository: new InMemoryOwnershipRepository(),
        tenancyRepository: new EmptyTenancyRepository(),
        leaseRepository: new EmptyLeaseRepository(),
        documentRepository: new InMemoryDocumentRepository(),
        inspectionRepository: new InMemoryInspectionRepository(),
        staffDirectoryRepository: new InMemoryStaffDirectoryRepository(),
        fileStorage: new MemoryFileStorage(),
        clock: new FixedClock(),
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

  it('runs Document → binary version → final → domain link through HTTP', async () => {
    const handler = buildHandler([
      '40000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000004',
    ]);

    const property = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        body: JSON.stringify(propertyBody),
      }),
      adminIdentity,
    );
    expect(property.status).toBe(201);

    const created = await handler(
      new Request('https://portfolio.test/documents', {
        method: 'POST',
        body: JSON.stringify({
          code: 'DOC-LEASE-1',
          title: 'Lease evidence',
          category: 'legal',
        }),
      }),
      adminIdentity,
    );
    expect(created.status).toBe(201);
    const document = (await created.json()).data as {
      id: string;
      latestVersionNumber: number;
    };
    expect(document.latestVersionNumber).toBe(0);

    const uploaded = await handler(
      new Request(
        `https://portfolio.test/documents/${document.id}/versions?fileName=lease.pdf`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/pdf' },
          body: new Uint8Array([1, 2, 3, 4]),
        },
      ),
      adminIdentity,
    );
    expect(uploaded.status).toBe(201);
    const version = (await uploaded.json()).data as {
      id: string;
      versionNumber: number;
      status: string;
    };
    expect(version).toMatchObject({
      versionNumber: 1,
      status: 'stored',
    });

    const finalized = await handler(
      new Request(
        `https://portfolio.test/document-versions/${version.id}/finalize`,
        { method: 'POST' },
      ),
      adminIdentity,
    );
    expect(finalized.status).toBe(200);
    expect(await finalized.clone().json()).toMatchObject({
      data: {
        status: 'final',
        finalizedAt: '2026-09-18T20:00:00.000Z',
      },
    });

    const linked = await handler(
      new Request(
        `https://portfolio.test/documents/${document.id}/links`,
        {
          method: 'POST',
          body: JSON.stringify({
            documentVersionId: version.id,
            relation: 'supporting',
            targetType: 'property',
            targetId: '40000000-0000-4000-8000-000000000001',
          }),
        },
      ),
      adminIdentity,
    );
    expect(linked.status).toBe(201);
    expect(await linked.json()).toMatchObject({
      data: {
        documentVersionId: version.id,
        relation: 'supporting',
        targetType: 'property',
        targetId: '40000000-0000-4000-8000-000000000001',
      },
    });

    const listedVersions = await handler(
      new Request(
        `https://portfolio.test/documents/${document.id}/versions`,
      ),
      inspectorIdentity,
    );
    expect(listedVersions.status).toBe(200);
    expect(await listedVersions.json()).toMatchObject({
      data: { items: [{ versionNumber: 1, status: 'final' }] },
    });

    const inspectorWrite = await handler(
      new Request('https://portfolio.test/documents', {
        method: 'POST',
        body: JSON.stringify({
          code: 'DOC-FORBIDDEN',
          title: 'Forbidden',
          category: 'other',
        }),
      }),
      inspectorIdentity,
    );
    expect(inspectorWrite.status).toBe(403);
  });

});
