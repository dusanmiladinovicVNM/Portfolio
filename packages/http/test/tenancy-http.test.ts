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
  asDateOnly,
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
import { InMemoryAssetInventoryRepository, InMemoryAssetRepository, InMemoryAssetServiceRepository } from './asset-test-deps.js';
import {
  FixedClock,
  InMemoryDocumentRepository,
  MemoryFileStorage,
} from './document-test-deps.js';
import {
  InMemoryInspectionRepository,
  InMemoryStaffDirectoryRepository,
} from './inspection-test-deps.js';
import { InMemoryImprovementRepository } from './improvement-test-deps.js';
import { InMemoryCostRepository } from './cost-test-deps.js';
import { InMemoryMaintenanceRepository } from './maintenance-test-deps.js';
import { InMemoryAccessItemRepository } from './access-item-test-deps.js';
import { InMemoryMeterRepository } from './meter-test-deps.js';
import { InMemoryUnitTimelineRepository } from './unit-timeline-test-deps.js';

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
  readonly properties = new Map<PropertyId, Property>();
  readonly units = new Map<UnitId, Unit>();
  readonly spaces = new Map<SpaceId, Space>();

  async getPropertyById(id: PropertyId) { return this.properties.get(id) ?? null; }
  async getUnitById(id: UnitId) { return this.units.get(id) ?? null; }
  async getSpaceById(id: SpaceId) { return this.spaces.get(id) ?? null; }
  async listProperties() { return [...this.properties.values()]; }
  async listUnitsByProperty(propertyId: PropertyId) {
    return [...this.units.values()].filter((item) => item.propertyId === propertyId);
  }
  async listSpacesByUnit(unitId: UnitId) {
    return [...this.spaces.values()].filter((item) => item.unitId === unitId);
  }
  async propertyCodeExists(code: string) {
    return [...this.properties.values()].some((item) => item.code.toLowerCase() === code.toLowerCase());
  }
  async unitCodeExists(code: string) {
    return [...this.units.values()].some((item) => item.code.toLowerCase() === code.toLowerCase());
  }
  async unitNumberExists(propertyId: PropertyId, unitNumber: string) {
    return [...this.units.values()].some(
      (item) => item.propertyId === propertyId && item.unitNumber.toLowerCase() === unitNumber.toLowerCase(),
    );
  }
  async spaceCodeExists(unitId: UnitId, code: string) {
    return [...this.spaces.values()].some(
      (item) => item.unitId === unitId && item.code.toLowerCase() === code.toLowerCase(),
    );
  }
  async insertProperty(property: Property) { this.properties.set(property.id, property); }
  async insertUnit(unit: Unit) { this.units.set(unit.id, unit); }
  async insertSpace(space: Space) { this.spaces.set(space.id, space); }
}

class InMemoryPartyRepository implements PartyRepository {
  readonly parties = new Map<PartyId, Party>();

  async getById(id: PartyId) { return this.parties.get(id) ?? null; }
  async getByIds(ids: readonly PartyId[]) {
    return ids.flatMap((id) => {
      const party = this.parties.get(id);
      return party ? [party] : [];
    });
  }
  async list() { return [...this.parties.values()]; }
  async codeExists(code: string) {
    return [...this.parties.values()].some((item) => item.code.toLowerCase() === code.toLowerCase());
  }
  async insert(party: Party) { this.parties.set(party.id, party); }
}

class InMemoryOwnershipRepository implements OwnershipRepository {
  async listByUnit(_unitId: UnitId): Promise<readonly OwnershipPeriod[]> { return []; }
  async overlaps(_unitId: UnitId, _from: DateOnly, _to: DateOnly | null) { return false; }
  async insert(_period: OwnershipPeriod) {}
}

class InMemoryTenancyRepository implements TenancyRepository {
  readonly tenancies = new Map<TenancyId, Tenancy>();

  async getById(id: TenancyId) { return this.tenancies.get(id) ?? null; }

  async listByUnit(unitId: UnitId) {
    return [...this.tenancies.values()].filter((item) => item.unitId === unitId);
  }

  async codeExists(code: string) {
    return [...this.tenancies.values()].some((item) => item.code.toLowerCase() === code.toLowerCase());
  }

  async hasPlannedReservationOverlap(
    unitId: UnitId,
    validFrom: DateOnly,
    validTo: DateOnly | null,
    excludeTenancyId?: TenancyId,
  ) {
    const rightEnd = validTo ?? asDateOnly('9999-12-31');
    return [...this.tenancies.values()].some((tenancy) => {
      if (
        tenancy.unitId !== unitId ||
        tenancy.id === excludeTenancyId ||
        tenancy.status !== 'planned' ||
        tenancy.plannedStart === null
      ) {
        return false;
      }

      const leftEnd = tenancy.plannedEnd ?? asDateOnly('9999-12-31');
      return tenancy.plannedStart <= rightEnd && validFrom <= leftEnd;
    });
  }

  async hasActualOccupancyOverlap(
    unitId: UnitId,
    validFrom: DateOnly,
    validTo: DateOnly | null,
    excludeTenancyId?: TenancyId,
  ) {
    const rightEnd = validTo ?? asDateOnly('9999-12-31');
    return [...this.tenancies.values()].some((tenancy) => {
      if (
        tenancy.unitId !== unitId ||
        tenancy.id === excludeTenancyId ||
        tenancy.actualStart === null ||
        !['active', 'notice_given', 'move_out_pending', 'ended'].includes(tenancy.status)
      ) {
        return false;
      }

      const leftEnd =
        tenancy.status === 'ended'
          ? tenancy.actualEnd
          : tenancy.status === 'notice_given' || tenancy.status === 'move_out_pending'
            ? tenancy.terminationEffectiveAt
            : null;
      const normalizedLeftEnd = leftEnd ?? asDateOnly('9999-12-31');
      return tenancy.actualStart <= rightEnd && validFrom <= normalizedLeftEnd;
    });
  }

  async insert(tenancy: Tenancy) {
    this.tenancies.set(tenancy.id, tenancy);
  }

  async insertParty(
    tenancyParty: TenancyParty,
    expectedTenancyVersion: number,
    newTenancyVersion: number,
  ) {
    const current = this.tenancies.get(tenancyParty.tenancyId);
    if (!current || current.version !== expectedTenancyVersion) {
      throw Object.assign(new Error('version conflict'), { code: 'TENANCY_VERSION_CONFLICT' });
    }

    this.tenancies.set(current.id, {
      ...current,
      version: newTenancyVersion,
      parties: [...current.parties, tenancyParty],
    });
  }

  async updateLifecycle(tenancy: Tenancy, expectedVersion: number) {
    const current = this.tenancies.get(tenancy.id);
    if (!current || current.version !== expectedVersion) {
      throw Object.assign(new Error('version conflict'), { code: 'TENANCY_VERSION_CONFLICT' });
    }
    this.tenancies.set(tenancy.id, tenancy);
  }
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

function buildHandler() {
  const portfolioRepository = new InMemoryPortfolioRepository();
  const partyRepository = new InMemoryPartyRepository();
  const tenancyRepository = new InMemoryTenancyRepository();
  const accessItemRepository = new InMemoryAccessItemRepository();
  const meterRepository = new InMemoryMeterRepository();

  const handler = createPortfolioHttpHandler({
    accessItemRepository,
    meterRepository,
    unitTimelineRepository: new InMemoryUnitTimelineRepository(),
    assetRepository: new InMemoryAssetRepository(),
    assetInventoryRepository: new InMemoryAssetInventoryRepository(),
    assetServiceRepository: new InMemoryAssetServiceRepository(),
    improvementRepository: new InMemoryImprovementRepository(),
    costRepository: new InMemoryCostRepository(),
    maintenanceRepository: new InMemoryMaintenanceRepository(),
    portfolioRepository,
    partyRepository,
    ownershipRepository: new InMemoryOwnershipRepository(),
    tenancyRepository,
    leaseRepository: new EmptyLeaseRepository(),
    documentRepository: new InMemoryDocumentRepository(),
    inspectionRepository: new InMemoryInspectionRepository(),
    staffDirectoryRepository: new InMemoryStaffDirectoryRepository(),
    fileStorage: new MemoryFileStorage(),
    clock: new FixedClock(),
    userAccessRepository: new InMemoryAccessRepository(),
    idGenerator: new FixedIds([
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000005',
      '10000000-0000-4000-8000-000000000006',
      '10000000-0000-4000-8000-000000000007',
      '10000000-0000-4000-8000-000000000008',
      '10000000-0000-4000-8000-000000000009',
      '10000000-0000-4000-8000-000000000010',
      '10000000-0000-4000-8000-000000000011',
      '10000000-0000-4000-8000-000000000012',
      '10000000-0000-4000-8000-000000000013',
      '10000000-0000-4000-8000-000000000014',
      '10000000-0000-4000-8000-000000000015',
      '10000000-0000-4000-8000-000000000016',
      '10000000-0000-4000-8000-000000000017',
      '10000000-0000-4000-8000-000000000018',
      '10000000-0000-4000-8000-000000000019',
      '10000000-0000-4000-8000-000000000020',
      '10000000-0000-4000-8000-000000000021',
      '10000000-0000-4000-8000-000000000022',
      '10000000-0000-4000-8000-000000000023',
      '10000000-0000-4000-8000-000000000024',
      '10000000-0000-4000-8000-000000000025',
      '10000000-0000-4000-8000-000000000026',
      '10000000-0000-4000-8000-000000000027',
      '10000000-0000-4000-8000-000000000028',
      '10000000-0000-4000-8000-000000000029',
      '10000000-0000-4000-8000-000000000030',
      '10000000-0000-4000-8000-000000000031',
      '10000000-0000-4000-8000-000000000032',
    ]),
  });

  return {
    handler,
    portfolioRepository,
    partyRepository,
    tenancyRepository,
    accessItemRepository,
    meterRepository,
    unitTimelineRepository: new InMemoryUnitTimelineRepository(),
  };
}

async function seedUnitAndTenant(handler: ReturnType<typeof buildHandler>['handler']) {
  await handler(
    new Request('https://portfolio.test/properties', {
      method: 'POST',
      body: JSON.stringify({
        code: 'PROP-TEN',
        name: 'Tenancy Building',
        propertyType: 'apartment_building',
        street: 'Example',
        houseNumber: '1',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      }),
    }),
    adminIdentity,
  );

  await handler(
    new Request('https://portfolio.test/units', {
      method: 'POST',
      body: JSON.stringify({
        propertyId: '10000000-0000-4000-8000-000000000001',
        code: 'UNIT-TEN',
        unitNumber: '1A',
        unitType: 'apartment',
      }),
    }),
    adminIdentity,
  );

  await handler(
    new Request('https://portfolio.test/parties', {
      method: 'POST',
      body: JSON.stringify({
        code: 'PTY-TEN',
        partyType: 'person',
        firstName: 'Tenant',
        lastName: 'One',
      }),
    }),
    adminIdentity,
  );
}

describe('Meter HTTP lifecycle and boundary readings', () => {
  it('separates physical readings from Tenancy boundaries and preserves consumption history', async () => {
    const { handler } = buildHandler();
    await seedUnitAndTenant(handler);

    const createdTenancy = await handler(
      new Request(
        'https://portfolio.test/units/10000000-0000-4000-8000-000000000002/tenancies',
        {
          method: 'POST',
          body: JSON.stringify({
            code: 'TEN-METER-1',
            parties: [
              {
                partyId: '10000000-0000-4000-8000-000000000003',
                role: 'tenant',
                isPrimary: true,
              },
            ],
          }),
        },
      ),
      adminIdentity,
    );
    expect(createdTenancy.status).toBe(201);
    const tenancyId = (await createdTenancy.json()).data.id as string;

    await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/plan`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          plannedStart: '2026-09-18',
        }),
      }),
      adminIdentity,
    );

    await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/activate`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 2,
          actualStart: '2026-09-18',
        }),
      }),
      adminIdentity,
    );

    await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/end`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 3,
          actualEnd: '2026-09-18',
        }),
      }),
      adminIdentity,
    );

    const inspectorCreate = await handler(
      new Request('https://portfolio.test/meters', {
        method: 'POST',
        body: JSON.stringify({
          code: 'MTR-INSPECTOR-DENIED',
          serialNumber: 'SER-DENIED',
          utilityType: 'electricity',
          measurementUnit: 'kwh',
          unitId: '10000000-0000-4000-8000-000000000002',
          label: 'Denied',
          installedAt: '2026-01-01T00:00:00.000Z',
        }),
      }),
      inspectorIdentity,
    );
    expect(inspectorCreate.status).toBe(403);

    const createdMeter = await handler(
      new Request('https://portfolio.test/meters', {
        method: 'POST',
        body: JSON.stringify({
          code: 'MTR-HTTP-1',
          serialNumber: 'SER-HTTP-1',
          utilityType: 'electricity',
          measurementUnit: 'kwh',
          unitId: '10000000-0000-4000-8000-000000000002',
          label: 'Apartment electricity',
          installedAt: '2026-01-01T00:00:00.000Z',
        }),
      }),
      adminIdentity,
    );
    expect(createdMeter.status).toBe(201);
    const meterBody = await createdMeter.json();
    const meterId = meterBody.data.id as string;
    expect(meterBody).toMatchObject({
      data: { status: 'active', version: 1, measurementUnit: 'kwh' },
    });

    const boundaryReading = await handler(
      new Request(`https://portfolio.test/meters/${meterId}/readings`, {
        method: 'POST',
        body: JSON.stringify({
          value: '100.25',
          readAt: '2026-09-18T12:00:00.000Z',
          note: 'Handover observation',
        }),
      }),
      inspectorIdentity,
    );
    expect(boundaryReading.status).toBe(201);
    const readingId = (await boundaryReading.json()).data.id as string;

    const moveIn = await handler(
      new Request(
        `https://portfolio.test/meter-readings/${readingId}/boundaries`,
        {
          method: 'POST',
          body: JSON.stringify({ tenancyId, type: 'move_in' }),
        },
      ),
      inspectorIdentity,
    );
    expect(moveIn.status).toBe(201);

    const moveOut = await handler(
      new Request(
        `https://portfolio.test/meter-readings/${readingId}/boundaries`,
        {
          method: 'POST',
          body: JSON.stringify({ tenancyId, type: 'move_out' }),
        },
      ),
      inspectorIdentity,
    );
    expect(moveOut.status).toBe(201);

    const regular = await handler(
      new Request(`https://portfolio.test/meters/${meterId}/readings`, {
        method: 'POST',
        body: JSON.stringify({
          value: '110.375',
          readAt: '2026-09-18T18:00:00.000Z',
        }),
      }),
      inspectorIdentity,
    );
    expect(regular.status).toBe(201);

    const detail = await handler(
      new Request(`https://portfolio.test/meters/${meterId}`),
      inspectorIdentity,
    );
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      data: {
        meter: { id: meterId, status: 'active' },
        readings: [
          { id: readingId, value: '100.250000' },
          { value: '110.375000' },
        ],
        boundaries: [
          { readingId, tenancyId, type: 'move_in' },
          { readingId, tenancyId, type: 'move_out' },
        ],
        consumptionIntervals: [
          {
            fromValue: '100.250000',
            toValue: '110.375000',
            consumption: '10.125000',
            continuity: 'continuous',
          },
        ],
      },
    });

    const retired = await handler(
      new Request(`https://portfolio.test/meters/${meterId}/retire`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          retiredAt: '2026-09-18T19:00:00.000Z',
          retirementReason: 'Meter replaced',
        }),
      }),
      adminIdentity,
    );
    expect(retired.status).toBe(200);
    expect(await retired.json()).toMatchObject({
      data: {
        status: 'retired',
        version: 2,
        retiredAt: '2026-09-18T19:00:00.000Z',
        retirementRecordedAt: '2026-09-18T20:00:00.000Z',
      },
    });

    const backfill = await handler(
      new Request(`https://portfolio.test/meters/${meterId}/readings`, {
        method: 'POST',
        body: JSON.stringify({
          value: '111',
          readAt: '2026-09-18T18:30:00.000Z',
          note: 'Late-entered historical observation',
        }),
      }),
      inspectorIdentity,
    );
    expect(backfill.status).toBe(201);

    const afterRetirement = await handler(
      new Request(`https://portfolio.test/meters/${meterId}/readings`, {
        method: 'POST',
        body: JSON.stringify({
          value: '112',
          readAt: '2026-09-18T19:00:01.000Z',
        }),
      }),
      inspectorIdentity,
    );
    expect(afterRetirement.status).toBe(422);
    expect(await afterRetirement.json()).toMatchObject({
      error: { code: 'METER_READING_AFTER_RETIREMENT' },
    });

    const tenancyBoundaries = await handler(
      new Request(
        `https://portfolio.test/tenancies/${tenancyId}/meter-reading-boundaries`,
      ),
      inspectorIdentity,
    );
    expect(tenancyBoundaries.status).toBe(200);
    expect(await tenancyBoundaries.json()).toMatchObject({
      data: {
        entries: [
          {
            boundary: { type: 'move_in', readingId },
            reading: { id: readingId, value: '100.250000' },
          },
          {
            boundary: { type: 'move_out', readingId },
            reading: { id: readingId, value: '100.250000' },
          },
        ],
      },
    });
  });
});

describe('AccessItem HTTP custody lifecycle', () => {
  it('runs create -> issue -> loss -> return -> reissue with Tenancy-grained custody', async () => {
    const { handler } = buildHandler();
    await seedUnitAndTenant(handler);

    const createdTenancy = await handler(
      new Request(
        'https://portfolio.test/units/10000000-0000-4000-8000-000000000002/tenancies',
        {
          method: 'POST',
          body: JSON.stringify({
            code: 'TEN-ACCESS-1',
            parties: [
              {
                partyId: '10000000-0000-4000-8000-000000000003',
                role: 'tenant',
                isPrimary: true,
              },
            ],
          }),
        },
      ),
      adminIdentity,
    );
    const tenancyId = (await createdTenancy.json()).data.id as string;

    await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/plan`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          plannedStart: '2026-09-18',
        }),
      }),
      adminIdentity,
    );
    await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/activate`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 2,
          actualStart: '2026-09-18',
        }),
      }),
      adminIdentity,
    );

    const createdItem = await handler(
      new Request('https://portfolio.test/access-items', {
        method: 'POST',
        body: JSON.stringify({
          code: 'KEY-HTTP-1',
          kind: 'key',
          propertyId: '10000000-0000-4000-8000-000000000001',
          unitId: '10000000-0000-4000-8000-000000000002',
          label: 'Apartment entrance key',
        }),
      }),
      adminIdentity,
    );
    expect(createdItem.status).toBe(201);
    const createdItemBody = await createdItem.json();
    const itemId = createdItemBody.data.id as string;
    expect(createdItemBody).toMatchObject({
      data: { status: 'active', version: 1 },
    });

    const correctedLabel = await handler(
      new Request(`https://portfolio.test/access-items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: 1,
          label: 'Main entrance — left cylinder',
        }),
      }),
      adminIdentity,
    );
    expect(correctedLabel.status).toBe(200);
    expect(await correctedLabel.json()).toMatchObject({
      data: {
        label: 'Main entrance — left cylinder',
        status: 'active',
        version: 2,
      },
    });

    const issue = await handler(
      new Request(`https://portfolio.test/access-items/${itemId}/issue`, {
        method: 'POST',
        body: JSON.stringify({
          tenancyId,
          occurredAt: '2026-09-18T20:00:00.000Z',
        }),
      }),
      adminIdentity,
    );
    expect(issue.status).toBe(201);
    expect(await issue.json()).toMatchObject({
      data: { type: 'issued', sequence: 1, tenancyId },
    });

    const lost = await handler(
      new Request(`https://portfolio.test/access-items/${itemId}/loss`, {
        method: 'POST',
        body: JSON.stringify({
          occurredAt: '2026-09-18T20:00:00.000Z',
          note: 'Reported missing during handover',
        }),
      }),
      adminIdentity,
    );
    expect(lost.status).toBe(201);
    expect(await lost.json()).toMatchObject({
      data: { type: 'lost', sequence: 2, tenancyId },
    });

    const detailWhileLost = await handler(
      new Request(`https://portfolio.test/access-items/${itemId}`),
      inspectorIdentity,
    );
    expect(detailWhileLost.status).toBe(200);
    expect(await detailWhileLost.json()).toMatchObject({
      data: {
        state: { kind: 'lost', tenancyId },
        transactions: [
          { type: 'issued', sequence: 1 },
          { type: 'lost', sequence: 2 },
        ],
      },
    });

    const inspectorWrite = await handler(
      new Request(`https://portfolio.test/access-items/${itemId}/return`, {
        method: 'POST',
        body: JSON.stringify({
          occurredAt: '2026-09-18T20:00:00.000Z',
        }),
      }),
      inspectorIdentity,
    );
    expect(inspectorWrite.status).toBe(403);

    const returned = await handler(
      new Request(`https://portfolio.test/access-items/${itemId}/return`, {
        method: 'POST',
        body: JSON.stringify({
          occurredAt: '2026-09-18T20:00:00.000Z',
          note: 'Recovered and handed back',
        }),
      }),
      adminIdentity,
    );
    expect(returned.status).toBe(201);
    expect(await returned.json()).toMatchObject({
      data: { type: 'returned', sequence: 3, tenancyId },
    });

    const reissued = await handler(
      new Request(`https://portfolio.test/access-items/${itemId}/issue`, {
        method: 'POST',
        body: JSON.stringify({
          tenancyId,
          occurredAt: '2026-09-18T20:00:00.000Z',
        }),
      }),
      adminIdentity,
    );
    expect(reissued.status).toBe(201);
    expect(await reissued.json()).toMatchObject({
      data: { type: 'issued', sequence: 4, tenancyId },
    });

    const tenancyItems = await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/access-items`),
      adminIdentity,
    );
    expect(tenancyItems.status).toBe(200);
    expect(await tenancyItems.json()).toMatchObject({
      data: {
        items: [
          {
            item: {
              id: itemId,
              code: 'KEY-HTTP-1',
              status: 'active',
              version: 2,
            },
            state: { kind: 'issued', tenancyId },
          },
        ],
      },
    });

    const retired = await handler(
      new Request(`https://portfolio.test/access-items/${itemId}/retire`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 2,
          retirementReason: 'Lock cylinder replaced',
        }),
      }),
      adminIdentity,
    );
    expect(retired.status).toBe(200);
    expect(await retired.json()).toMatchObject({
      data: {
        status: 'retired',
        version: 3,
        retirementReason: 'Lock cylinder replaced',
      },
    });

    const returnedAfterRetirement = await handler(
      new Request(`https://portfolio.test/access-items/${itemId}/return`, {
        method: 'POST',
        body: JSON.stringify({
          occurredAt: '2026-09-18T20:00:00.000Z',
          note: 'Returned after administrative retirement',
        }),
      }),
      adminIdentity,
    );
    expect(returnedAfterRetirement.status).toBe(201);
    expect(await returnedAfterRetirement.json()).toMatchObject({
      data: { type: 'returned', sequence: 5, tenancyId },
    });

    const retiredReissue = await handler(
      new Request(`https://portfolio.test/access-items/${itemId}/issue`, {
        method: 'POST',
        body: JSON.stringify({
          tenancyId,
          occurredAt: '2026-09-18T20:00:00.000Z',
        }),
      }),
      adminIdentity,
    );
    expect(retiredReissue.status).toBe(409);
    expect(await retiredReissue.json()).toMatchObject({
      error: { code: 'ACCESS_ITEM_RETIRED' },
    });
  });
});

describe('Tenancy HTTP lifecycle', () => {
  it('runs draft → planned → active → notice → move-out → ended with version increments', async () => {
    const { handler } = buildHandler();
    await seedUnitAndTenant(handler);

    const created = await handler(
      new Request(
        'https://portfolio.test/units/10000000-0000-4000-8000-000000000002/tenancies',
        {
          method: 'POST',
          body: JSON.stringify({
            code: 'TEN-0001',
            parties: [
              {
                partyId: '10000000-0000-4000-8000-000000000003',
                role: 'tenant',
                isPrimary: true,
              },
            ],
          }),
        },
      ),
      adminIdentity,
    );

    expect(created.status).toBe(201);
    expect(await created.clone().json()).toMatchObject({
      data: { status: 'draft', version: 1 },
    });

    const tenancyId = (await created.json()).data.id as string;

    const planned = await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/plan`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          plannedStart: '2026-10-01',
          plannedEnd: '2027-09-30',
        }),
      }),
      adminIdentity,
    );
    expect(planned.status).toBe(200);
    expect(await planned.json()).toMatchObject({ data: { status: 'planned', version: 2 } });

    const active = await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/activate`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 2, actualStart: '2026-10-01' }),
      }),
      adminIdentity,
    );
    expect(active.status).toBe(200);

    const notice = await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/give-notice`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 3,
          noticeGivenAt: '2027-08-01',
          terminationEffectiveAt: '2027-09-30',
        }),
      }),
      adminIdentity,
    );
    expect(notice.status).toBe(200);

    const pending = await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/move-out-pending`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 4 }),
      }),
      adminIdentity,
    );
    expect(pending.status).toBe(200);

    const ended = await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/end`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 5, actualEnd: '2027-09-30' }),
      }),
      adminIdentity,
    );

    expect(ended.status).toBe(200);
    expect(await ended.json()).toMatchObject({
      data: {
        status: 'ended',
        version: 6,
        actualStart: '2026-10-01',
        actualEnd: '2027-09-30',
      },
    });
  });

  it('returns 409 for a stale client version', async () => {
    const { handler } = buildHandler();
    await seedUnitAndTenant(handler);

    const created = await handler(
      new Request(
        'https://portfolio.test/units/10000000-0000-4000-8000-000000000002/tenancies',
        {
          method: 'POST',
          body: JSON.stringify({
            code: 'TEN-0001',
            parties: [
              {
                partyId: '10000000-0000-4000-8000-000000000003',
                role: 'tenant',
              },
            ],
          }),
        },
      ),
      adminIdentity,
    );
    const tenancyId = (await created.json()).data.id as string;

    await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/plan`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 1, plannedStart: '2026-10-01' }),
      }),
      adminIdentity,
    );

    const stale = await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/activate`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 1, actualStart: '2026-10-01' }),
      }),
      adminIdentity,
    );

    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { code: 'TENANCY_VERSION_CONFLICT' },
    });
  });

  it('returns 409 when a new planned reservation crosses open actual occupancy', async () => {
    const { handler } = buildHandler();
    await seedUnitAndTenant(handler);

    const current = await handler(
      new Request(
        'https://portfolio.test/units/10000000-0000-4000-8000-000000000002/tenancies',
        {
          method: 'POST',
          body: JSON.stringify({
            code: 'TEN-CURRENT',
            parties: [
              {
                partyId: '10000000-0000-4000-8000-000000000003',
                role: 'tenant',
                isPrimary: true,
              },
            ],
          }),
        },
      ),
      adminIdentity,
    );
    const currentId = (await current.json()).data.id as string;

    await handler(
      new Request(`https://portfolio.test/tenancies/${currentId}/plan`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          plannedStart: '2026-10-01',
          plannedEnd: '2027-09-30',
        }),
      }),
      adminIdentity,
    );

    await handler(
      new Request(`https://portfolio.test/tenancies/${currentId}/activate`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 2,
          actualStart: '2026-10-01',
        }),
      }),
      adminIdentity,
    );

    const successor = await handler(
      new Request(
        'https://portfolio.test/units/10000000-0000-4000-8000-000000000002/tenancies',
        {
          method: 'POST',
          body: JSON.stringify({ code: 'TEN-SUCCESSOR' }),
        },
      ),
      adminIdentity,
    );
    const successorId = (await successor.json()).data.id as string;

    const conflict = await handler(
      new Request(`https://portfolio.test/tenancies/${successorId}/plan`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          plannedStart: '2028-01-01',
          plannedEnd: '2028-12-31',
        }),
      }),
      adminIdentity,
    );

    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      error: { code: 'TENANCY_PLANNED_OCCUPANCY_CONFLICT' },
    });
  });

  it('rejects party mutation after activation through the HTTP contract', async () => {
    const { handler } = buildHandler();
    await seedUnitAndTenant(handler);

    const created = await handler(
      new Request(
        'https://portfolio.test/units/10000000-0000-4000-8000-000000000002/tenancies',
        {
          method: 'POST',
          body: JSON.stringify({
            code: 'TEN-PARTY-FROZEN',
            parties: [
              {
                partyId: '10000000-0000-4000-8000-000000000003',
                role: 'tenant',
                isPrimary: true,
              },
            ],
          }),
        },
      ),
      adminIdentity,
    );
    const tenancyId = (await created.json()).data.id as string;

    await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/plan`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 1,
          plannedStart: '2026-10-01',
        }),
      }),
      adminIdentity,
    );

    await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/activate`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 2,
          actualStart: '2026-10-01',
        }),
      }),
      adminIdentity,
    );

    const response = await handler(
      new Request(`https://portfolio.test/tenancies/${tenancyId}/parties`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 3,
          partyId: '10000000-0000-4000-8000-000000000003',
          role: 'co_tenant',
        }),
      }),
      adminIdentity,
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'TENANCY_PARTY_CHANGE_NOT_ALLOWED' },
    });
  });

  it('keeps inspector tenancy access read-only', async () => {
    const { handler } = buildHandler();
    await seedUnitAndTenant(handler);

    const read = await handler(
      new Request(
        'https://portfolio.test/units/10000000-0000-4000-8000-000000000002/tenancies',
      ),
      inspectorIdentity,
    );
    expect(read.status).toBe(200);

    const write = await handler(
      new Request(
        'https://portfolio.test/units/10000000-0000-4000-8000-000000000002/tenancies',
        {
          method: 'POST',
          body: JSON.stringify({ code: 'TEN-NOPE' }),
        },
      ),
      inspectorIdentity,
    );

    expect(write.status).toBe(403);
  });
});
