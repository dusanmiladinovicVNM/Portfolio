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
  addStoredDocumentVersion,
  asDocumentId,
  asDocumentVersionId,
  asUserId,
  createDocument,
  finalizeDocumentVersion,
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
import {
  FixedClock,
  InMemoryDocumentRepository,
  MemoryFileStorage,
  MemoryPdfPort,
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

async function seedFinalDocumentVersion(
  repository: InMemoryDocumentRepository,
  documentIdValue: string,
  versionIdValue: string,
  mimeType: string,
) {
  const document = createDocument({
    id: asDocumentId(documentIdValue),
    code: `TEST-${documentIdValue}`,
    title: 'Inspection evidence',
    category: mimeType === 'application/pdf' ? 'inspection' : 'photo',
  });
  const added = addStoredDocumentVersion(document, {
    id: asDocumentVersionId(versionIdValue),
    fileName: mimeType === 'application/pdf' ? 'evidence.pdf' : 'evidence.png',
    mimeType,
    byteSize: 4,
    sha256: 'd'.repeat(64),
  });
  const final = finalizeDocumentVersion(
    added.version,
    '2026-09-18T19:00:00.000Z',
  );
  await repository.insertGeneratedFinal(
    added.document,
    final,
    {
      provider: 'memory',
      objectId: `object:${versionIdValue}`,
      objectKey: `document-version:${versionIdValue}`,
    },
  );
  return final;
}

function buildHandler() {
  const portfolioRepository = new PortfolioMemory();
  const inspectionRepository = new InMemoryInspectionRepository();
  const staffDirectoryRepository = new InMemoryStaffDirectoryRepository();
  staffDirectoryRepository.users.set(
    asUserId('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
    {
      userId: asUserId('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
      displayName: 'Other Inspector',
      role: 'inspector',
    },
  );

  const documentRepository = new InMemoryDocumentRepository();
  const fileStorage = new MemoryFileStorage();
  const pdfPort = new MemoryPdfPort();

  const handler = createPortfolioHttpHandler({
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
      '81000000-0000-4000-8000-000000000017',
      '81000000-0000-4000-8000-000000000018',
      '81000000-0000-4000-8000-000000000019',
      '81000000-0000-4000-8000-000000000020',
      '81000000-0000-4000-8000-000000000021',
      '81000000-0000-4000-8000-000000000022',
      '81000000-0000-4000-8000-000000000023',
      '81000000-0000-4000-8000-000000000024',
      '81000000-0000-4000-8000-000000000025',
      '81000000-0000-4000-8000-000000000026',
      '81000000-0000-4000-8000-000000000027',
      '81000000-0000-4000-8000-000000000028',
      '81000000-0000-4000-8000-000000000029',
      '81000000-0000-4000-8000-000000000030',
    ]),
  });

  return {
    handler,
    inspectionRepository,
    documentRepository,
    pdfPort,
  };
}

describe('Inspection HTTP backbone', () => {
  it('runs schema → inspection → section autosave → finding → lock with ownership guards', async () => {
    const { handler, documentRepository, pdfPort } = buildHandler();

    const schemaCreated = await handler(
      new Request('https://portfolio.test/inspection-schemas', {
        method: 'POST',
        body: JSON.stringify({
          schemaCode: 'MOVE-IN',
          inspectionType: 'move_in',
          title: 'Move-in',
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

    const photoVersion = await seedFinalDocumentVersion(
      documentRepository,
      '83000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000002',
      'image/png',
    );
    const signatureV1 = await seedFinalDocumentVersion(
      documentRepository,
      '83000000-0000-4000-8000-000000000003',
      '83000000-0000-4000-8000-000000000004',
      'image/png',
    );
    const signatureV2 = await seedFinalDocumentVersion(
      documentRepository,
      '83000000-0000-4000-8000-000000000005',
      '83000000-0000-4000-8000-000000000006',
      'image/png',
    );

    const evidence = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/evidence`,
        {
          method: 'POST',
          body: JSON.stringify({
            documentVersionId: photoVersion.id,
            evidenceType: 'photo',
            sectionId,
            itemId: damageItemId,
            caption: 'Wall scratch photo',
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(evidence.status).toBe(201);
    expect(await evidence.clone().json()).toMatchObject({
      data: {
        documentVersionId: photoVersion.id,
        sectionId,
        itemId: damageItemId,
      },
    });

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
          contentRevision: 6,
        },
        schema: { id: schema.id, status: 'published' },
        sectionStates: [{ sectionId, revision: 4 }],
        responses: [
          { itemId: conditionItemId, value: 'damaged' },
          { itemId: damageItemId, value: 'Scratch on wall' },
        ],
        findings: [{ title: 'Wall scratch', severity: 'minor' }],
        evidence: [{ documentVersionId: photoVersion.id }],
        signatures: [],
        unlockEvents: [],
        finalization: null,
      },
    });

    const firstSignature = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/signatures`,
        {
          method: 'POST',
          body: JSON.stringify({
            role: 'inspector',
            signerType: 'staff',
            signerUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            signatureDocumentVersionId: signatureV1.id,
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(firstSignature.status).toBe(201);
    const firstSignatureData = (await firstSignature.json()).data as {
      id: string;
      status: string;
    };
    expect(firstSignatureData.status).toBe('valid');

    const inspectorUnlock = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/unlock`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion: 3,
            reason: 'Need correction',
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(inspectorUnlock.status).toBe(403);
    expect(await inspectorUnlock.json()).toMatchObject({
      error: { code: 'INSPECTION_UNLOCK_FORBIDDEN' },
    });

    const unlocked = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/unlock`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion: 3,
            reason: 'Tenant requested a documented correction',
          }),
        },
      ),
      adminIdentity,
    );
    expect(unlocked.status).toBe(200);
    expect(await unlocked.json()).toMatchObject({
      data: {
        status: 'in_progress',
        version: 4,
        contentRevision: 8,
      },
    });

    const afterUnlock = await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}`),
      adminIdentity,
    );
    expect(afterUnlock.status).toBe(200);
    expect(await afterUnlock.json()).toMatchObject({
      data: {
        signatures: [
          {
            id: firstSignatureData.id,
            status: 'invalidated',
            invalidationReason: 'Tenant requested a documented correction',
          },
        ],
        unlockEvents: [
          {
            previousVersion: 3,
            invalidatedSignatureCount: 1,
          },
        ],
      },
    });

    const relocked = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/lock`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 4 }),
        },
      ),
      inspectorIdentity,
    );
    expect(relocked.status).toBe(200);
    expect(await relocked.json()).toMatchObject({
      data: { status: 'locked', version: 5, contentRevision: 8 },
    });

    const finalizeWithoutNewSignature = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/finalize`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 5 }),
        },
      ),
      inspectorIdentity,
    );
    expect(finalizeWithoutNewSignature.status).toBe(422);
    expect(await finalizeWithoutNewSignature.json()).toMatchObject({
      error: {
        code: 'INSPECTION_FINALIZATION_INSPECTOR_SIGNATURE_REQUIRED',
      },
    });

    const secondSignature = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/signatures`,
        {
          method: 'POST',
          body: JSON.stringify({
            role: 'inspector',
            signerType: 'staff',
            signerUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            signatureDocumentVersionId: signatureV2.id,
          }),
        },
      ),
      inspectorIdentity,
    );
    expect(secondSignature.status).toBe(201);

    const finalized = await handler(
      new Request(
        `https://portfolio.test/inspections/${inspection.id}/finalize`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 5 }),
        },
      ),
      inspectorIdentity,
    );
    expect(finalized.status).toBe(200);
    const finalizedBody = await finalized.json();
    expect(finalizedBody).toMatchObject({
      data: {
        inspection: {
          status: 'finalized',
          version: 6,
          contentRevision: 9,
        },
        finalization: {
          sourceVersion: 5,
          sourceContentRevision: 9,
        },
        finalReport: {
          mimeType: 'application/pdf',
          status: 'final',
        },
      },
    });
    expect(pdfPort.snapshots).toHaveLength(1);
    expect(pdfPort.snapshots[0]).toMatchObject({
      snapshotVersion: 1,
      inspection: {
        id: inspection.id,
        status: 'finalized',
        contentRevision: 9,
      },
      evidence: [
        {
          evidence: {
            documentVersionId: photoVersion.id,
          },
        },
      ],
      signatures: [
        {
          signature: {
            id: firstSignatureData.id,
            status: 'invalidated',
          },
        },
        {
          signature: {
            status: 'valid',
            signatureDocumentVersionId: signatureV2.id,
          },
        },
      ],
      unlockEvents: [
        {
          previousVersion: 3,
          invalidatedSignatureCount: 1,
        },
      ],
    });

    const finalBundle = await handler(
      new Request(`https://portfolio.test/inspections/${inspection.id}`),
      inspectorIdentity,
    );
    expect(finalBundle.status).toBe(200);
    expect(await finalBundle.json()).toMatchObject({
      data: {
        inspection: { status: 'finalized', version: 6 },
        finalization: {
          sourceVersion: 5,
          sourceContentRevision: 9,
          finalReportDocumentVersionId:
            finalizedBody.data.finalReport.id,
        },
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
});
