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

  const handler = createPortfolioHttpHandler({
    assetRepository: new InMemoryAssetRepository(),
    assetInventoryRepository: new InMemoryAssetInventoryRepository(),
    assetServiceRepository: new InMemoryAssetServiceRepository(),
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
    ]),
  });

  return { handler, portfolioRepository, partyRepository, tenancyRepository };
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
