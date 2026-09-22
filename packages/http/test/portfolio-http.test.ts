import { describe, expect, it } from 'vitest';
import {
  type Actor,
  type ClockPort,
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
  asDocumentId,
  asDocumentLinkId,
  asDocumentVersionId,
  asLeaseAgreementId,
  asLeaseAmendmentId,
  asPropertyId,
  asTenancyId,
  asUnitId,
  asUserId,
  createPortfolioDashboard,
  createUnitReportingOverview,
  createUnitTimelineEvent,
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
import { testSha256 } from './hash-test-deps.js';
import { unusedPdfPort } from './pdf-test-deps.js';
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
import { InMemoryReportingRepository } from './reporting-test-deps.js';

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


class InMemoryTenancyRepository implements TenancyRepository {
  private readonly tenancies = new Map<TenancyId, Tenancy>();

  async getById(id: TenancyId): Promise<Tenancy | null> {
    return this.tenancies.get(id) ?? null;
  }

  async listByUnit(unitId: UnitId): Promise<readonly Tenancy[]> {
    return [...this.tenancies.values()].filter(
      (tenancy) => tenancy.unitId === unitId,
    );
  }

  async codeExists(code: string): Promise<boolean> {
    const normalized = code.toLowerCase();
    return [...this.tenancies.values()].some(
      (tenancy) => tenancy.code.toLowerCase() === normalized,
    );
  }

  async hasPlannedReservationOverlap() { return false; }
  async hasActualOccupancyOverlap() { return false; }

  async insert(tenancy: Tenancy): Promise<void> {
    this.tenancies.set(tenancy.id, tenancy);
  }

  async insertParty(
    tenancyParty: TenancyParty,
    expectedTenancyVersion: number,
    newTenancyVersion: number,
  ): Promise<void> {
    const current = this.tenancies.get(tenancyParty.tenancyId);
    if (!current || current.version !== expectedTenancyVersion) {
      throw new Error('tenancy version conflict');
    }
    this.tenancies.set(current.id, {
      ...current,
      version: newTenancyVersion,
      parties: [...current.parties, tenancyParty],
    });
  }

  async updateLifecycle(
    tenancy: Tenancy,
    expectedVersion: number,
  ): Promise<void> {
    const current = this.tenancies.get(tenancy.id);
    if (!current || current.version !== expectedVersion) {
      throw new Error('tenancy version conflict');
    }
    this.tenancies.set(tenancy.id, tenancy);
  }
}

class SequenceClock implements ClockPort {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  now(): string {
    const value = this.values[this.index++];
    if (!value) throw new Error('No test clock value configured.');
    return value;
  }
}

class EmptyLeaseRepository implements LeaseRepository {
  readonly agreements = new Map<LeaseAgreementId, LeaseAgreement>();
  readonly amendments = new Map<LeaseAmendmentId, LeaseAmendment>();

  async getAgreementById(id: LeaseAgreementId): Promise<LeaseAgreement | null> {
    return this.agreements.get(id) ?? null;
  }
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
  async getAmendmentById(id: LeaseAmendmentId): Promise<LeaseAmendment | null> {
    return this.amendments.get(id) ?? null;
  }
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
  clock: ClockPort = new FixedClock(),
  overrides: {
    readonly portfolioRepository?: InMemoryPortfolioRepository;
    readonly unitTimelineRepository?: InMemoryUnitTimelineRepository;
    readonly reportingRepository?: InMemoryReportingRepository;
    readonly leaseRepository?: EmptyLeaseRepository;
    readonly documentRepository?: InMemoryDocumentRepository;
    readonly fileStorage?: MemoryFileStorage;
  } = {},
) {
  return createPortfolioHttpHandler({
    accessItemRepository: new InMemoryAccessItemRepository(),
    meterRepository: new InMemoryMeterRepository(),
    unitTimelineRepository:
      overrides.unitTimelineRepository ?? new InMemoryUnitTimelineRepository(),
    reportingRepository:
      overrides.reportingRepository ?? new InMemoryReportingRepository(),
    assetRepository: new InMemoryAssetRepository(),
    assetInventoryRepository: new InMemoryAssetInventoryRepository(),
    assetServiceRepository: new InMemoryAssetServiceRepository(),
    improvementRepository: new InMemoryImprovementRepository(),
    costRepository: new InMemoryCostRepository(),
    maintenanceRepository: new InMemoryMaintenanceRepository(),
    portfolioRepository:
      overrides.portfolioRepository ?? new InMemoryPortfolioRepository(),
    partyRepository: new InMemoryPartyRepository(),
    ownershipRepository: new InMemoryOwnershipRepository(),
    tenancyRepository: new InMemoryTenancyRepository(),
    leaseRepository: overrides.leaseRepository ?? new EmptyLeaseRepository(),
    documentRepository:
      overrides.documentRepository ?? new InMemoryDocumentRepository(),
    inspectionRepository: new InMemoryInspectionRepository(),
    staffDirectoryRepository: new InMemoryStaffDirectoryRepository(),
    fileStorage: overrides.fileStorage ?? new MemoryFileStorage(),
    pdfPort: unusedPdfPort,
    sha256: testSha256,
    clock,
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

  it('returns deterministic Unit timeline ordering and filters projected events', async () => {
    const portfolioRepository = new InMemoryPortfolioRepository();
    const unitTimelineRepository = new InMemoryUnitTimelineRepository();
    const handler = buildHandler(
      [
        '71000000-0000-4000-8000-000000000001',
        '71000000-0000-4000-8000-000000000002',
      ],
      new FixedClock(),
      { portfolioRepository, unitTimelineRepository },
    );

    const propertyResponse = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...propertyBody,
          code: 'PROP-TIMELINE',
        }),
      }),
      adminIdentity,
    );
    const property = (await propertyResponse.json()).data;

    const unitResponse = await handler(
      new Request('https://portfolio.test/units', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId: property.id,
          code: 'UNIT-TIMELINE',
          unitNumber: 'TL-1',
          unitType: 'apartment',
        }),
      }),
      adminIdentity,
    );
    const unit = (await unitResponse.json()).data;
    const unitId = asUnitId(unit.id);

    unitTimelineRepository.events.push(
      createUnitTimelineEvent({
        eventKey: 'tenancy.started:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        unitId,
        category: 'tenancy',
        eventType: 'tenancy.started',
        precision: 'date',
        occurredOn: '2026-09-20',
        occurredAt: null,
        recordedAt: null,
        recordedByUserId: null,
        sourceType: 'tenancy',
        sourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        relatedEntityType: null,
        relatedEntityId: null,
        details: { code: 'TEN-TIMELINE' },
      }),
      createUnitTimelineEvent({
        eventKey: 'meter.reading:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        unitId,
        category: 'meter',
        eventType: 'meter.reading',
        precision: 'instant',
        occurredOn: '2026-09-20',
        occurredAt: '2026-09-20T12:00:00.000Z',
        recordedAt: '2026-09-20T12:05:00.000Z',
        recordedByUserId: asUserId(
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ),
        sourceType: 'meter_reading',
        sourceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        relatedEntityType: 'meter',
        relatedEntityId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
        details: { value: '100.000000', measurementUnit: 'kwh' },
      }),
      createUnitTimelineEvent({
        eventKey:
          'asset.condition_assessed:dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        unitId,
        category: 'asset',
        eventType: 'asset.condition_assessed',
        precision: 'instant',
        occurredOn: '2026-09-19',
        occurredAt: '2026-09-19T18:00:00.000Z',
        recordedAt: '2026-09-19T18:00:00.000Z',
        recordedByUserId: asUserId(
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ),
        sourceType: 'asset_condition_assessment',
        sourceId: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        relatedEntityType: 'asset',
        relatedEntityId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
        details: { condition: 'good' },
      }),
      createUnitTimelineEvent({
        eventKey: 'meter.reading:ffffffff-ffff-4fff-8fff-fffffffffff1',
        unitId: asUnitId('99999999-9999-4999-8999-999999999999'),
        category: 'meter',
        eventType: 'meter.reading',
        precision: 'instant',
        occurredOn: '2026-09-21',
        occurredAt: '2026-09-21T12:00:00.000Z',
        recordedAt: '2026-09-21T12:01:00.000Z',
        recordedByUserId: null,
        sourceType: 'meter_reading',
        sourceId: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
        relatedEntityType: 'meter',
        relatedEntityId: 'ffffffff-ffff-4fff-8fff-fffffffffff2',
        details: { value: '999.000000' },
      }),
    );

    const timeline = await handler(
      new Request(`https://portfolio.test/units/${unit.id}/timeline`),
      inspectorIdentity,
    );
    expect(timeline.status).toBe(200);
    expect(await timeline.json()).toMatchObject({
      data: {
        items: [
          {
            eventType: 'meter.reading',
            precision: 'instant',
            occurredOn: '2026-09-20',
          },
          {
            eventType: 'tenancy.started',
            precision: 'date',
            occurredOn: '2026-09-20',
            occurredAt: null,
          },
          {
            eventType: 'asset.condition_assessed',
            occurredOn: '2026-09-19',
          },
        ],
        limit: 100,
        offset: 0,
      },
    });

    const filtered = await handler(
      new Request(
        `https://portfolio.test/units/${unit.id}/timeline?category=meter&from=2026-09-20&to=2026-09-20&limit=1&offset=0`,
      ),
      inspectorIdentity,
    );
    expect(filtered.status).toBe(200);
    expect(await filtered.json()).toMatchObject({
      data: {
        items: [{ eventType: 'meter.reading' }],
        limit: 1,
        offset: 0,
      },
    });

    const invalidRange = await handler(
      new Request(
        `https://portfolio.test/units/${unit.id}/timeline?from=2026-09-21&to=2026-09-20`,
      ),
      inspectorIdentity,
    );
    expect(invalidRange.status).toBe(400);
  });

  it('requires explicit asOf and returns reporting projections to portfolio readers', async () => {
    const portfolioRepository = new InMemoryPortfolioRepository();
    const reportingRepository = new InMemoryReportingRepository();
    const handler = buildHandler(
      [
        '72000000-0000-4000-8000-000000000001',
        '72000000-0000-4000-8000-000000000002',
      ],
      new FixedClock(),
      { portfolioRepository, reportingRepository },
    );

    const propertyResponse = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        body: JSON.stringify({
          ...propertyBody,
          code: 'PROP-REPORTING',
          name: 'Reporting Property',
        }),
      }),
      adminIdentity,
    );
    expect(propertyResponse.status).toBe(201);

    const unitResponse = await handler(
      new Request('https://portfolio.test/units', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: '72000000-0000-4000-8000-000000000001',
          code: 'UNIT-REPORTING',
          unitNumber: 'R-1',
          unitType: 'apartment',
          areaM2: 55,
          rooms: 2,
        }),
      }),
      adminIdentity,
    );
    expect(unitResponse.status).toBe(201);

    const propertyId = asPropertyId(
      '72000000-0000-4000-8000-000000000001',
    );
    const unitId = asUnitId(
      '72000000-0000-4000-8000-000000000002',
    );

    reportingRepository.unitOverviews.set(
      unitId,
      createUnitReportingOverview({
        asOf: '2026-09-21',
        unitId,
        propertyId,
        propertyCode: 'PROP-REPORTING',
        propertyName: 'Reporting Property',
        unitCode: 'UNIT-REPORTING',
        unitNumber: 'R-1',
        unitType: 'apartment',
        floor: null,
        areaM2: 55,
        rooms: 2,
        occupancyStatus: 'vacant',
        tenancy: null,
        contract: {
          coverageStatus: 'missing',
          currentDraftAgreementCount: 0,
          agreementId: null,
          agreementCode: null,
          agreementCurrentStatus: null,
          effectiveFrom: null,
          effectiveTo: null,
          signedAt: null,
          effectiveTerms: null,
        },
        currentOperations: {
          openMaintenanceIssueCount: 2,
          urgentMaintenanceIssueCount: 1,
          openMaintenanceWorkOrderCount: 1,
          locatedAssetCount: 3,
          activeAssetCount: 2,
          inactiveAssetCount: 1,
          activeServicePlanCount: 1,
          openWarrantyClaimCount: 0,
          activeMeterCount: 1,
        },
        unitAttributedCostsByCurrency: [
          {
            currency: 'CHF',
            capex: '100.00',
            opex: '25.50',
            unclassified: '0.00',
            total: '125.50',
          },
        ],
      }),
    );

    reportingRepository.dashboard = createPortfolioDashboard({
      asOf: '2026-09-21',
      propertyCount: 1,
      unitCount: 1,
      occupiedUnitCount: 0,
      plannedUnitCount: 0,
      vacantUnitCount: 1,
      currentOperations: {
        openMaintenanceIssueCount: 2,
        urgentMaintenanceIssueCount: 1,
        openMaintenanceWorkOrderCount: 1,
        locatedAssetCount: 3,
        activeAssetCount: 2,
        inactiveAssetCount: 1,
        activeServicePlanCount: 1,
        openWarrantyClaimCount: 0,
        activeMeterCount: 1,
      },
      portfolioCostsByCurrency: [
        {
          currency: 'CHF',
          capex: '100.00',
          opex: '25.50',
          unclassified: '0.00',
          total: '125.50',
        },
      ],
      properties: [
        {
          propertyId,
          propertyCode: 'PROP-REPORTING',
          propertyName: 'Reporting Property',
          unitCount: 1,
          occupiedUnitCount: 0,
          plannedUnitCount: 0,
          vacantUnitCount: 1,
          currentOpenMaintenanceIssueCount: 2,
          currentUrgentMaintenanceIssueCount: 1,
          currentLocatedAssetCount: 3,
          currentActiveAssetCount: 2,
          currentActiveMeterCount: 1,
        },
      ],
    });

    const missingAsOf = await handler(
      new Request(
        'https://portfolio.test/units/72000000-0000-4000-8000-000000000002/overview',
      ),
      inspectorIdentity,
    );
    expect(missingAsOf.status).toBe(400);

    const overview = await handler(
      new Request(
        'https://portfolio.test/units/72000000-0000-4000-8000-000000000002/overview?asOf=2026-09-21',
      ),
      inspectorIdentity,
    );
    expect(overview.status).toBe(200);
    expect(reportingRepository.lastUnitAsOf).toBe('2026-09-21');
    expect(await overview.json()).toMatchObject({
      data: {
        asOf: '2026-09-21',
        occupancyStatus: 'vacant',
        currentOperations: {
          openMaintenanceIssueCount: 2,
          urgentMaintenanceIssueCount: 1,
        },
        unitAttributedCostsByCurrency: [
          {
            currency: 'CHF',
            total: '125.50',
          },
        ],
      },
    });

    const dashboard = await handler(
      new Request(
        'https://portfolio.test/reporting/dashboard?asOf=2026-09-21',
      ),
      inspectorIdentity,
    );
    expect(dashboard.status).toBe(200);
    expect(reportingRepository.lastDashboardAsOf).toBe('2026-09-21');
    expect(await dashboard.json()).toMatchObject({
      data: {
        asOf: '2026-09-21',
        propertyCount: 1,
        unitCount: 1,
        vacantUnitCount: 1,
        portfolioCostsByCurrency: [
          {
            currency: 'CHF',
            total: '125.50',
          },
        ],
        properties: [
          {
            propertyCode: 'PROP-REPORTING',
            vacantUnitCount: 1,
          },
        ],
      },
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
      'd1000000-0000-4000-8000-000000000010',
      'd1000000-0000-4000-8000-000000000011',
      'd1000000-0000-4000-8000-000000000012',
      'd1000000-0000-4000-8000-000000000013',
      'd1000000-0000-4000-8000-000000000014',
      'd1000000-0000-4000-8000-000000000015',
      'd1000000-0000-4000-8000-000000000016',
      'd1000000-0000-4000-8000-000000000017',
      'd1000000-0000-4000-8000-000000000018',
    ], new SequenceClock([
      '2026-09-18T20:00:00.000Z',
      '2026-09-18T20:05:00.000Z',
      '2026-09-18T21:00:00.000Z',
    ]));

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
          propertyId: null,
          unitId: null,
          spaceId: null,
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

    const predecessorHistoryResponse = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/location-history`),
      inspectorIdentity,
    );
    expect(predecessorHistoryResponse.status).toBe(200);
    const predecessorHistory =
      (await predecessorHistoryResponse.json()).data.items;
    expect(predecessorHistory).toHaveLength(1);
    expect(predecessorHistory[0].validTo).not.toBeNull();
  });

  it('runs Asset history, movement, condition and tenancy inventory through HTTP', async () => {
    const handler = buildHandler(
      [
        'e3000000-0000-4000-8000-000000000001',
        'e3000000-0000-4000-8000-000000000002',
        'e3000000-0000-4000-8000-000000000003',
        'e3000000-0000-4000-8000-000000000004',
        'e3000000-0000-4000-8000-000000000005',
        'e3000000-0000-4000-8000-000000000006',
        'e3000000-0000-4000-8000-000000000007',
        'e3000000-0000-4000-8000-000000000008',
        'e3000000-0000-4000-8000-000000000009',
        'e3000000-0000-4000-8000-000000000010',
        'e3000000-0000-4000-8000-000000000011',
        'e3000000-0000-4000-8000-000000000012',
        'e3000000-0000-4000-8000-000000000013',
        'e3000000-0000-4000-8000-000000000014',
        'e3000000-0000-4000-8000-000000000015',
        'e3000000-0000-4000-8000-000000000016',
        'e3000000-0000-4000-8000-000000000017',
        'e3000000-0000-4000-8000-000000000018',
        'e3000000-0000-4000-8000-000000000019',
        'e3000000-0000-4000-8000-000000000020',
        'e3000000-0000-4000-8000-000000000021',
        'e3000000-0000-4000-8000-000000000022',
        'e3000000-0000-4000-8000-000000000023',
        'e3000000-0000-4000-8000-000000000024',
      ],
      new SequenceClock([
        '2026-09-19T08:00:00.000Z',
        '2026-09-19T08:10:00.000Z',
        '2026-09-19T08:20:00.000Z',
        '2026-09-19T08:30:00.000Z',
        '2026-09-19T09:00:00.000Z',
        '2026-09-19T10:00:00.000Z',
      ]),
    );

    const propertyResponse = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...propertyBody,
          code: 'PROP-HISTORY-HTTP',
        }),
      }),
      adminIdentity,
    );
    expect(propertyResponse.status).toBe(201);
    const property = (await propertyResponse.json()).data;

    const createUnit = async (code: string, unitNumber: string) => {
      const response = await handler(
        new Request('https://portfolio.test/units', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            propertyId: property.id,
            code,
            unitNumber,
            unitType: 'apartment',
          }),
        }),
        adminIdentity,
      );
      expect(response.status).toBe(201);
      return (await response.json()).data;
    };

    const unitA = await createUnit('UNIT-HISTORY-HTTP-A', 'HA');
    const unitB = await createUnit('UNIT-HISTORY-HTTP-B', 'HB');

    const createSpace = async (unitId: string, code: string, name: string) => {
      const response = await handler(
        new Request('https://portfolio.test/spaces', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            unitId,
            code,
            name,
            spaceType: 'kitchen',
          }),
        }),
        adminIdentity,
      );
      expect(response.status).toBe(201);
      return (await response.json()).data;
    };

    const spaceA = await createSpace(unitA.id, 'KITCHEN-A', 'Kitchen A');
    const spaceB = await createSpace(unitB.id, 'KITCHEN-B', 'Kitchen B');

    const tenantResponse = await handler(
      new Request('https://portfolio.test/parties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'PTY-HISTORY-HTTP',
          partyType: 'person',
          firstName: 'HTTP',
          lastName: 'Tenant',
        }),
      }),
      adminIdentity,
    );
    expect(tenantResponse.status).toBe(201);
    const tenant = (await tenantResponse.json()).data;

    const tenancyResponse = await handler(
      new Request(`https://portfolio.test/units/${unitA.id}/tenancies`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'TEN-HISTORY-HTTP',
          parties: [
            {
              partyId: tenant.id,
              role: 'tenant',
              isPrimary: true,
            },
          ],
        }),
      }),
      adminIdentity,
    );
    expect(tenancyResponse.status).toBe(201);
    const tenancy = (await tenancyResponse.json()).data;

    const assetResponse = await handler(
      new Request('https://portfolio.test/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'ASSET-HISTORY-HTTP',
          name: 'Movable refrigerator',
          propertyId: property.id,
          unitId: unitA.id,
          spaceId: spaceA.id,
        }),
      }),
      adminIdentity,
    );
    expect(assetResponse.status).toBe(201);
    const asset = (await assetResponse.json()).data;

    const initialHistoryResponse = await handler(
      new Request(
        `https://portfolio.test/assets/${asset.id}/location-history`,
      ),
      inspectorIdentity,
    );
    expect(initialHistoryResponse.status).toBe(200);
    expect(await initialHistoryResponse.json()).toMatchObject({
      data: {
        items: [
          {
            assetId: asset.id,
            unitId: unitA.id,
            spaceId: spaceA.id,
            validTo: null,
            changeType: 'asset_created',
          },
        ],
      },
    });

    const conditionResponse = await handler(
      new Request(
        `https://portfolio.test/assets/${asset.id}/condition-assessments`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            condition: 'good',
            notes: 'General condition',
          }),
        },
      ),
      adminIdentity,
    );
    expect(conditionResponse.status).toBe(201);

    const assignmentResponse = await handler(
      new Request(`https://portfolio.test/tenancies/${tenancy.id}/assets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id }),
      }),
      adminIdentity,
    );
    expect(assignmentResponse.status).toBe(201);
    const assignment = (await assignmentResponse.json()).data;

    const draftMoveInResponse = await handler(
      new Request(
        `https://portfolio.test/tenancy-assets/${assignment.id}/inventory`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: 1,
            phase: 'move_in',
            presence: 'present',
          }),
        },
      ),
      adminIdentity,
    );
    expect(draftMoveInResponse.status).toBe(422);
    expect(await draftMoveInResponse.json()).toMatchObject({
      error: { code: 'TENANCY_ASSET_TENANCY_STATE_INVALID' },
    });

    const planResponse = await handler(
      new Request(`https://portfolio.test/tenancies/${tenancy.id}/plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 1,
          plannedStart: '2026-09-20',
          plannedEnd: '2027-09-19',
        }),
      }),
      adminIdentity,
    );
    expect(planResponse.status).toBe(200);

    const moveInResponse = await handler(
      new Request(
        `https://portfolio.test/tenancy-assets/${assignment.id}/inventory`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: 1,
            phase: 'move_in',
            presence: 'present',
            condition: 'good',
            notes: 'Present at move-in',
          }),
        },
      ),
      adminIdentity,
    );
    expect(moveInResponse.status).toBe(200);
    expect(await moveInResponse.json()).toMatchObject({
      data: { version: 2, moveIn: { presence: 'present' } },
    });

    const activateResponse = await handler(
      new Request(`https://portfolio.test/tenancies/${tenancy.id}/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 2,
          actualStart: '2026-09-20',
        }),
      }),
      adminIdentity,
    );
    expect(activateResponse.status).toBe(200);

    const movedResponse = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 1,
          propertyId: property.id,
          unitId: unitB.id,
          spaceId: spaceB.id,
          reason: 'Transferred to Unit B',
        }),
      }),
      adminIdentity,
    );
    expect(movedResponse.status).toBe(200);
    expect(await movedResponse.json()).toMatchObject({
      data: {
        id: asset.id,
        version: 2,
        unitId: unitB.id,
        spaceId: spaceB.id,
      },
    });

    const movedHistoryResponse = await handler(
      new Request(
        `https://portfolio.test/assets/${asset.id}/location-history`,
      ),
      inspectorIdentity,
    );
    expect(movedHistoryResponse.status).toBe(200);
    const movedHistory = (await movedHistoryResponse.json()).data.items;
    expect(movedHistory).toHaveLength(2);
    expect(movedHistory[0]).toMatchObject({
      unitId: unitA.id,
      spaceId: spaceA.id,
      validTo: '2026-09-19T09:00:00.000Z',
    });
    expect(movedHistory[1]).toMatchObject({
      unitId: unitB.id,
      spaceId: spaceB.id,
      validTo: null,
      changeType: 'moved',
    });

    const moveOutResponse = await handler(
      new Request(
        `https://portfolio.test/tenancy-assets/${assignment.id}/inventory`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: 2,
            phase: 'move_out',
            presence: 'missing',
            notes: 'Not present at handover',
          }),
        },
      ),
      adminIdentity,
    );
    expect(moveOutResponse.status).toBe(200);
    expect(await moveOutResponse.json()).toMatchObject({
      data: {
        version: 3,
        moveIn: { presence: 'present' },
        moveOut: { presence: 'missing', conditionAssessmentId: null },
      },
    });

    const inventoryResponse = await handler(
      new Request(`https://portfolio.test/tenancies/${tenancy.id}/assets`),
      inspectorIdentity,
    );
    expect(inventoryResponse.status).toBe(200);
    expect(await inventoryResponse.json()).toMatchObject({
      data: {
        items: [
          {
            assetId: asset.id,
            version: 3,
            moveIn: { presence: 'present' },
            moveOut: { presence: 'missing' },
          },
        ],
      },
    });

    const conditionsResponse = await handler(
      new Request(
        `https://portfolio.test/assets/${asset.id}/condition-assessments`,
      ),
      inspectorIdentity,
    );
    expect(conditionsResponse.status).toBe(200);
    expect((await conditionsResponse.json()).data.items).toHaveLength(2);
  });

  it('runs Warranty, Claim, ServicePlan and ServiceEvent through HTTP', async () => {
    const handler = buildHandler(
      [
        'fa000000-0000-4000-8000-000000000001',
        'fa000000-0000-4000-8000-000000000002',
        'fa000000-0000-4000-8000-000000000003',
        'fa000000-0000-4000-8000-000000000004',
        'fa000000-0000-4000-8000-000000000005',
        'fa000000-0000-4000-8000-000000000006',
        'fa000000-0000-4000-8000-000000000007',
        'fa000000-0000-4000-8000-000000000008',
        'fa000000-0000-4000-8000-000000000009',
        'fa000000-0000-4000-8000-000000000010',
        'fa000000-0000-4000-8000-000000000011',
        'fa000000-0000-4000-8000-000000000012',
        'fa000000-0000-4000-8000-000000000013',
        'fa000000-0000-4000-8000-000000000014',
      ],
      new SequenceClock([
        '2026-09-19T08:00:00.000Z',
        '2026-09-19T08:05:00.000Z',
        '2026-09-19T08:10:00.000Z',
        '2026-09-19T08:15:00.000Z',
        '2026-09-19T08:20:00.000Z',
        '2026-09-19T08:25:00.000Z',
        '2026-09-19T08:30:00.000Z',
        '2026-09-19T08:35:00.000Z',
      ]),
    );

    const propertyResponse = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        body: JSON.stringify({
          ...propertyBody,
          code: 'PROP-SERVICE-HTTP',
        }),
      }),
      adminIdentity,
    );
    const property = (await propertyResponse.json()).data;

    const unitResponse = await handler(
      new Request('https://portfolio.test/units', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: property.id,
          code: 'UNIT-SERVICE-HTTP',
          unitNumber: 'S1',
          unitType: 'apartment',
        }),
      }),
      adminIdentity,
    );
    const unit = (await unitResponse.json()).data;

    const providerResponse = await handler(
      new Request('https://portfolio.test/parties', {
        method: 'POST',
        body: JSON.stringify({
          code: 'PTY-SERVICE-PROVIDER',
          partyType: 'company',
          legalName: 'Service Provider d.o.o.',
        }),
      }),
      adminIdentity,
    );
    const provider = (await providerResponse.json()).data;

    const assetResponse = await handler(
      new Request('https://portfolio.test/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'ASSET-SERVICE-HTTP',
          name: 'Heat pump',
          propertyId: property.id,
          unitId: unit.id,
        }),
      }),
      adminIdentity,
    );
    expect(assetResponse.status).toBe(201);
    const asset = (await assetResponse.json()).data;

    const warrantyResponse = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/warranties`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          warrantyType: 'manufacturer',
          providerPartyId: provider.id,
          reference: 'WR-HTTP-1',
          validFrom: '2026-01-01',
          validTo: '2027-12-31',
          terms: 'Compressor and electronics',
        }),
      }),
      adminIdentity,
    );
    expect(warrantyResponse.status).toBe(201);
    const warranty = (await warrantyResponse.json()).data;

    const inspectorWarranties = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/warranties`),
      inspectorIdentity,
    );
    expect(inspectorWarranties.status).toBe(200);
    expect(await inspectorWarranties.json()).toMatchObject({
      data: { items: [{ id: warranty.id, assetId: asset.id }] },
    });

    const claimResponse = await handler(
      new Request(`https://portfolio.test/warranties/${warranty.id}/claims`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          incidentOn: '2026-09-01',
          description: 'Compressor stopped',
        }),
      }),
      adminIdentity,
    );
    expect(claimResponse.status).toBe(201);
    const claim = (await claimResponse.json()).data;
    expect(claim).toMatchObject({
      status: 'draft',
      recordedAt: '2026-09-19T08:10:00.000Z',
      version: 1,
    });

    const submitted = await handler(
      new Request(`https://portfolio.test/warranty-claims/${claim.id}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 1,
          providerReference: 'CASE-HTTP-77',
        }),
      }),
      adminIdentity,
    );
    expect(submitted.status).toBe(200);

    const resolved = await handler(
      new Request(`https://portfolio.test/warranty-claims/${claim.id}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 2,
          decision: 'approved',
        }),
      }),
      adminIdentity,
    );
    expect(resolved.status).toBe(200);

    const closed = await handler(
      new Request(`https://portfolio.test/warranty-claims/${claim.id}/close`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 3 }),
      }),
      adminIdentity,
    );
    expect(closed.status).toBe(200);
    expect(await closed.json()).toMatchObject({
      data: {
        status: 'closed',
        version: 4,
        providerReference: 'CASE-HTTP-77',
      },
    });

    const planResponse = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/service-plans`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Annual service',
          scheduleKind: 'recurring',
          firstDueOn: '2027-09-01',
          intervalMonths: 12,
          providerPartyId: provider.id,
        }),
      }),
      adminIdentity,
    );
    expect(planResponse.status).toBe(201);
    const plan = (await planResponse.json()).data;

    const paused = await handler(
      new Request(`https://portfolio.test/service-plans/${plan.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 1, status: 'paused' }),
      }),
      adminIdentity,
    );
    expect(paused.status).toBe(200);

    const resumed = await handler(
      new Request(`https://portfolio.test/service-plans/${plan.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 2, status: 'active' }),
      }),
      adminIdentity,
    );
    expect(resumed.status).toBe(200);

    const eventResponse = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/service-events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          servicePlanId: plan.id,
          warrantyClaimId: claim.id,
          eventType: 'warranty_service',
          performedAt: '2026-09-10T10:00:00.000Z',
          providerPartyId: provider.id,
          description: 'Compressor replaced under warranty',
          reference: 'SRV-HTTP-1',
          parts: [
            {
              name: 'Compressor',
              partNumber: 'CMP-9000',
              serialNumber: 'CMP-SN-1',
              quantity: 1,
            },
          ],
        }),
      }),
      adminIdentity,
    );
    expect(eventResponse.status).toBe(201);
    expect(await eventResponse.json()).toMatchObject({
      data: {
        assetId: asset.id,
        servicePlanId: plan.id,
        warrantyClaimId: claim.id,
        eventType: 'warranty_service',
        performedAt: '2026-09-10T10:00:00.000Z',
        recordedAt: '2026-09-19T08:35:00.000Z',
        parts: [{ name: 'Compressor', quantity: 1 }],
      },
    });

    const listedEvents = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/service-events`),
      inspectorIdentity,
    );
    expect(listedEvents.status).toBe(200);
    expect((await listedEvents.json()).data.items).toHaveLength(1);

    const inspectorWrite = await handler(
      new Request(`https://portfolio.test/assets/${asset.id}/service-plans`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Forbidden plan',
          scheduleKind: 'one_time',
          firstDueOn: '2027-01-01',
        }),
      }),
      inspectorIdentity,
    );
    expect(inspectorWrite.status).toBe(403);
  });

  it('runs ImprovementProject, WorkItem and sealed work evidence through HTTP', async () => {
    const handler = buildHandler(
      [
        'fd000000-0000-4000-8000-000000000001',
        'fd000000-0000-4000-8000-000000000002',
        'fd000000-0000-4000-8000-000000000003',
        'fd000000-0000-4000-8000-000000000004',
        'fd000000-0000-4000-8000-000000000005',
        'fd000000-0000-4000-8000-000000000006',
        'fd000000-0000-4000-8000-000000000007',
        'fd000000-0000-4000-8000-000000000008',
        'fd000000-0000-4000-8000-000000000009',
        'fd000000-0000-4000-8000-000000000010',
        'fd000000-0000-4000-8000-000000000011',
        'fd000000-0000-4000-8000-000000000012',
        'fd000000-0000-4000-8000-000000000013',
      ],
      new SequenceClock([
        '2026-09-19T10:00:00.000Z',
        '2026-09-19T10:05:00.000Z',
        '2026-09-20T08:00:00.000Z',
        '2026-10-01T08:00:00.000Z',
        '2026-10-01T08:05:00.000Z',
        '2026-10-01T09:00:00.000Z',
        '2026-10-03T09:00:00.000Z',
        '2026-10-03T10:00:00.000Z',
        '2026-10-03T11:00:00.000Z',
      ]),
    );

    const propertyResponse = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...propertyBody,
          code: 'PROP-IMPROVEMENT-HTTP',
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
          code: 'UNIT-IMPROVEMENT-HTTP',
          unitNumber: 'I1',
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
          code: 'KITCHEN-IMPROVEMENT-HTTP',
          name: 'Kitchen',
          spaceType: 'kitchen',
        }),
      }),
      adminIdentity,
    );
    expect(spaceResponse.status).toBe(201);
    const space = (await spaceResponse.json()).data;

    const contractorResponse = await handler(
      new Request('https://portfolio.test/parties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'PTY-IMPROVEMENT-CONTRACTOR',
          partyType: 'company',
          legalName: 'Renovation Contractor d.o.o.',
        }),
      }),
      adminIdentity,
    );
    expect(contractorResponse.status).toBe(201);
    const contractor = (await contractorResponse.json()).data;

    const assetResponse = await handler(
      new Request('https://portfolio.test/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'ASSET-IMPROVEMENT-HTTP',
          name: 'Built-in oven',
          propertyId: property.id,
          unitId: unit.id,
          spaceId: space.id,
        }),
      }),
      adminIdentity,
    );
    expect(assetResponse.status).toBe(201);
    const asset = (await assetResponse.json()).data;

    const projectResponse = await handler(
      new Request('https://portfolio.test/improvement-projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'IMP-HTTP-001',
          name: 'Kitchen renovation',
          description: 'Replace cabinetry and finishes',
          propertyId: property.id,
          unitId: unit.id,
          spaceId: space.id,
          plannedStartOn: '2026-10-01',
          plannedEndOn: '2026-10-31',
        }),
      }),
      adminIdentity,
    );
    expect(projectResponse.status).toBe(201);
    const project = (await projectResponse.json()).data;
    expect(project).toMatchObject({ status: 'draft', version: 1 });

    const planResponse = await handler(
      new Request(
        `https://portfolio.test/improvement-projects/${project.id}/status`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedVersion: 1, action: 'plan' }),
        },
      ),
      adminIdentity,
    );
    expect(planResponse.status).toBe(200);

    const startProjectResponse = await handler(
      new Request(
        `https://portfolio.test/improvement-projects/${project.id}/status`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedVersion: 2, action: 'start' }),
        },
      ),
      adminIdentity,
    );
    expect(startProjectResponse.status).toBe(200);

    const itemResponse = await handler(
      new Request(
        `https://portfolio.test/improvement-projects/${project.id}/work-items`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code: 'WI-01',
            title: 'Install new cabinetry',
          }),
        },
      ),
      adminIdentity,
    );
    expect(itemResponse.status).toBe(201);
    const item = (await itemResponse.json()).data;

    const correctItemResponse = await handler(
      new Request(`https://portfolio.test/work-items/${item.id}/plan`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 1,
          title: 'Install cabinetry',
          description: 'Corrected planned scope',
        }),
      }),
      adminIdentity,
    );
    expect(correctItemResponse.status).toBe(200);
    expect(await correctItemResponse.json()).toMatchObject({
      data: {
        title: 'Install cabinetry',
        description: 'Corrected planned scope',
        version: 2,
      },
    });

    const startItemResponse = await handler(
      new Request(`https://portfolio.test/work-items/${item.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 2, action: 'start' }),
      }),
      adminIdentity,
    );
    expect(startItemResponse.status).toBe(200);

    const recordResponse = await handler(
      new Request(
        `https://portfolio.test/work-items/${item.id}/work-records`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            performedAt: '2026-10-02T14:00:00.000Z',
            contractorPartyId: contractor.id,
            description: 'Installed cabinet carcasses and oven surround',
            reference: 'SITE-DIARY-17',
            materials: [
              {
                name: 'Moisture-resistant board',
                quantity: '12.5',
                unit: 'm2',
              },
            ],
            assets: [
              {
                assetId: asset.id,
                action: 'affected',
                notes: 'Oven surround adjusted around existing Asset',
              },
            ],
          }),
        },
      ),
      adminIdentity,
    );
    expect(recordResponse.status).toBe(201);
    expect(await recordResponse.json()).toMatchObject({
      data: {
        projectId: project.id,
        workItemId: item.id,
        contractorPartyId: contractor.id,
        performedAt: '2026-10-02T14:00:00.000Z',
        recordedAt: '2026-10-03T09:00:00.000Z',
        materials: [{ quantity: '12.5', unit: 'm2' }],
        assets: [{ assetId: asset.id, action: 'affected' }],
      },
    });

    const completeItemResponse = await handler(
      new Request(`https://portfolio.test/work-items/${item.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 3, action: 'complete' }),
      }),
      adminIdentity,
    );
    expect(completeItemResponse.status).toBe(200);

    const completeProjectResponse = await handler(
      new Request(
        `https://portfolio.test/improvement-projects/${project.id}/status`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedVersion: 3, action: 'complete' }),
        },
      ),
      adminIdentity,
    );
    expect(completeProjectResponse.status).toBe(200);
    expect(await completeProjectResponse.json()).toMatchObject({
      data: { status: 'completed', version: 4 },
    });

    const inspectorRecords = await handler(
      new Request(
        `https://portfolio.test/improvement-projects/${project.id}/work-records`,
      ),
      inspectorIdentity,
    );
    expect(inspectorRecords.status).toBe(200);
    expect((await inspectorRecords.json()).data.items).toHaveLength(1);

    const inspectorWrite = await handler(
      new Request('https://portfolio.test/improvement-projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'IMP-FORBIDDEN',
          name: 'Forbidden',
          propertyId: property.id,
        }),
      }),
      inspectorIdentity,
    );
    expect(inspectorWrite.status).toBe(403);
  });

  it('runs append-only Cost creation and correction through HTTP', async () => {
    const handler = buildHandler(
      [
        'ac000000-0000-4000-8000-000000000001',
        'ac000000-0000-4000-8000-000000000002',
        'ac000000-0000-4000-8000-000000000003',
        'ac000000-0000-4000-8000-000000000004',
        'ac000000-0000-4000-8000-000000000005',
      ],
      new SequenceClock([
        '2026-09-19T10:00:00.000Z',
        '2026-09-19T11:00:00.000Z',
      ]),
    );

    const propertyResponse = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...propertyBody,
          code: 'PROP-COST-HTTP',
        }),
      }),
      adminIdentity,
    );
    expect(propertyResponse.status).toBe(201);
    const property = (await propertyResponse.json()).data;

    const supplierResponse = await handler(
      new Request('https://portfolio.test/parties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'PTY-COST-SUPPLIER',
          partyType: 'company',
          legalName: 'Cost Supplier d.o.o.',
        }),
      }),
      adminIdentity,
    );
    expect(supplierResponse.status).toBe(201);
    const supplier = (await supplierResponse.json()).data;

    const createdResponse = await handler(
      new Request('https://portfolio.test/costs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: {
            kind: 'property',
            propertyId: property.id,
          },
          description: 'Roof repair allocation',
          amount: '1200.5',
          currency: 'chf',
          incurredOn: '2026-09-18',
          reportingClass: 'capex',
          supplierPartyId: supplier.id,
          invoiceReference: 'INV-HTTP-77',
        }),
      }),
      adminIdentity,
    );
    expect(createdResponse.status).toBe(201);
    const original = (await createdResponse.json()).data;
    expect(original).toMatchObject({
      source: { kind: 'property', propertyId: property.id },
      amount: '1200.50',
      currency: 'CHF',
      reportingClass: 'capex',
      supplierPartyId: supplier.id,
      invoiceReference: 'INV-HTTP-77',
      recordedAt: '2026-09-19T10:00:00.000Z',
    });

    const unsupportedCurrencyResponse = await handler(
      new Request('https://portfolio.test/costs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: { kind: 'property', propertyId: property.id },
          description: 'Unsupported currency',
          amount: '10',
          currency: 'ZZZ',
          incurredOn: '2026-09-18',
          reportingClass: 'opex',
        }),
      }),
      adminIdentity,
    );
    expect(unsupportedCurrencyResponse.status).toBe(400);

    const sourceList = await handler(
      new Request(
        `https://portfolio.test/costs?sourceKind=property&sourceId=${property.id}`,
      ),
      adminIdentity,
    );
    expect(sourceList.status).toBe(200);
    expect(await sourceList.json()).toMatchObject({
      data: {
        items: [
          {
            cost: { id: original.id, amount: '1200.50' },
            reversal: null,
          },
        ],
      },
    });

    const invoiceList = await handler(
      new Request(
        'https://portfolio.test/costs?invoiceReference=INV-HTTP-77',
      ),
      adminIdentity,
    );
    expect(invoiceList.status).toBe(200);
    expect((await invoiceList.json()).data.items).toHaveLength(1);

    const correctionResponse = await handler(
      new Request(`https://portfolio.test/costs/${original.id}/correct`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason: 'Supplier corrected invoice total',
          replacement: {
            source: {
              kind: 'property',
              propertyId: property.id,
            },
            description: 'Roof repair allocation',
            amount: '1150',
            currency: 'CHF',
            incurredOn: '2026-09-18',
            reportingClass: 'capex',
            supplierPartyId: supplier.id,
            invoiceReference: 'INV-HTTP-77',
          },
        }),
      }),
      adminIdentity,
    );
    expect(correctionResponse.status).toBe(201);
    const correction = (await correctionResponse.json()).data;
    expect(correction).toMatchObject({
      replacement: {
        amount: '1150.00',
        recordedAt: '2026-09-19T11:00:00.000Z',
      },
      reversal: {
        costId: original.id,
        replacementCostId: correction.replacement.id,
        reason: 'Supplier corrected invoice total',
        recordedAt: '2026-09-19T11:00:00.000Z',
      },
    });

    const originalHistory = await handler(
      new Request(`https://portfolio.test/costs/${original.id}`),
      adminIdentity,
    );
    expect(originalHistory.status).toBe(200);
    expect(await originalHistory.json()).toMatchObject({
      data: {
        cost: { id: original.id, amount: '1200.50' },
        reversal: {
          replacementCostId: correction.replacement.id,
        },
        incomingCorrection: null,
      },
    });

    const replacementHistory = await handler(
      new Request(
        `https://portfolio.test/costs/${correction.replacement.id}`,
      ),
      adminIdentity,
    );
    expect(replacementHistory.status).toBe(200);
    expect(await replacementHistory.json()).toMatchObject({
      data: {
        cost: { id: correction.replacement.id, amount: '1150.00' },
        reversal: null,
        incomingCorrection: {
          costId: original.id,
          replacementCostId: correction.replacement.id,
        },
      },
    });

    const inspectorRead = await handler(
      new Request(`https://portfolio.test/costs/${original.id}`),
      inspectorIdentity,
    );
    expect(inspectorRead.status).toBe(403);

    const inspectorWrite = await handler(
      new Request('https://portfolio.test/costs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: { kind: 'property', propertyId: property.id },
          description: 'Forbidden financial write',
          amount: '10',
          currency: 'CHF',
          incurredOn: '2026-09-19',
          reportingClass: 'opex',
        }),
      }),
      inspectorIdentity,
    );
    expect(inspectorWrite.status).toBe(403);
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
        accessItemRepository: new InMemoryAccessItemRepository(),
    meterRepository: new InMemoryMeterRepository(),
    unitTimelineRepository: new InMemoryUnitTimelineRepository(),
    reportingRepository: new InMemoryReportingRepository(),
        assetRepository: new InMemoryAssetRepository(),
    assetInventoryRepository: new InMemoryAssetInventoryRepository(),
        assetServiceRepository: new InMemoryAssetServiceRepository(),
        improvementRepository: new InMemoryImprovementRepository(),
    costRepository: new InMemoryCostRepository(),
        maintenanceRepository: new InMemoryMaintenanceRepository(),
        portfolioRepository: new InMemoryPortfolioRepository(),
        partyRepository: new InMemoryPartyRepository(),
        ownershipRepository: new InMemoryOwnershipRepository(),
        tenancyRepository: new InMemoryTenancyRepository(),
        leaseRepository: new EmptyLeaseRepository(),
        documentRepository: new InMemoryDocumentRepository(),
        inspectionRepository: new InMemoryInspectionRepository(),
        staffDirectoryRepository: new InMemoryStaffDirectoryRepository(),
        fileStorage: new MemoryFileStorage(),
        pdfPort: unusedPdfPort,
        sha256: testSha256,
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
        `https://portfolio.test/documents/${document.id}/versions?fileName=lease.pdf&expectedDocumentRevision=1`,
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

    const staleUpload = await handler(
      new Request(
        `https://portfolio.test/documents/${document.id}/versions?fileName=stale.pdf&expectedDocumentRevision=1`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/pdf' },
          body: new Uint8Array([9]),
        },
      ),
      adminIdentity,
    );
    expect(staleUpload.status).toBe(409);
    expect(await staleUpload.json()).toMatchObject({
      error: { code: 'DOCUMENT_VERSION_CONFLICT' },
    });

    const oversizedUpload = await handler(
      new Request(
        `https://portfolio.test/documents/${document.id}/versions?fileName=oversized.pdf&expectedDocumentRevision=2`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/pdf' },
          body: new Uint8Array(16 * 1024 * 1024 + 1),
        },
      ),
      adminIdentity,
    );
    expect(oversizedUpload.status).toBe(413);
    expect(await oversizedUpload.json()).toMatchObject({
      error: { code: 'DOCUMENT_BINARY_UPLOAD_LIMIT_EXCEEDED' },
    });

    const storedContent = await handler(
      new Request(
        `https://portfolio.test/document-versions/${version.id}/content`,
      ),
      inspectorIdentity,
    );
    expect(storedContent.status).toBe(200);
    expect(storedContent.headers.get('content-type')).toBe('application/pdf');
    expect(storedContent.headers.get('cache-control')).toBe('private, no-store');
    expect(storedContent.headers.get('x-content-type-options')).toBe('nosniff');
    expect(storedContent.headers.get('content-disposition')).toContain(
      'lease.pdf',
    );
    expect([...new Uint8Array(await storedContent.arrayBuffer())]).toEqual([
      1, 2, 3, 4,
    ]);

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


  it('runs Maintenance Issue -> WorkOrder -> Cost through HTTP', async () => {
    const propertyId = '91000000-0000-4000-8000-000000000001';
    const issueId = '91000000-0000-4000-8000-000000000002';
    const workOrderId = '91000000-0000-4000-8000-000000000003';
    const costId = '91000000-0000-4000-8000-000000000004';
    const handler = buildHandler([propertyId, issueId, workOrderId, costId]);

    const property = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        body: JSON.stringify({
          ...propertyBody,
          code: 'PROP-MAINT-HTTP',
          name: 'Maintenance HTTP Building',
        }),
      }),
      adminIdentity,
    );
    expect(property.status).toBe(201);

    const issueCreated = await handler(
      new Request('https://portfolio.test/maintenance-issues', {
        method: 'POST',
        body: JSON.stringify({
          code: 'MI-HTTP-1',
          propertyId,
          title: 'Heating failure',
          description: 'Boiler does not start.',
          priority: 'high',
        }),
      }),
      adminIdentity,
    );
    expect(issueCreated.status).toBe(201);
    expect(await issueCreated.clone().json()).toMatchObject({
      data: {
        id: issueId,
        propertyId,
        status: 'open',
        priority: 'high',
        version: 1,
      },
    });

    const workOrderCreated = await handler(
      new Request(
        `https://portfolio.test/maintenance-issues/${issueId}/work-orders`,
        {
          method: 'POST',
          body: JSON.stringify({
            code: 'MWO-HTTP-1',
            title: 'Diagnose and repair boiler',
          }),
        },
      ),
      adminIdentity,
    );
    expect(workOrderCreated.status).toBe(201);
    expect(await workOrderCreated.clone().json()).toMatchObject({
      data: {
        id: workOrderId,
        issueId,
        status: 'draft',
        version: 1,
      },
    });

    const assigned = await handler(
      new Request(
        `https://portfolio.test/maintenance-work-orders/${workOrderId}/assign`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion: 1,
            assignee: {
              kind: 'user',
              userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            },
          }),
        },
      ),
      adminIdentity,
    );
    expect(assigned.status).toBe(200);
    expect(await assigned.clone().json()).toMatchObject({
      data: { status: 'assigned', version: 2 },
    });

    const started = await handler(
      new Request(
        `https://portfolio.test/maintenance-work-orders/${workOrderId}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 2, action: 'start' }),
        },
      ),
      adminIdentity,
    );
    expect(started.status).toBe(200);
    expect(await started.clone().json()).toMatchObject({
      data: { status: 'in_progress', version: 3 },
    });

    const completed = await handler(
      new Request(
        `https://portfolio.test/maintenance-work-orders/${workOrderId}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 3, action: 'complete' }),
        },
      ),
      adminIdentity,
    );
    expect(completed.status).toBe(200);
    expect(await completed.clone().json()).toMatchObject({
      data: { status: 'completed', version: 4 },
    });

    const resolved = await handler(
      new Request(
        `https://portfolio.test/maintenance-issues/${issueId}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 1, action: 'resolve' }),
        },
      ),
      adminIdentity,
    );
    expect(resolved.status).toBe(200);
    expect(await resolved.clone().json()).toMatchObject({
      data: { status: 'resolved', version: 2 },
    });

    const costCreated = await handler(
      new Request('https://portfolio.test/costs', {
        method: 'POST',
        body: JSON.stringify({
          source: {
            kind: 'maintenance_work_order',
            maintenanceWorkOrderId: workOrderId,
          },
          description: 'Boiler repair allocation',
          amount: '125.50',
          currency: 'CHF',
          incurredOn: '2026-09-18',
          reportingClass: 'opex',
        }),
      }),
      adminIdentity,
    );
    expect(costCreated.status).toBe(201);
    expect(await costCreated.clone().json()).toMatchObject({
      data: {
        id: costId,
        source: {
          kind: 'maintenance_work_order',
          maintenanceWorkOrderId: workOrderId,
        },
        amount: '125.50',
      },
    });

    const costs = await handler(
      new Request(
        `https://portfolio.test/costs?sourceKind=maintenance_work_order&sourceId=${workOrderId}`,
      ),
      adminIdentity,
    );
    expect(costs.status).toBe(200);
    expect(await costs.clone().json()).toMatchObject({
      data: {
        items: [
          {
            cost: {
              id: costId,
              source: {
                kind: 'maintenance_work_order',
                maintenanceWorkOrderId: workOrderId,
              },
            },
          },
        ],
      },
    });

    const inspectorWrite = await handler(
      new Request('https://portfolio.test/maintenance-issues', {
        method: 'POST',
        body: JSON.stringify({
          code: 'MI-FORBIDDEN',
          propertyId,
          title: 'Forbidden maintenance write',
          priority: 'normal',
        }),
      }),
      inspectorIdentity,
    );
    expect(inspectorWrite.status).toBe(403);
  });

  it('returns Unit-scoped document links without leaking unrelated targets', async () => {
    const ids = [
      'a1000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000003',
      'a1000000-0000-4000-8000-000000000004',
      'a1000000-0000-4000-8000-000000000005',
      'a1000000-0000-4000-8000-000000000006',
      'a1000000-0000-4000-8000-000000000007',
    ];
    const handler = buildHandler(ids);

    const propertyResponse = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        body: JSON.stringify({
          ...propertyBody,
          code: 'PROP-UNIT-DOCS',
          name: 'Unit documents property',
        }),
      }),
      adminIdentity,
    );
    const property = (await propertyResponse.json()).data;

    const unitResponse = await handler(
      new Request('https://portfolio.test/units', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: property.id,
          code: 'UNIT-DOCS',
          unitNumber: 'D-1',
          unitType: 'apartment',
        }),
      }),
      adminIdentity,
    );
    const unit = (await unitResponse.json()).data;

    const documentResponse = await handler(
      new Request('https://portfolio.test/documents', {
        method: 'POST',
        body: JSON.stringify({
          code: 'DOC-UNIT-1',
          title: 'Unit handover photo set',
          category: 'photo',
        }),
      }),
      adminIdentity,
    );
    const document = (await documentResponse.json()).data;

    const versionResponse = await handler(
      new Request(
        `https://portfolio.test/documents/${document.id}/versions?fileName=handover.pdf`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/pdf' },
          body: new Uint8Array([1, 2, 3]),
        },
      ),
      adminIdentity,
    );
    const version = (await versionResponse.json()).data;

    const unitLink = await handler(
      new Request(`https://portfolio.test/documents/${document.id}/links`, {
        method: 'POST',
        body: JSON.stringify({
          documentVersionId: version.id,
          relation: 'supporting',
          targetType: 'unit',
          targetId: unit.id,
        }),
      }),
      adminIdentity,
    );
    expect(unitLink.status).toBe(201);

    const currentDocumentResponse = await handler(
      new Request(`https://portfolio.test/documents/${document.id}`),
      inspectorIdentity,
    );
    const currentDocument = (await currentDocumentResponse.json()).data;

    const unrelatedDocumentResponse = await handler(
      new Request('https://portfolio.test/documents', {
        method: 'POST',
        body: JSON.stringify({
          code: 'DOC-PROPERTY-ONLY',
          title: 'Property-only document',
          category: 'technical',
        }),
      }),
      adminIdentity,
    );
    const unrelatedDocument = (await unrelatedDocumentResponse.json()).data;

    const propertyLink = await handler(
      new Request(
        `https://portfolio.test/documents/${unrelatedDocument.id}/links`,
        {
          method: 'POST',
          body: JSON.stringify({
            relation: 'supporting',
            targetType: 'property',
            targetId: property.id,
          }),
        },
      ),
      adminIdentity,
    );
    expect(propertyLink.status).toBe(201);

    const listed = await handler(
      new Request(`https://portfolio.test/units/${unit.id}/documents`),
      inspectorIdentity,
    );

    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({
      data: {
        items: [
          {
            document: currentDocument,
            link: {
              id: ids[4],
              documentId: document.id,
              documentVersionId: version.id,
              relation: 'supporting',
              targetType: 'unit',
              targetId: unit.id,
            },
            linkedVersion: version,
          },
        ],
      },
    });

    const missing = await handler(
      new Request(
        'https://portfolio.test/units/a1000000-0000-4000-8000-000000000099/documents',
      ),
      inspectorIdentity,
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: 'UNIT_NOT_FOUND' },
    });
  });


  it('batch-resolves Party identities for lifecycle surfaces without N+1 reads', async () => {
    const handler = buildHandler([
      'd7a10000-0000-4000-8000-000000000001',
      'd7a10000-0000-4000-8000-000000000002',
    ]);

    const first = await handler(
      new Request('https://portfolio.test/parties', {
        method: 'POST',
        body: JSON.stringify({
          code: 'PTY-BATCH-1',
          partyType: 'person',
          firstName: 'Ana',
          lastName: 'Batch',
        }),
      }),
      adminIdentity,
    );
    const firstParty = (await first.json()).data;

    const second = await handler(
      new Request('https://portfolio.test/parties', {
        method: 'POST',
        body: JSON.stringify({
          code: 'PTY-BATCH-2',
          partyType: 'company',
          legalName: 'Batch Property d.o.o.',
        }),
      }),
      adminIdentity,
    );
    const secondParty = (await second.json()).data;

    const response = await handler(
      new Request(
        `https://portfolio.test/parties?id=${firstParty.id}&id=${secondParty.id}&id=${firstParty.id}`,
      ),
      inspectorIdentity,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items).toHaveLength(2);
    expect(
      body.data.items.map((party: { id: string }) => party.id).sort(),
    ).toEqual([firstParty.id, secondParty.id].sort());

    const missing = await handler(
      new Request(
        'https://portfolio.test/parties?id=d7a10000-0000-4000-8000-000000000099',
      ),
      inspectorIdentity,
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: 'PARTY_NOT_FOUND' },
    });
  });


  it('reads canonical Agreement and Amendment document targets without widening Unit Documents', async () => {
    const leaseRepository = new EmptyLeaseRepository();
    const documentRepository = new InMemoryDocumentRepository();
    const agreementId = asLeaseAgreementId(
      'e1000000-0000-4000-8000-000000000001',
    );
    const amendmentId = asLeaseAmendmentId(
      'e1000000-0000-4000-8000-000000000002',
    );
    const documentId = asDocumentId(
      'e1000000-0000-4000-8000-000000000003',
    );
    const versionId = asDocumentVersionId(
      'e1000000-0000-4000-8000-000000000004',
    );
    const agreementLinkId = asDocumentLinkId(
      'e1000000-0000-4000-8000-000000000005',
    );
    const amendmentLinkId = asDocumentLinkId(
      'e1000000-0000-4000-8000-000000000006',
    );
    const tenancyId = asTenancyId(
      'e1000000-0000-4000-8000-000000000007',
    );

    leaseRepository.agreements.set(agreementId, {
      id: agreementId,
      tenancyId,
      code: 'AGR-DOC-HTTP',
      agreementType: 'initial',
      predecessorAgreementId: null,
      effectiveFrom: '2025-01-01' as DateOnly,
      effectiveTo: null,
      status: 'signed',
      signedAt: '2024-12-20' as DateOnly,
      version: 2,
      parties: [],
    });
    leaseRepository.amendments.set(amendmentId, {
      id: amendmentId,
      agreementId,
      code: 'AMD-DOC-HTTP',
      title: 'Signed change',
      description: null,
      effectiveFrom: '2025-06-01' as DateOnly,
      status: 'signed',
      signedAt: '2025-05-20' as DateOnly,
      version: 2,
    });

    documentRepository.documents.set(documentId, {
      id: documentId,
      code: 'DOC-SIGNED-HTTP',
      title: 'Signed lease PDF',
      category: 'legal',
      status: 'active',
      latestVersionNumber: 3,
      revision: 4,
    });
    documentRepository.versions.set(versionId, {
      id: versionId,
      documentId,
      versionNumber: 3,
      fileName: 'LEASE-2026.pdf',
      mimeType: 'application/pdf',
      byteSize: 1234,
      sha256: 'a'.repeat(64),
      status: 'final',
      finalizedAt: '2025-05-20T10:00:00.000Z',
    });
    documentRepository.links.push(
      {
        id: agreementLinkId,
        documentId,
        documentVersionId: versionId,
        relation: 'signed_original',
        targetType: 'lease_agreement',
        targetId: agreementId,
      },
      {
        id: amendmentLinkId,
        documentId,
        documentVersionId: versionId,
        relation: 'signed_original',
        targetType: 'lease_amendment',
        targetId: amendmentId,
      },
    );

    const handler = buildHandler([], new FixedClock(), {
      leaseRepository,
      documentRepository,
    });

    const agreementResponse = await handler(
      new Request(
        `https://portfolio.test/agreements/${agreementId}/documents`,
      ),
      inspectorIdentity,
    );
    expect(agreementResponse.status).toBe(200);
    expect(await agreementResponse.json()).toMatchObject({
      data: {
        items: [
          {
            document: { id: documentId, code: 'DOC-SIGNED-HTTP' },
            link: {
              id: agreementLinkId,
              relation: 'signed_original',
              targetType: 'lease_agreement',
              targetId: agreementId,
            },
            linkedVersion: {
              id: versionId,
              fileName: 'LEASE-2026.pdf',
              versionNumber: 3,
              status: 'final',
            },
          },
        ],
      },
    });

    const amendmentResponse = await handler(
      new Request(
        `https://portfolio.test/amendments/${amendmentId}/documents`,
      ),
      inspectorIdentity,
    );
    expect(amendmentResponse.status).toBe(200);
    expect(await amendmentResponse.json()).toMatchObject({
      data: {
        items: [
          {
            link: {
              id: amendmentLinkId,
              targetType: 'lease_amendment',
              targetId: amendmentId,
            },
            linkedVersion: { id: versionId, status: 'final' },
          },
        ],
      },
    });

    const missing = await handler(
      new Request(
        'https://portfolio.test/agreements/e1000000-0000-4000-8000-000000000099/documents',
      ),
      inspectorIdentity,
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: 'LEASE_AGREEMENT_NOT_FOUND' },
    });
  });


  it('rejects DocumentVersion binary delivery above the buffered size ceiling', async () => {
    const documentRepository = new InMemoryDocumentRepository();
    const documentId = asDocumentId(
      'f1000000-0000-4000-8000-000000000001',
    );
    const versionId = asDocumentVersionId(
      'f1000000-0000-4000-8000-000000000002',
    );

    documentRepository.documents.set(documentId, {
      id: documentId,
      code: 'DOC-OVERSIZED-HTTP',
      title: 'Oversized binary',
      category: 'legal',
      status: 'active',
      latestVersionNumber: 1,
      revision: 2,
    });
    documentRepository.versions.set(versionId, {
      id: versionId,
      documentId,
      versionNumber: 1,
      fileName: 'oversized.pdf',
      mimeType: 'application/pdf',
      byteSize: 16 * 1024 * 1024 + 1,
      sha256: 'f'.repeat(64),
      status: 'final',
      finalizedAt: '2026-09-21T18:00:00.000Z',
    });
    documentRepository.storage.set(versionId, {
      provider: 'memory',
      objectId: 'oversized-object',
      objectKey: `document-version:${versionId}`,
    });

    const handler = buildHandler([], new FixedClock(), {
      documentRepository,
    });

    const response = await handler(
      new Request(
        `https://portfolio.test/document-versions/${versionId}/content`,
      ),
      inspectorIdentity,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: 'DOCUMENT_BINARY_DELIVERY_LIMIT_EXCEEDED' },
    });
  });


  it('maps DocumentVersion storage integrity mismatch to an upstream 502 failure', async () => {
    const documentRepository = new InMemoryDocumentRepository();
    const fileStorage = new MemoryFileStorage();
    const documentId = asDocumentId(
      'f2000000-0000-4000-8000-000000000001',
    );
    const versionId = asDocumentVersionId(
      'f2000000-0000-4000-8000-000000000002',
    );
    const objectKey = `document-version:${versionId}`;

    documentRepository.documents.set(documentId, {
      id: documentId,
      code: 'DOC-INTEGRITY-HTTP',
      title: 'Integrity mismatch',
      category: 'legal',
      status: 'active',
      latestVersionNumber: 1,
      revision: 2,
    });
    documentRepository.versions.set(versionId, {
      id: versionId,
      documentId,
      versionNumber: 1,
      fileName: 'integrity.pdf',
      mimeType: 'application/pdf',
      byteSize: 3,
      sha256: 'a'.repeat(64),
      status: 'final',
      finalizedAt: '2026-09-21T18:00:00.000Z',
    });
    documentRepository.storage.set(versionId, {
      provider: 'memory',
      objectId: 'integrity-object',
      objectKey,
    });

    fileStorage.objects.set(objectKey, {
      provider: 'memory',
      objectId: 'integrity-object',
      objectKey,
      byteSize: 3,
      sha256: 'b'.repeat(64),
      disposition: 'created',
    });
    fileStorage.contents.set(objectKey, new Uint8Array([1, 2, 3]));

    const handler = buildHandler([], new FixedClock(), {
      documentRepository,
      fileStorage,
    });

    const response = await handler(
      new Request(
        `https://portfolio.test/document-versions/${versionId}/content`,
      ),
      inspectorIdentity,
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'DOCUMENT_BINARY_INTEGRITY_MISMATCH',
      },
    });
  });


  it('maps a missing storage binary to an upstream 502 failure', async () => {
    const documentRepository = new InMemoryDocumentRepository();
    const documentId = asDocumentId(
      'f3000000-0000-4000-8000-000000000001',
    );
    const versionId = asDocumentVersionId(
      'f3000000-0000-4000-8000-000000000002',
    );

    documentRepository.documents.set(documentId, {
      id: documentId,
      code: 'DOC-MISSING-BINARY-HTTP',
      title: 'Missing storage binary',
      category: 'legal',
      status: 'active',
      latestVersionNumber: 1,
      revision: 2,
    });
    documentRepository.versions.set(versionId, {
      id: versionId,
      documentId,
      versionNumber: 1,
      fileName: 'missing.pdf',
      mimeType: 'application/pdf',
      byteSize: 3,
      sha256: 'a'.repeat(64),
      status: 'final',
      finalizedAt: '2026-09-21T18:00:00.000Z',
    });
    documentRepository.storage.set(versionId, {
      provider: 'memory',
      objectId: 'missing-object',
      objectKey: `document-version:${versionId}`,
    });

    const response = await buildHandler([], new FixedClock(), {
      documentRepository,
      fileStorage: new MemoryFileStorage(),
    })(
      new Request(
        `https://portfolio.test/document-versions/${versionId}/content`,
      ),
      inspectorIdentity,
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: { code: 'DOCUMENT_BINARY_MISSING' },
    });
  });

  it('maps a missing DocumentVersion storage reference to an upstream 502 failure', async () => {
    const documentRepository = new InMemoryDocumentRepository();
    const documentId = asDocumentId(
      'f3000000-0000-4000-8000-000000000003',
    );
    const versionId = asDocumentVersionId(
      'f3000000-0000-4000-8000-000000000004',
    );

    documentRepository.documents.set(documentId, {
      id: documentId,
      code: 'DOC-MISSING-REF-HTTP',
      title: 'Missing storage reference',
      category: 'legal',
      status: 'active',
      latestVersionNumber: 1,
      revision: 2,
    });
    documentRepository.versions.set(versionId, {
      id: versionId,
      documentId,
      versionNumber: 1,
      fileName: 'missing-reference.pdf',
      mimeType: 'application/pdf',
      byteSize: 3,
      sha256: 'a'.repeat(64),
      status: 'final',
      finalizedAt: '2026-09-21T18:00:00.000Z',
    });

    const response = await buildHandler([], new FixedClock(), {
      documentRepository,
    })(
      new Request(
        `https://portfolio.test/document-versions/${versionId}/content`,
      ),
      inspectorIdentity,
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: { code: 'DOCUMENT_STORAGE_REFERENCE_MISSING' },
    });
  });

  it('encodes filename* using RFC 5987 attr-char escaping', async () => {
    const documentRepository = new InMemoryDocumentRepository();
    const fileStorage = new MemoryFileStorage();
    const documentId = asDocumentId(
      'f3000000-0000-4000-8000-000000000005',
    );
    const versionId = asDocumentVersionId(
      'f3000000-0000-4000-8000-000000000006',
    );
    const objectKey = `document-version:${versionId}`;

    documentRepository.documents.set(documentId, {
      id: documentId,
      code: 'DOC-RFC5987-HTTP',
      title: 'RFC 5987 filename',
      category: 'legal',
      status: 'active',
      latestVersionNumber: 1,
      revision: 2,
    });
    documentRepository.versions.set(versionId, {
      id: versionId,
      documentId,
      versionNumber: 1,
      fileName: "owner's(contract)*.pdf",
      mimeType: 'application/pdf',
      byteSize: 3,
      sha256: 'c'.repeat(64),
      status: 'final',
      finalizedAt: '2026-09-21T18:00:00.000Z',
    });
    documentRepository.storage.set(versionId, {
      provider: 'memory',
      objectId: 'rfc5987-object',
      objectKey,
    });
    fileStorage.objects.set(objectKey, {
      provider: 'memory',
      objectId: 'rfc5987-object',
      objectKey,
      byteSize: 3,
      sha256: 'c'.repeat(64),
      disposition: 'created',
    });
    fileStorage.contents.set(objectKey, new Uint8Array([1, 2, 3]));

    const response = await buildHandler([], new FixedClock(), {
      documentRepository,
      fileStorage,
    })(
      new Request(
        `https://portfolio.test/document-versions/${versionId}/content`,
      ),
      inspectorIdentity,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="owner\'s(contract)*.pdf"; ' +
        "filename*=UTF-8''owner%27s%28contract%29%2A.pdf",
    );
  });


});
