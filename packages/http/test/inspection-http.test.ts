import { describe, expect, it } from 'vitest';
import {
  type Actor,
  type AgreementSupersession,
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
  asDocumentVersionId,
  asInspectionId,
  asInspectionSchemaVersionId,
  asPropertyId,
  asUnitId,
  asUserId,
  createInspection,
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
import { InMemoryReportingRepository } from './reporting-test-deps.js';

const adminIdentity: VerifiedIdentity = {
  provider: 'supabase',
  subject: 'admin-subject',
};

const inspectorIdentity: VerifiedIdentity = {
  provider: 'supabase',
  subject: 'inspector-subject',
};

const otherInspectorIdentity: VerifiedIdentity = {
  provider: 'supabase',
  subject: 'other-inspector-subject',
};

class FixedIds implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  next(): string {
    const value = this.values[this.index++];
    if (!value) throw new Error('No deterministic ID configured.');
    return value;
  }
}

class AccessRepository implements UserAccessRepository {
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
    if (identity.subject === 'other-inspector-subject') {
      return {
        userId: asUserId('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
        role: 'inspector',
      };
    }
    return null;
  }
}

class PortfolioMemory implements PortfolioRepository {
  readonly properties = new Map<PropertyId, Property>();
  readonly units = new Map<UnitId, Unit>();
  readonly spaces = new Map<SpaceId, Space>();

  async getPropertyById(id: PropertyId) { return this.properties.get(id) ?? null; }
  async getUnitById(id: UnitId) { return this.units.get(id) ?? null; }
  async getSpaceById(id: SpaceId) { return this.spaces.get(id) ?? null; }
  async listProperties() { return [...this.properties.values()]; }
  async listUnitsByProperty(propertyId: PropertyId) {
    return [...this.units.values()].filter((unit) => unit.propertyId === propertyId);
  }
  async listSpacesByUnit(unitId: UnitId) {
    return [...this.spaces.values()].filter((space) => space.unitId === unitId);
  }
  async propertyCodeExists(code: string) {
    return [...this.properties.values()].some(
      (property) => property.code.toLowerCase() === code.toLowerCase(),
    );
  }
  async unitCodeExists(code: string) {
    return [...this.units.values()].some(
      (unit) => unit.code.toLowerCase() === code.toLowerCase(),
    );
  }
  async unitNumberExists(propertyId: PropertyId, unitNumber: string) {
    return [...this.units.values()].some(
      (unit) =>
        unit.propertyId === propertyId &&
        unit.unitNumber.toLowerCase() === unitNumber.toLowerCase(),
    );
  }
  async spaceCodeExists(unitId: UnitId, code: string) {
    return [...this.spaces.values()].some(
      (space) =>
        space.unitId === unitId &&
        space.code.toLowerCase() === code.toLowerCase(),
    );
  }
  async insertProperty(property: Property) { this.properties.set(property.id, property); }
  async insertUnit(unit: Unit) { this.units.set(unit.id, unit); }
  async insertSpace(space: Space) { this.spaces.set(space.id, space); }
}

class EmptyPartyRepository implements PartyRepository {
  async getById(_id: PartyId): Promise<Party | null> { return null; }
  async getByIds(_ids: readonly PartyId[]): Promise<readonly Party[]> { return []; }
  async list(): Promise<readonly Party[]> { return []; }
  async codeExists(_code: string): Promise<boolean> { return false; }
  async insert(_party: Party): Promise<void> {}
}

class EmptyOwnershipRepository implements OwnershipRepository {
  async listByUnit(_unitId: UnitId): Promise<readonly OwnershipPeriod[]> { return []; }
  async overlaps(
    _unitId: UnitId,
    _validFrom: DateOnly,
    _validTo: DateOnly | null,
  ): Promise<boolean> { return false; }
  async insert(_period: OwnershipPeriod): Promise<void> {}
}

class EmptyTenancyRepository implements TenancyRepository {
  async getById(_id: TenancyId): Promise<Tenancy | null> { return null; }
  async listByUnit(_unitId: UnitId): Promise<readonly Tenancy[]> { return []; }
  async codeExists(_code: string): Promise<boolean> { return false; }
  async hasPlannedReservationOverlap() { return false; }
  async hasActualOccupancyOverlap() { return false; }
  async insert(_tenancy: Tenancy): Promise<void> {}
  async insertParty(
    _party: TenancyParty,
    _expectedVersion: number,
    _newVersion: number,
  ): Promise<void> {}
  async updateLifecycle(_tenancy: Tenancy, _expectedVersion: number): Promise<void> {}
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
    _predecessor?: AgreementSupersession,
  ): Promise<void> {}
  async cancelAgreement(_agreement: LeaseAgreement, _expectedVersion: number): Promise<void> {}
  async getAmendmentById(_id: LeaseAmendmentId): Promise<LeaseAmendment | null> { return null; }
  async listAmendmentsByAgreement(_agreementId: LeaseAgreementId): Promise<readonly LeaseAmendment[]> { return []; }
  async amendmentCodeExists(_code: string): Promise<boolean> { return false; }
  async insertAmendment(_amendment: LeaseAmendment): Promise<void> {}
  async signAmendment(
    _amendment: LeaseAmendment,
    _expectedVersion: number,
    _terms: TenancyTermVersion,
  ): Promise<void> {}
  async cancelAmendment(_amendment: LeaseAmendment, _expectedVersion: number): Promise<void> {}
  async getEffectiveTermsAt(_tenancyId: TenancyId, _at: DateOnly): Promise<TenancyTermVersion | null> { return null; }
}

function buildHandler() {
  const portfolioRepository = new PortfolioMemory();
  const inspectionRepository = new InMemoryInspectionRepository();
  const documentRepository = new InMemoryDocumentRepository();
  const fileStorage = new MemoryFileStorage();
  let pdfRenderCount = 0;
  const pdfPort: PdfPort = {
    async renderInspectionFinalReport(snapshot) {
      pdfRenderCount += 1;
      return {
        fileName: `${snapshot.inspectionId}-final.pdf`,
        content: new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]),
      };
    },
  };
  const staffDirectoryRepository = new InMemoryStaffDirectoryRepository();
  staffDirectoryRepository.users.set(
    asUserId('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
    {
      userId: asUserId('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
      displayName: 'Other Inspector',
      email: 'other.inspector@portfolio.test',
      role: 'inspector',
    },
  );

  const handler = createPortfolioHttpHandler({
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
    portfolioRepository,
    partyRepository: new EmptyPartyRepository(),
    ownershipRepository: new EmptyOwnershipRepository(),
    tenancyRepository: new EmptyTenancyRepository(),
    leaseRepository: new EmptyLeaseRepository(),
    documentRepository,
    inspectionRepository,
    staffDirectoryRepository,
    fileStorage,
    pdfPort,
    clock: new FixedClock('2026-09-18T20:00:00.000Z'),
    userAccessRepository: new AccessRepository(),
    idGenerator: new FixedIds([
      '81000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000002',
      '81000000-0000-4000-8000-000000000003',
      '81000000-0000-4000-8000-000000000004',
      '81000000-0000-4000-8000-000000000005',
      '81000000-0000-4000-8000-000000000006',
      '81000000-0000-4000-8000-000000000007',
      '81000000-0000-4000-8000-000000000008',
      '81000000-0000-4000-8000-000000000009',
      '81000000-0000-4000-8000-000000000010',
      '81000000-0000-4000-8000-000000000011',
      '81000000-0000-4000-8000-000000000012',
      '81000000-0000-4000-8000-000000000013',
      '81000000-0000-4000-8000-000000000014',
      '81000000-0000-4000-8000-000000000015',
      '81000000-0000-4000-8000-000000000016',
    ]),
  });

  return {
    handler,
    inspectionRepository,
    portfolioRepository,
    documentRepository,
    fileStorage,
    getPdfRenderCount: () => pdfRenderCount,
  };
}

describe('Inspection HTTP backbone', () => {
  it('orchestrates draft assignment/schedule and exposes a routable assigned-work queue', async () => {
    const { handler, inspectionRepository, portfolioRepository } =
      buildHandler();

    const propertyId = asPropertyId(
      '89000000-0000-4000-8000-000000000001',
    );
    const unitId = asUnitId(
      '89000000-0000-4000-8000-000000000002',
    );
    await portfolioRepository.insertUnit({
      id: unitId,
      propertyId,
      code: 'UNIT-ORCH',
      unitNumber: '7A',
      unitType: 'apartment',
      floor: null,
      areaM2: null,
      rooms: null,
      status: 'active',
      notes: '',
    });

    const inspection = createInspection({
      id: asInspectionId(
        '89000000-0000-4000-8000-000000000003',
      ),
      code: 'INS-ORCH',
      inspectionType: 'move_in',
      unitId,
      schemaVersionId: asInspectionSchemaVersionId(
        '89000000-0000-4000-8000-000000000004',
      ),
      assignedToUserId: asUserId(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ),
      createdByUserId: asUserId(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ),
      scheduledFor: '2026-09-24',
    });
    inspectionRepository.inspections.set(inspection.id, inspection);

    const adminStaff = await handler(
      new Request('https://portfolio.test/inspection-staff'),
      adminIdentity,
    );
    expect(adminStaff.status).toBe(200);
    expect(await adminStaff.json()).toMatchObject({
      data: {
        items: expect.arrayContaining([
          expect.objectContaining({
            userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            displayName: 'Inspector User',
            role: 'inspector',
          }),
          expect.objectContaining({
            userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            displayName: 'Manager User',
            role: 'manager',
          }),
        ]),
      },
    });

    const inspectorStaff = await handler(
      new Request('https://portfolio.test/inspection-staff'),
      inspectorIdentity,
    );
    expect(inspectorStaff.status).toBe(200);
    expect(await inspectorStaff.json()).toMatchObject({
      data: {
        items: [
          {
            userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            displayName: 'Inspector User',
            role: 'inspector',
          },
        ],
      },
    });

    const assigned = await handler(
      new Request(
        'https://portfolio.test/inspections/assigned-to-me',
      ),
      inspectorIdentity,
    );
    expect(assigned.status).toBe(200);
    expect(await assigned.json()).toMatchObject({
      data: {
        items: [
          {
            inspection: {
              id: inspection.id,
              assignedToUserId:
                'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            },
            propertyId,
            unitCode: 'UNIT-ORCH',
            unitNumber: '7A',
          },
        ],
      },
    });

    const forbiddenReassign = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/orchestration`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion: 1,
            assignedToUserId:
              'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            scheduledFor: '2026-09-25',
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(forbiddenReassign.status).toBe(403);
    expect(await forbiddenReassign.json()).toMatchObject({
      error: { code: 'INSPECTION_ASSIGNMENT_FORBIDDEN' },
    });

    const rescheduled = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/orchestration`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion: 1,
            assignedToUserId:
              'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            scheduledFor: '2026-09-25',
          }),
        },
      ),
      adminIdentity,
    );
    expect(rescheduled.status).toBe(200);
    expect(await rescheduled.json()).toMatchObject({
      data: {
        id: inspection.id,
        assignedToUserId:
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        scheduledFor: '2026-09-25',
        status: 'draft',
        version: 2,
        contentRevision: 0,
      },
    });

    const stale = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/orchestration`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion: 1,
            assignedToUserId:
              'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            scheduledFor: '2026-09-26',
          }),
        },
      ),
      adminIdentity,
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { code: 'INSPECTION_VERSION_CONFLICT' },
    });

    const started = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/start`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 2 }),
        },
      ),
      adminIdentity,
    );
    expect(started.status).toBe(200);
    expect(await started.json()).toMatchObject({
      data: { status: 'in_progress', version: 3 },
    });

    const afterStart = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/orchestration`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion: 3,
            assignedToUserId:
              'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            scheduledFor: '2026-09-27',
          }),
        },
      ),
      adminIdentity,
    );
    expect(afterStart.status).toBe(422);
    expect(await afterStart.json()).toMatchObject({
      error: { code: 'INSPECTION_ORCHESTRATION_LOCKED' },
    });
  });


  it('runs schema → inspection → section autosave → finding → lock with ownership guards', async () => {
    const { handler } = buildHandler();

    const schemaCreated = await handler(
      new Request('https://portfolio.test/inspection-schemas', {
        method: 'POST',
        body: JSON.stringify({
          schemaCode: 'MOVE-IN',
          inspectionType: 'move_in',
          title: 'Move-in',
          requiredSignatureRoles: [],
          sections: [
            {
              key: 'general',
              title: 'General',
              sortOrder: 0,
              items: [
                {
                  key: 'condition',
                  type: 'select',
                  label: 'Condition',
                  required: true,
                  sortOrder: 0,
                  options: [
                    { value: 'good', label: 'Good' },
                    { value: 'damaged', label: 'Damaged' },
                  ],
                },
                {
                  key: 'damage_note',
                  type: 'textarea',
                  label: 'Damage note',
                  sortOrder: 1,
                  visibleWhen: {
                    fieldKey: 'condition',
                    operator: 'equals',
                    value: 'damaged',
                  },
                  requiredWhen: {
                    fieldKey: 'condition',
                    operator: 'equals',
                    value: 'damaged',
                  },
                },
              ],
            },
          ],
        }),
      }),
      adminIdentity,
    );
    expect(schemaCreated.status).toBe(201);

    const omittedSignaturePolicy = await handler(
      new Request('https://portfolio.test/inspection-schemas', {
        method: 'POST',
        body: JSON.stringify({
          schemaCode: 'MISSING-POLICY',
          inspectionType: 'move_in',
          title: 'Missing policy',
          sections: [{
            key: 'general',
            title: 'General',
            sortOrder: 0,
            items: [{
              key: 'condition',
              type: 'text',
              label: 'Condition',
              sortOrder: 0,
            }],
          }],
        }),
      }),
      adminIdentity,
    );
    expect(omittedSignaturePolicy.status).toBe(400);

    const schema = (await schemaCreated.json()).data as {
      id: string;
      sections: Array<{ id: string; items: Array<{ id: string }> }>;
    };

    const inspectorSchemaWrite = await handler(
      new Request('https://portfolio.test/inspection-schemas', {
        method: 'POST',
        body: JSON.stringify({
          schemaCode: 'NOPE',
          inspectionType: 'move_in',
          title: 'Nope',
          requiredSignatureRoles: [],
          sections: [{
            key: 'x',
            title: 'X',
            sortOrder: 0,
            items: [{
              key: 'x',
              type: 'text',
              label: 'X',
              sortOrder: 0,
            }],
          }],
        }),
      }),
      inspectorIdentity,
    );
    expect(inspectorSchemaWrite.status).toBe(403);

    const published = await handler(
      new Request(
        `https://portfolio.test/inspection-schemas/${schema.id}/publish`,
        { method: 'POST' },
      ),
      adminIdentity,
    );
    expect(published.status).toBe(200);
    expect(await published.clone().json()).toMatchObject({
      data: { status: 'published', versionNumber: 1 },
    });

    const property = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        body: JSON.stringify({
          code: 'PROP-INS',
          name: 'Inspection Building',
          propertyType: 'apartment_building',
          street: 'Field',
          houseNumber: '1',
          postalCode: '18000',
          city: 'Niš',
          countryCode: 'RS',
        }),
      }),
      adminIdentity,
    );
    expect(property.status).toBe(201);

    const unit = await handler(
      new Request('https://portfolio.test/units', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: '81000000-0000-4000-8000-000000000005',
          code: 'UNIT-INS',
          unitNumber: '1',
          unitType: 'apartment',
        }),
      }),
      adminIdentity,
    );
    expect(unit.status).toBe(201);
    const unitId = (await unit.json()).data.id as string;

    const created = await handler(
      new Request(`https://portfolio.test/units/${unitId}/inspections`, {
        method: 'POST',
        body: JSON.stringify({
          code: 'INS-0001',
          inspectionType: 'move_in',
          schemaVersionId: schema.id,
          assignedToUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          scheduledFor: '2026-09-20',
        }),
      }),
      adminIdentity,
    );
    expect(created.status).toBe(201);
    const inspection = (await created.json()).data as {
      id: string;
      version: number;
      assignedToUserId: string;
    };
    expect(inspection).toMatchObject({
      version: 1,
      assignedToUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });

    const visible = await handler(
      new Request(`https://portfolio.test/units/${unitId}/inspections`),
      inspectorIdentity,
    );
    expect(visible.status).toBe(200);
    expect(await visible.json()).toMatchObject({
      data: { items: [{ id: inspection.id }] },
    });

    const denied = await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}`),
      otherInspectorIdentity,
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({
      error: { code: 'INSPECTION_ACCESS_DENIED' },
    });

    const started = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/start`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 1 }),
        },
      ),
      inspectorIdentity,
    );
    expect(started.status).toBe(200);
    expect(await started.json()).toMatchObject({
      data: { status: 'in_progress', version: 2 },
    });

    const sectionId = schema.sections[0]!.id;
    const conditionItemId = schema.sections[0]!.items[0]!.id;
    const damageItemId = schema.sections[0]!.items[1]!.id;

    const firstSave = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/sections/${sectionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            expectedRevision: 0,
            set: [
              { itemId: conditionItemId, value: 'damaged' },
            ],
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(firstSave.status).toBe(200);
    expect(await firstSave.clone().json()).toMatchObject({
      data: { revision: 1, contentRevision: 1 },
    });

    const staleSave = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/sections/${sectionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            expectedRevision: 0,
            set: [
              { itemId: conditionItemId, value: 'good' },
            ],
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(staleSave.status).toBe(409);
    expect(await staleSave.json()).toMatchObject({
      error: { code: 'INSPECTION_SECTION_REVISION_CONFLICT' },
    });

    const prematureLock = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/lock`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 2 }),
        },
      ),
      inspectorIdentity,
    );
    expect(prematureLock.status).toBe(422);
    expect(await prematureLock.json()).toMatchObject({
      error: { code: 'INSPECTION_REQUIRED_RESPONSES_MISSING' },
    });

    const secondSave = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/sections/${sectionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            expectedRevision: 1,
            set: [
              {
                itemId: damageItemId,
                value: 'Scratch on wall',
                comment: 'Photo will be attached in PR13',
              },
            ],
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(secondSave.status).toBe(200);
    expect(await secondSave.clone().json()).toMatchObject({
      data: { revision: 2, contentRevision: 2 },
    });

    const cleared = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/sections/${sectionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            expectedRevision: 2,
            set: [{ itemId: conditionItemId, value: 'good' }],
            clear: [damageItemId],
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(cleared.status).toBe(200);
    expect(await cleared.clone().json()).toMatchObject({
      data: {
        revision: 3,
        contentRevision: 3,
        clearedItemIds: [damageItemId],
      },
    });

    const restored = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/sections/${sectionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            expectedRevision: 3,
            set: [
              { itemId: conditionItemId, value: 'damaged' },
              { itemId: damageItemId, value: 'Scratch on wall' },
            ],
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(restored.status).toBe(200);
    expect(await restored.clone().json()).toMatchObject({
      data: { revision: 4, contentRevision: 4 },
    });

    const finding = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/findings`,
        {
          method: 'POST',
          body: JSON.stringify({
            sectionId,
            itemId: damageItemId,
            severity: 'minor',
            title: 'Wall scratch',
            description: 'Near the entrance.',
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(finding.status).toBe(201);

    const locked = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/lock`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 2 }),
        },
      ),
      inspectorIdentity,
    );
    expect(locked.status).toBe(200);
    expect(await locked.json()).toMatchObject({
      data: { status: 'locked', version: 3 },
    });

    const saveAfterLock = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/sections/${sectionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            expectedRevision: 2,
            set: [{ itemId: conditionItemId, value: 'good' }],
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(saveAfterLock.status).toBe(422);
    expect(await saveAfterLock.json()).toMatchObject({
      error: { code: 'INSPECTION_CONTENT_LOCKED' },
    });

    const bundle = await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}`),
      inspectorIdentity,
    );
    expect(bundle.status).toBe(200);
    expect(await bundle.json()).toMatchObject({
      data: {
        inspection: {
          status: 'locked',
          version: 3,
          contentRevision: 5,
        },
        schema: { id: schema.id, status: 'published' },
        sectionStates: [{ sectionId, revision: 4 }],
        responses: [
          { itemId: conditionItemId, value: 'damaged' },
          { itemId: damageItemId, value: 'Scratch on wall' },
        ],
        findings: [{ title: 'Wall scratch', severity: 'minor' }],
      },
    });

    const badAssignment = await handler(
      new Request(`https://portfolio.test/units/${unitId}/inspections`, {
        method: 'POST',
        body: JSON.stringify({
          code: 'INS-FORBIDDEN',
          inspectionType: 'move_in',
          schemaVersionId: schema.id,
          assignedToUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }),
      }),
      inspectorIdentity,
    );
    expect(badAssignment.status).toBe(403);
    expect(await badAssignment.json()).toMatchObject({
      error: { code: 'INSPECTION_ASSIGNMENT_FORBIDDEN' },
    });
  });

  it('enforces evidence/signature permissions and returns final snapshot over HTTP', async () => {
    const { handler, documentRepository, fileStorage, getPdfRenderCount } =
      buildHandler();

    for (const [versionId, documentId, fileName] of [
      [
        '83000000-0000-4000-8000-000000000001',
        '83000000-0000-4000-8000-000000000011',
        'photo.jpg',
      ],
      [
        '83000000-0000-4000-8000-000000000002',
        '83000000-0000-4000-8000-000000000012',
        'landlord.png',
      ],
      [
        '83000000-0000-4000-8000-000000000003',
        '83000000-0000-4000-8000-000000000013',
        'tenant.png',
      ],
    ] as const) {
      const typedVersionId = asDocumentVersionId(versionId);
      const typedDocumentId = asDocumentId(documentId);
      const isPhoto = fileName.endsWith('.jpg');

      documentRepository.documents.set(typedDocumentId, {
        id: typedDocumentId,
        code: `DOC-${documentId}`,
        title: fileName,
        category: isPhoto ? 'photo' : 'signature',
        status: 'active',
        latestVersionNumber: 1,
        revision: 2,
      });
      documentRepository.versions.set(typedVersionId, {
        id: typedVersionId,
        documentId: typedDocumentId,
        versionNumber: 1,
        fileName,
        mimeType: isPhoto ? 'image/jpeg' : 'image/png',
        byteSize: 10,
        sha256: 'a'.repeat(64),
        status: 'final',
        finalizedAt: '2026-09-18T19:00:00.000Z',
      });

      const reference = {
        provider: 'memory',
        objectId: `seed:${versionId}`,
        objectKey: `seed:${versionId}`,
      };
      documentRepository.storage.set(typedVersionId, reference);
      fileStorage.objects.set(reference.objectKey, {
        ...reference,
        byteSize: 10,
        sha256: 'a'.repeat(64),
        disposition: 'created',
      });
    }

    const schemaResponse = await handler(
      new Request('https://portfolio.test/inspection-schemas', {
        method: 'POST',
        body: JSON.stringify({
          schemaCode: 'MOVE-IN-SIGNED',
          inspectionType: 'move_in',
          title: 'Signed move-in',
          requiredSignatureRoles: ['witness', 'agent'],
          sections: [{
            key: 'general',
            title: 'General',
            sortOrder: 0,
            items: [{
              key: 'condition',
              type: 'text',
              label: 'Condition',
              required: true,
              sortOrder: 0,
            }],
          }],
        }),
      }),
      adminIdentity,
    );
    expect(schemaResponse.status).toBe(201);
    const schema = (await schemaResponse.json()).data as {
      id: string;
      sections: Array<{ id: string; items: Array<{ id: string }> }>;
    };
    await handler(
      new Request(
        `https://portfolio.test/inspection-schemas/${schema.id}/publish`,
        { method: 'POST' },
      ),
      adminIdentity,
    );

    const property = await handler(
      new Request('https://portfolio.test/properties', {
        method: 'POST',
        body: JSON.stringify({
          code: 'PROP-SIGNED',
          name: 'Signed Building',
          propertyType: 'apartment_building',
          street: 'Signed',
          houseNumber: '1',
          postalCode: '18000',
          city: 'Niš',
          countryCode: 'RS',
        }),
      }),
      adminIdentity,
    );
    const propertyId = (await property.json()).data.id as string;
    const unit = await handler(
      new Request('https://portfolio.test/units', {
        method: 'POST',
        body: JSON.stringify({
          propertyId,
          code: 'UNIT-SIGNED',
          unitNumber: 'S-1',
          unitType: 'apartment',
        }),
      }),
      adminIdentity,
    );
    const unitId = (await unit.json()).data.id as string;

    const created = await handler(
      new Request(`https://portfolio.test/units/${unitId}/inspections`, {
        method: 'POST',
        body: JSON.stringify({
          code: 'INS-SIGNED',
          inspectionType: 'move_in',
          schemaVersionId: schema.id,
          assignedToUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        }),
      }),
      adminIdentity,
    );
    const inspection = (await created.json()).data as {
      id: string;
      version: number;
    };

    await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}/start`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 1 }),
      }),
      inspectorIdentity,
    );

    const sectionId = schema.sections[0]!.id;
    const itemId = schema.sections[0]!.items[0]!.id;
    await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/sections/${sectionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            expectedRevision: 0,
            set: [{ itemId, value: 'Good' }],
          }),
        },
      ),
      inspectorIdentity,
    );

    const evidence = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/evidence`,
        {
          method: 'POST',
          body: JSON.stringify({
            documentVersionId: '83000000-0000-4000-8000-000000000001',
            kind: 'photo',
            sectionId,
            itemId,
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(evidence.status).toBe(201);

    const currentBeforeLock = await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}`),
      inspectorIdentity,
    );
    const lockVersion = (await currentBeforeLock.json()).data.inspection
      .version as number;
    await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}/lock`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: lockVersion }),
      }),
      inspectorIdentity,
    );

    const landlordSignature = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/signatures`,
        {
          method: 'POST',
          body: JSON.stringify({
            signerRole: 'witness',
            signerName: 'Witness',
            signatureDocumentVersionId:
              '83000000-0000-4000-8000-000000000002',
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(landlordSignature.status).toBe(201);

    const inspectorFinalize = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/finalize`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 3 }),
        },
      ),
      inspectorIdentity,
    );
    expect(inspectorFinalize.status).toBe(403);

    const inspectorUnlock = await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}/unlock`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 3,
          reason: 'Correction',
        }),
      }),
      inspectorIdentity,
    );
    expect(inspectorUnlock.status).toBe(403);

    const unlocked = await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}/unlock`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 3,
          reason: 'Correction',
        }),
      }),
      adminIdentity,
    );
    expect(unlocked.status).toBe(200);
    expect(await unlocked.clone().json()).toMatchObject({
      data: { status: 'in_progress', version: 4 },
    });

    const afterUnlock = await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}`),
      adminIdentity,
    );
    expect(await afterUnlock.json()).toMatchObject({
      data: {
        signatures: [{
          signerRole: 'witness',
          invalidationReason: 'Correction',
        }],
      },
    });

    await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}/lock`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 4 }),
      }),
      inspectorIdentity,
    );

    for (const [signerRole, signerName, signatureDocumentVersionId] of [
      [
        'witness',
        'Witness',
        '83000000-0000-4000-8000-000000000002',
      ],
      [
        'agent',
        'Agent',
        '83000000-0000-4000-8000-000000000003',
      ],
    ] as const) {
      const signed = await handler(
        new Request(
          `https://portfolio.test/inspections/${inspection.id}/signatures`,
          {
            method: 'POST',
            body: JSON.stringify({
              signerRole,
              signerName,
              signatureDocumentVersionId,
            }),
          },
        ),
        inspectorIdentity,
      );
      expect(signed.status).toBe(201);
    }

    const finalized = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/finalize`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 5 }),
        },
      ),
      adminIdentity,
    );
    expect(finalized.status).toBe(200);
    expect(await finalized.clone().json()).toMatchObject({
      data: {
        inspection: { status: 'finalized', version: 6 },
        snapshot: { snapshotVersion: 1 },
      },
    });

    const bundle = await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}`),
      adminIdentity,
    );
    expect(await bundle.json()).toMatchObject({
      data: {
        inspection: { status: 'finalized' },
        finalSnapshot: { snapshotVersion: 1 },
        evidence: [{ kind: 'photo' }],
        signatures: [
          { signerRole: 'witness', invalidationReason: 'Correction' },
          { signerRole: 'witness', invalidatedAt: null },
          { signerRole: 'agent', invalidatedAt: null },
        ],
      },
    });

    const firstReport = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/final-report`,
        { method: 'POST' },
      ),
      adminIdentity,
    );
    expect(firstReport.status).toBe(200);
    const firstReportVersion = (await firstReport.clone().json()).data as {
      id: string;
      status: string;
      mimeType: string;
    };
    expect(firstReportVersion).toMatchObject({
      status: 'final',
      mimeType: 'application/pdf',
    });

    const secondReport = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/final-report`,
        { method: 'POST' },
      ),
      adminIdentity,
    );
    expect(secondReport.status).toBe(200);
    expect((await secondReport.json()).data.id).toBe(firstReportVersion.id);
    expect(getPdfRenderCount()).toBe(1);

    const afterReport = await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}`),
      adminIdentity,
    );
    expect(await afterReport.json()).toMatchObject({
      data: {
        evidence: [
          { kind: 'photo' },
          {
            kind: 'final_report',
            documentVersionId: firstReportVersion.id,
            sectionId: null,
            itemId: null,
          },
        ],
      },
    });
  });
});
