import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activateTenancyCommand,
  changeAssetStatusCommand,
  changeImprovementProjectStatusCommand,
  changeWorkItemStatusCommand,
  changeServicePlanStatusCommand,
  closeWarrantyClaimCommand,
  createAssetCommand,
  createImprovementProjectCommand,
  createWorkItemCommand,
  createServicePlanCommand,
  createWarrantyClaimCommand,
  createWarrantyCommand,
  moveAssetCommand,
  assessAssetConditionCommand,
  assignAssetToTenancyCommand,
  recordTenancyAssetInventoryCommand,
  recordServiceEventCommand,
  recordWorkCommand,
  resolveWarrantyClaimCommand,
  submitWarrantyClaimCommand,
  updateImprovementProjectPlanCommand,
  updateWorkItemPlanCommand,
  listAssetLocationHistoryQuery,
  listAssetConditionAssessmentsQuery,
  listTenancyAssetAssignmentsQuery,
  addInspectionSignatureCommand,
  attachInspectionEvidenceCommand,
  cancelLeaseAgreementCommand,
  createDocumentCommand,
  createInspectionCommand,
  createInspectionFindingCommand,
  createInspectionSchemaVersionCommand,
  createLeaseAgreementCommand,
  createLeaseAmendmentCommand,
  createOwnershipPeriodCommand,
  createPartyCommand,
  createTenancyCommand,
  createPropertyCommand,
  createSpaceCommand,
  createUnitCommand,
  endTenancyCommand,
  finalizeDocumentVersionCommand,
  finalizeInspectionCommand,
  generateInspectionFinalReportCommand,
  getEffectiveTenancyTermsQuery,
  giveTenancyNoticeCommand,
  linkDocumentCommand,
  listOwnershipPeriodsByUnitQuery,
  listPropertiesQuery,
  listSpacesByUnitQuery,
  listTenanciesByUnitQuery,
  listUnitsByPropertyQuery,
  listAssetsByPropertyQuery,
  listAssetsByUnitQuery,
  lockInspectionCommand,
  markTenancyMoveOutPendingCommand,
  planTenancyCommand,
  publishInspectionSchemaVersionCommand,
  replaceAssetCommand,
  updateAssetMetadataCommand,
  resolveActor,
  saveInspectionSectionCommand,
  startInspectionCommand,
  unlockInspectionCommand,
  signLeaseAgreementCommand,
  signLeaseAmendmentCommand,
  uploadDocumentVersionCommand,
  type IdGenerator,
  type VerifiedIdentity,
} from '@portfolio/application';
import {
  addStoredDocumentVersion,
  asDocumentVersionId,
  asInspectionResponseId,
  asOwnershipPeriodId,
  asPartyAddressId,
  asPartyId,
  asTenancyId,
  createInspectionResponse,
  createOwnershipPeriod,
  createTenancy,
  planTenancy,
  type Party,
} from '@portfolio/domain';
import {
  PostgresAssetInventoryRepository,
  PostgresAssetRepository,
  PostgresAssetServiceRepository,
  PostgresDocumentRepository,
  PostgresImprovementRepository,
  PostgresInspectionRepository,
  PostgresLeaseRepository,
  PostgresOwnershipRepository,
  PostgresPartyRepository,
  PostgresPortfolioRepository,
  PostgresTenancyRepository,
  PostgresUserAccessRepository,
} from '../../src/index.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
}

const sql = postgres(connectionString, { max: 1 });
const portfolioRepository = new PostgresPortfolioRepository(sql);
const assetRepository = new PostgresAssetRepository(sql);
const assetInventoryRepository = new PostgresAssetInventoryRepository(sql);
const assetServiceRepository = new PostgresAssetServiceRepository(sql);
const partyRepository = new PostgresPartyRepository(sql);
const ownershipRepository = new PostgresOwnershipRepository(sql);
const leaseRepository = new PostgresLeaseRepository(sql);
const tenancyRepository = new PostgresTenancyRepository(sql);
const accessRepository = new PostgresUserAccessRepository(sql);
const documentRepository = new PostgresDocumentRepository(sql);
const inspectionRepository = new PostgresInspectionRepository(sql);
const improvementRepository = new PostgresImprovementRepository(sql);

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

async function resetAndMigrate(): Promise<void> {
  await sql.unsafe(
    `drop table if exists
      public.improvement_project_assets,
      public.improvement_work_materials,
      public.improvement_work_records,
      public.improvement_work_items,
      public.improvement_projects,
      public.asset_service_parts,
      public.asset_service_events,
      public.asset_service_plans,
      public.asset_warranty_claims,
      public.asset_warranties,
      public.tenancy_asset_assignments,
      public.asset_condition_assessments,
      public.asset_location_history,
      public.asset_replacements,
      public.asset_identifiers,
      public.assets,
      public.inspection_final_snapshots,
      public.inspection_unlocks,
      public.inspection_signatures,
      public.inspection_evidence,
      public.inspection_findings,
      public.inspection_responses,
      public.inspection_section_states,
      public.inspections,
      public.inspection_schema_items,
      public.inspection_schema_sections,
      public.inspection_schema_versions,
      public.document_links,
      public.document_versions,
      public.documents,
      public.tenancy_term_versions,
      public.lease_amendments,
      public.lease_agreement_parties,
      public.lease_agreements,
      public.tenancy_parties,
      public.tenancies,
      public.unit_ownership_shares,
      public.unit_ownership_periods,
      public.party_addresses,
      public.party_contact_points,
      public.parties,
      public.auth_identities,
      public.app_users,
      public.spaces,
      public.units,
      public.properties
    cascade`,
  );

  const migrationsUrl = new URL('../../../../supabase/migrations/', import.meta.url);
  const migrationsPath = fileURLToPath(migrationsUrl);
  const files = (await readdir(migrationsPath))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const migration = await readFile(new URL(file, migrationsUrl), 'utf8');
    await sql.unsafe(migration);
  }
}

beforeAll(async () => {
  await resetAndMigrate();

  await sql`
    insert into public.app_users (id, display_name, email, role, status)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Portfolio Admin',
      'admin@example.test',
      'admin',
      'active'
    )
  `;

  await sql`
    insert into public.app_users (id, display_name, email, role, status)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'Portfolio Inspector',
      'inspector@example.test',
      'inspector',
      'active'
    )
  `;

  await sql`
    insert into public.auth_identities (user_id, provider, subject)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'supabase',
      'external-admin-subject'
    )
  `;
});

afterAll(async () => {
  await sql.unsafe(
    `drop table if exists
      public.improvement_project_assets,
      public.improvement_work_materials,
      public.improvement_work_records,
      public.improvement_work_items,
      public.improvement_projects,
      public.asset_replacements,
      public.asset_identifiers,
      public.assets,
      public.inspection_final_snapshots,
      public.inspection_unlocks,
      public.inspection_signatures,
      public.inspection_evidence,
      public.inspection_findings,
      public.inspection_responses,
      public.inspection_section_states,
      public.inspections,
      public.inspection_schema_items,
      public.inspection_schema_sections,
      public.inspection_schema_versions,
      public.document_links,
      public.document_versions,
      public.documents,
      public.tenancy_term_versions,
      public.lease_amendments,
      public.lease_agreement_parties,
      public.lease_agreements,
      public.tenancy_parties,
      public.tenancies,
      public.unit_ownership_shares,
      public.unit_ownership_periods,
      public.party_addresses,
      public.party_contact_points,
      public.parties,
      public.auth_identities,
      public.app_users,
      public.spaces,
      public.units,
      public.properties
    cascade`,
  );
  await sql.end();
});

describe('PostgreSQL infrastructure', () => {
  it('resolves verified external identity to an internal active actor', async () => {
    const identity: VerifiedIdentity = {
      provider: 'supabase',
      subject: 'external-admin-subject',
    };

    const actor = await resolveActor(accessRepository, identity);
    expect(actor.role).toBe('admin');
    expect(actor.userId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('does not resolve an inactive internal user', async () => {
    await sql`
      update public.app_users
      set status = 'inactive'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    `;

    await expect(
      resolveActor(accessRepository, {
        provider: 'supabase',
        subject: 'external-admin-subject',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    await sql`
      update public.app_users
      set status = 'active'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    `;
  });

  it('persists the full Portfolio application slice', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      '6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f',
      'f05296da-8e3c-45e5-8357-957745830c86',
      'f5d0ee31-0f36-41cf-8660-6de2ed95bd2b',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-0001',
        name: 'Main Building',
        propertyType: 'apartment_building',
        street: 'Example Street',
        houseNumber: '10',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
        yearBuilt: 2018,
      },
    );

    const unit = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
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
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        unitId: unit.id,
        code: 'KITCHEN',
        name: 'Kitchen',
        spaceType: 'kitchen',
        sortOrder: 10,
      },
    );

    expect((await listPropertiesQuery(portfolioRepository, actor))[0]?.code).toBe('PROP-0001');
    expect((await listUnitsByPropertyQuery(portfolioRepository, actor, property.id))[0]?.unitNumber)
      .toBe('4B');
    expect((await listSpacesByUnitQuery(portfolioRepository, actor, unit.id))[0]?.name)
      .toBe('Kitchen');
  });

  it('persists Party + contacts + addresses atomically', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });
    const ids = new SequenceIds([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);

    const party = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-0001',
        partyType: 'person',
        firstName: 'Ana',
        lastName: 'Jovanović',
        contactPoints: [
          {
            contactType: 'email',
            value: 'ana@example.test',
            isPrimary: true,
          },
        ],
        addresses: [
          {
            addressType: 'residential',
            line1: 'Example 1',
            postalCode: '18000',
            city: 'Niš',
            countryCode: 'RS',
            isPrimary: true,
          },
        ],
      },
    );

    const loaded = await partyRepository.getById(party.id);
    expect(loaded).toMatchObject({
      code: 'PTY-0001',
      displayName: 'Ana Jovanović',
    });
    expect(loaded?.contactPoints).toHaveLength(1);
    expect(loaded?.addresses).toHaveLength(1);
  });

  it('rolls back the entire Party aggregate when a child row is invalid', async () => {
    const invalidParty: Party = {
      id: asPartyId('44444444-4444-4444-8444-444444444444'),
      code: 'PTY-ROLLBACK',
      partyType: 'person',
      displayName: 'Rollback Test',
      firstName: 'Rollback',
      middleName: null,
      lastName: 'Test',
      status: 'active',
      contactPoints: [],
      addresses: [
        {
          id: asPartyAddressId('55555555-5555-4555-8555-555555555555'),
          partyId: asPartyId('44444444-4444-4444-8444-444444444444'),
          addressType: 'legal',
          line1: 'Invalid Country',
          line2: null,
          postalCode: '1',
          city: 'Test',
          region: null,
          countryCode: 'SER',
          isPrimary: true,
        },
      ],
    };

    await expect(partyRepository.insert(invalidParty)).rejects.toBeDefined();
    expect(await partyRepository.codeExists('PTY-ROLLBACK')).toBe(false);
  });

  it('persists a complete ownership period and rejects an overlapping race at DB level', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777',
      '88888888-8888-4888-8888-888888888888',
      '99999999-9999-4999-8999-999999999999',
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-OWN',
        name: 'Ownership Building',
        propertyType: 'apartment_building',
        street: 'Owner Street',
        houseNumber: '1',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );

    const unit = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-OWN',
        unitNumber: 'OWN-1',
        unitType: 'apartment',
      },
    );

    const ownerA = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-OWN-A',
        partyType: 'person',
        firstName: 'Owner',
        lastName: 'A',
      },
    );

    const ownerB = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-OWN-B',
        partyType: 'company',
        legalName: 'Owner B d.o.o.',
      },
    );

    const period = await createOwnershipPeriodCommand(
      {
        portfolioRepository,
        partyRepository,
        ownershipRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: unit.id,
        validFrom: '2026-01-01',
        owners: [
          { partyId: ownerA.id, shareBasisPoints: 5000 },
          { partyId: ownerB.id, shareBasisPoints: 5000 },
        ],
      },
    );

    expect(
      await listOwnershipPeriodsByUnitQuery(
        { portfolioRepository, ownershipRepository },
        actor,
        unit.id,
      ),
    ).toHaveLength(1);

    const overlapping = createOwnershipPeriod({
      id: asOwnershipPeriodId('bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'),
      unitId: unit.id,
      validFrom: '2026-06-01',
      validTo: '2026-12-31',
      owners: [{ partyId: ownerA.id, shareBasisPoints: 10000 }],
    });

    await expect(ownershipRepository.insert(overlapping)).rejects.toMatchObject({
      code: 'OWNERSHIP_PERIOD_OVERLAP',
    });

    expect(period.owners.map((owner) => owner.shareBasisPoints)).toEqual([5000, 5000]);
  });

  it('separates planned reservation from actual occupancy and hardens tenancy history', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      '21000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000003',
      '21000000-0000-4000-8000-000000000004',
      '21000000-0000-4000-8000-000000000005',
      '21000000-0000-4000-8000-000000000006',
      '21000000-0000-4000-8000-000000000007',
      '21000000-0000-4000-8000-000000000008',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-TEN-INT',
        name: 'Tenancy Integration',
        propertyType: 'apartment_building',
        street: 'Tenancy Street',
        houseNumber: '1',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );

    const unit = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-TEN-INT',
        unitNumber: 'T-1',
        unitType: 'apartment',
      },
    );

    expect(unit.status).toBe('active');

    const tenant = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-TEN-INT',
        partyType: 'person',
        firstName: 'Integration',
        lastName: 'Tenant',
      },
    );

    const currentDraft = await createTenancyCommand(
      {
        tenancyRepository,
        portfolioRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: unit.id,
        code: 'TEN-INT-CURRENT',
        parties: [
          {
            partyId: tenant.id,
            role: 'tenant',
            isPrimary: true,
          },
        ],
      },
    );

    const currentPlanned = await planTenancyCommand(
      { tenancyRepository },
      actor,
      currentDraft.id,
      1,
      '2026-10-01',
      '2027-09-30',
    );

    const successorDraft = await createTenancyCommand(
      {
        tenancyRepository,
        portfolioRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: unit.id,
        code: 'TEN-INT-SUCCESSOR',
        parties: [
          {
            partyId: tenant.id,
            role: 'tenant',
            isPrimary: true,
          },
        ],
      },
    );

    const successorPlanned = await planTenancyCommand(
      { tenancyRepository },
      actor,
      successorDraft.id,
      1,
      '2027-10-01',
      '2028-09-30',
    );

    expect(successorPlanned.status).toBe('planned');

    // A future reservation does not block the tenancy that becomes actual.
    const active = await activateTenancyCommand(
      { tenancyRepository },
      actor,
      currentPlanned.id,
      2,
      '2026-10-01',
    );

    expect(active.status).toBe('active');
    expect(active.version).toBe(3);

    // Once actual occupancy is open-ended, a new reservation cannot be created
    // over it until an actual termination boundary is known.
    const thirdDraft = await createTenancyCommand(
      {
        tenancyRepository,
        portfolioRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: unit.id,
        code: 'TEN-INT-BLOCKED-PLAN',
      },
    );

    await expect(
      planTenancyCommand(
        { tenancyRepository },
        actor,
        thirdDraft.id,
        1,
        '2029-01-01',
        '2029-12-31',
      ),
    ).rejects.toMatchObject({
      code: 'TENANCY_PLANNED_OCCUPANCY_CONFLICT',
    });

    const noticed = await giveTenancyNoticeCommand(
      { tenancyRepository },
      actor,
      active.id,
      3,
      '2027-08-01',
      '2027-09-30',
    );

    expect(noticed.status).toBe('notice_given');

    await expect(
      sql`
        update public.tenancies
        set
          notice_given_at = '2027-09-01',
          termination_effective_at = '2027-08-31'
        where id = ${currentDraft.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancies_termination_not_before_notice',
    });

    // Party composition is frozen after actual occupancy begins, even if SQL
    // bypasses the application/domain layers.
    await expect(
      sql`
        insert into public.tenancy_parties (
          id, tenancy_id, party_id, role, is_primary
        ) values (
          '22000000-0000-4000-8000-000000000001',
          ${currentDraft.id},
          ${tenant.id},
          'co_tenant',
          false
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancy_parties_change_state_guard',
    });

    // Planned reservations remain independently protected from each other.
    const overlappingPlanned = planTenancy(
      createTenancy({
        id: asTenancyId('22000000-0000-4000-8000-000000000002'),
        code: 'TEN-INT-PLAN-OVERLAP',
        unitId: unit.id,
      }),
      '2027-11-01',
      '2028-01-31',
    );

    await expect(
      tenancyRepository.insert(overlappingPlanned),
    ).rejects.toMatchObject({
      code: 'TENANCY_PLANNED_RESERVATION_OVERLAP',
    });

    // Actual occupancy remains independently protected from another actual row.
    await expect(
      sql`
        insert into public.tenancies (
          id, code, unit_id, status, actual_start, version
        ) values (
          '22000000-0000-4000-8000-000000000003',
          'TEN-INT-ACTUAL-OVERLAP',
          ${unit.id},
          'active',
          '2027-09-15',
          1
        )
      `,
    ).rejects.toMatchObject({
      code: '23P01',
      constraint_name: 'tenancies_unit_actual_period_no_overlap',
    });

    const listed = await listTenanciesByUnitQuery(
      { tenancyRepository, portfolioRepository },
      actor,
      unit.id,
    );

    expect(listed).toHaveLength(3);
    expect(listed.find((item) => item.id === currentDraft.id)?.status).toBe('notice_given');
    expect(listed.find((item) => item.id === successorDraft.id)?.status).toBe('planned');
  });

  it('persists immutable lease history and resolves exact terms as-of a date', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      '31000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000002',
      '31000000-0000-4000-8000-000000000003',
      '31000000-0000-4000-8000-000000000004',
      '31000000-0000-4000-8000-000000000005',
      '31000000-0000-4000-8000-000000000006',
      '31000000-0000-4000-8000-000000000007',
      '31000000-0000-4000-8000-000000000008',
      '31000000-0000-4000-8000-000000000009',
      '31000000-0000-4000-8000-000000000010',
      '31000000-0000-4000-8000-000000000011',
      '31000000-0000-4000-8000-000000000012',
      '31000000-0000-4000-8000-000000000013',
      '31000000-0000-4000-8000-000000000014',
      '31000000-0000-4000-8000-000000000015',
      '31000000-0000-4000-8000-000000000016',
      '31000000-0000-4000-8000-000000000017',
      '31000000-0000-4000-8000-000000000018',
      '31000000-0000-4000-8000-000000000019',
      '31000000-0000-4000-8000-000000000020',
      '31000000-0000-4000-8000-000000000021'
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-LEASE-INT',
        name: 'Lease Integration',
        propertyType: 'apartment_building',
        street: 'Contract Street',
        houseNumber: '1',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );

    const unit = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-LEASE-INT',
        unitNumber: 'L-1',
        unitType: 'apartment',
      },
    );

    const tenant = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-LEASE-TENANT',
        partyType: 'person',
        firstName: 'Lease',
        lastName: 'Tenant',
      },
    );

    const landlord = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-LEASE-LANDLORD',
        partyType: 'company',
        legalName: 'Lease Landlord d.o.o.',
      },
    );

    const tenancy = await createTenancyCommand(
      {
        tenancyRepository,
        portfolioRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: unit.id,
        code: 'TEN-LEASE-INT',
        parties: [
          {
            partyId: tenant.id,
            role: 'tenant',
            isPrimary: true,
          },
        ],
      },
    );

    const agreement = await createLeaseAgreementCommand(
      {
        leaseRepository,
        tenancyRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        tenancyId: tenancy.id,
        code: 'AGR-LEASE-INT',
        agreementType: 'initial',
        effectiveFrom: '2026-10-01',
        effectiveTo: '2027-09-30',
        parties: [
          { partyId: landlord.id, role: 'landlord' },
          { partyId: tenant.id, role: 'tenant' },
        ],
      },
    );

    const signed = await signLeaseAgreementCommand(
      {
        leaseRepository,
        tenancyRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      agreement.id,
      1,
      '2026-09-20',
      {
        currency: 'EUR',
        baseRent: '850.50',
        serviceCharge: '120',
        depositRequired: '1700',
        noticePeriodTenantDays: 90,
        noticePeriodLandlordDays: 90,
      },
    );

    expect(signed.status).toBe('signed');

    const beforeAmendment = await getEffectiveTenancyTermsQuery(
      { leaseRepository, tenancyRepository },
      actor,
      tenancy.id,
      '2027-03-31',
    );
    expect(beforeAmendment.baseRent).toBe('850.50');
    expect(beforeAmendment.serviceCharge).toBe('120.00');

    const amendment = await createLeaseAmendmentCommand(
      { leaseRepository, idGenerator: ids },
      actor,
      {
        agreementId: agreement.id,
        code: 'AMD-LEASE-INT',
        title: 'Rent adjustment',
        effectiveFrom: '2027-04-01',
      },
    );

    await signLeaseAmendmentCommand(
      {
        leaseRepository,
        tenancyRepository,
        idGenerator: ids,
      },
      actor,
      amendment.id,
      1,
      '2027-03-15',
      {
        currency: 'EUR',
        baseRent: '900',
        serviceCharge: '120',
        depositRequired: '1700',
        noticePeriodTenantDays: 90,
        noticePeriodLandlordDays: 90,
      },
    );

    const stillOld = await getEffectiveTenancyTermsQuery(
      { leaseRepository, tenancyRepository },
      actor,
      tenancy.id,
      '2027-03-31',
    );
    const changed = await getEffectiveTenancyTermsQuery(
      { leaseRepository, tenancyRepository },
      actor,
      tenancy.id,
      '2027-04-01',
    );

    expect(stillOld.baseRent).toBe('850.50');
    expect(changed.baseRent).toBe('900.00');
    expect(changed.sourceType).toBe('amendment');

    await expect(
      getEffectiveTenancyTermsQuery(
        { leaseRepository, tenancyRepository },
        actor,
        tenancy.id,
        '2030-01-01',
      ),
    ).rejects.toMatchObject({
      code: 'TENANCY_TERMS_NOT_FOUND',
    });

    await expect(
      sql`
        update public.lease_agreements
        set code = 'ILLEGAL-REWRITE'
        where id = ${agreement.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'lease_agreements_signed_content_immutable',
    });

    await expect(
      sql`
        insert into public.lease_agreement_parties (
          id, agreement_id, party_id, role
        ) values (
          '32000000-0000-4000-8000-000000000001',
          ${agreement.id},
          ${landlord.id},
          'authorized_signatory'
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'lease_agreement_parties_signed_immutable',
    });

    await expect(
      sql`
        update public.tenancy_term_versions
        set base_rent = 1
        where tenancy_id = ${tenancy.id}
          and effective_from = '2026-10-01'
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancy_term_versions_immutable',
    });

    await sql`
      insert into public.tenancies (
        id, code, unit_id, status, version
      ) values (
        '32000000-0000-4000-8000-000000000002',
        'TEN-SOURCE-MISMATCH',
        ${unit.id},
        'draft',
        1
      )
    `;

    await expect(
      sql`
        insert into public.tenancy_term_versions (
          id, tenancy_id, source_type, source_agreement_id,
          effective_from, currency, base_rent
        ) values (
          '32000000-0000-4000-8000-000000000003',
          '32000000-0000-4000-8000-000000000002',
          'agreement',
          ${agreement.id},
          '2026-10-01',
          'EUR',
          1
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancy_term_versions_source_tenancy_match',
    });

    const conflictingAgreement = await createLeaseAgreementCommand(
      {
        leaseRepository,
        tenancyRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        tenancyId: tenancy.id,
        code: 'AGR-LEASE-CONFLICT',
        agreementType: 'replacement',
        predecessorAgreementId: agreement.id,
        effectiveFrom: '2027-04-01',
        parties: [
          { partyId: landlord.id, role: 'landlord' },
          { partyId: tenant.id, role: 'tenant' },
        ],
      },
    );

    await expect(
      sql`
        insert into public.lease_agreements (
          id, tenancy_id, code, agreement_type, predecessor_agreement_id,
          effective_from, status, version
        ) values (
          '32000000-0000-4000-8000-000000000020',
          ${tenancy.id},
          'AGR-SECOND-LIVE-SUCCESSOR',
          'renewal',
          ${agreement.id},
          '2027-06-01',
          'draft',
          1
        )
      `,
    ).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'lease_agreements_one_successor_per_predecessor_uq',
    });

    await expect(
      sql`
        insert into public.tenancy_term_versions (
          id, tenancy_id, source_type, source_agreement_id,
          effective_from, currency, base_rent
        ) values (
          '32000000-0000-4000-8000-000000000021',
          ${tenancy.id},
          'agreement',
          ${conflictingAgreement.id},
          '2027-04-01',
          'EUR',
          999
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancy_term_versions_source_not_signed',
    });

    await expect(
      signLeaseAgreementCommand(
        {
          leaseRepository,
          tenancyRepository,
          partyRepository,
          idGenerator: ids,
        },
        actor,
        conflictingAgreement.id,
        1,
        '2027-03-20',
        {
          currency: 'EUR',
          baseRent: '999',
        },
      ),
    ).rejects.toMatchObject({
      code: 'TENANCY_TERM_EFFECTIVE_DATE_CONFLICT',
    });

    expect(
      (await leaseRepository.getAgreementById(conflictingAgreement.id))?.status,
    ).toBe('draft');
    expect(
      (await leaseRepository.getAgreementById(agreement.id))?.status,
    ).toBe('signed');

    await cancelLeaseAgreementCommand(
      { leaseRepository },
      actor,
      conflictingAgreement.id,
      1,
    );

    const successor = await createLeaseAgreementCommand(
      {
        leaseRepository,
        tenancyRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        tenancyId: tenancy.id,
        code: 'AGR-LEASE-SUCCESSOR',
        agreementType: 'replacement',
        predecessorAgreementId: agreement.id,
        effectiveFrom: '2027-05-01',
        effectiveTo: '2028-04-30',
        parties: [
          { partyId: landlord.id, role: 'landlord' },
          { partyId: tenant.id, role: 'tenant' },
        ],
      },
    );

    await signLeaseAgreementCommand(
      {
        leaseRepository,
        tenancyRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      successor.id,
      1,
      '2027-04-15',
      {
        currency: 'EUR',
        baseRent: '950',
        serviceCharge: '120',
        depositRequired: '1700',
        noticePeriodTenantDays: 90,
        noticePeriodLandlordDays: 90,
      },
    );

    expect(
      (await leaseRepository.getAgreementById(agreement.id))?.status,
    ).toBe('superseded');
    expect(
      (await leaseRepository.getAgreementById(successor.id))?.status,
    ).toBe('signed');

    const beforeSuccessor = await getEffectiveTenancyTermsQuery(
      { leaseRepository, tenancyRepository },
      actor,
      tenancy.id,
      '2027-04-30',
    );
    const afterSuccessor = await getEffectiveTenancyTermsQuery(
      { leaseRepository, tenancyRepository },
      actor,
      tenancy.id,
      '2027-05-01',
    );

    expect(beforeSuccessor.baseRent).toBe('900.00');
    expect(afterSuccessor.baseRent).toBe('950.00');

    await expect(
      getEffectiveTenancyTermsQuery(
        { leaseRepository, tenancyRepository },
        actor,
        tenancy.id,
        '2028-05-01',
      ),
    ).rejects.toMatchObject({
      code: 'TENANCY_TERMS_NOT_FOUND',
    });

    await expect(
      sql`
        insert into public.lease_agreements (
          id, tenancy_id, code, agreement_type, predecessor_agreement_id,
          effective_from, status, version
        ) values (
          '32000000-0000-4000-8000-000000000010',
          '32000000-0000-4000-8000-000000000002',
          'AGR-CROSS-TENANCY',
          'replacement',
          ${successor.id},
          '2028-06-01',
          'draft',
          1
        )
      `,
    ).rejects.toMatchObject({
      code: '23503',
      constraint_name: 'lease_agreements_predecessor_same_tenancy_fk',
    });
  });

  it('persists inspection evidence, controlled unlock, final snapshot and derived report', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      'a1000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000003',
      'a1000000-0000-4000-8000-000000000004',
      'a1000000-0000-4000-8000-000000000005',
      'a1000000-0000-4000-8000-000000000006',
      'a1000000-0000-4000-8000-000000000007',
      'a1000000-0000-4000-8000-000000000008',
      'a1000000-0000-4000-8000-000000000009',
      'a1000000-0000-4000-8000-000000000010',
      'a1000000-0000-4000-8000-000000000011',
      'a1000000-0000-4000-8000-000000000012',
      'a1000000-0000-4000-8000-000000000013',
      'a1000000-0000-4000-8000-000000000014',
      'a1000000-0000-4000-8000-000000000015',
      'a1000000-0000-4000-8000-000000000016',
      'a1000000-0000-4000-8000-000000000017',
      'a1000000-0000-4000-8000-000000000018',
      'a1000000-0000-4000-8000-000000000019',
      'a1000000-0000-4000-8000-000000000020',
      'a1000000-0000-4000-8000-000000000021',
      'a1000000-0000-4000-8000-000000000022',
      'a1000000-0000-4000-8000-000000000023',
      'a1000000-0000-4000-8000-000000000024',
      'a1000000-0000-4000-8000-000000000025',
      'a1000000-0000-4000-8000-000000000026',
      'a1000000-0000-4000-8000-000000000027',
      'a1000000-0000-4000-8000-000000000028',
      'a1000000-0000-4000-8000-000000000029',
      'a1000000-0000-4000-8000-000000000030',
    ]);

    const schema = await createInspectionSchemaVersionCommand(
      { inspectionRepository, idGenerator: ids },
      actor,
      {
        schemaCode: 'MOVE-IN-EVIDENCE',
        inspectionType: 'move_in',
        title: 'Move-in evidence flow',
        requiredSignatureRoles: ['landlord', 'tenant'],
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
      },
    );
    const published = await publishInspectionSchemaVersionCommand(
      inspectionRepository,
      actor,
      schema.id,
    );
    expect(published.requiredSignatureRoles).toEqual(['landlord', 'tenant']);

    await expect(
      sql`
        update public.inspection_schema_versions
        set required_signature_roles = array['landlord']::text[]
        where id = ${published.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_schema_version_immutable',
    });

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-EVIDENCE',
        name: 'Evidence Property',
        propertyType: 'apartment_building',
        street: 'Evidence',
        houseNumber: '13',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );
    const unit = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-EVIDENCE',
        unitNumber: 'E-1',
        unitType: 'apartment',
      },
    );

    const landlordPartyId = 'a4000000-0000-4000-8000-000000000001';
    const tenantPartyId = 'a4000000-0000-4000-8000-000000000002';
    const outsiderPartyId = 'a4000000-0000-4000-8000-000000000003';
    const tenancyId = 'a5000000-0000-4000-8000-000000000001';

    await sql`
      insert into public.parties (
        id, code, party_type, display_name, first_name, last_name, status
      ) values
        (${landlordPartyId}, 'P-EVIDENCE-LANDLORD', 'person', 'Landlord Owner', 'Landlord', 'Owner', 'active'),
        (${tenantPartyId}, 'P-EVIDENCE-TENANT', 'person', 'Tenant Occupant', 'Tenant', 'Occupant', 'active'),
        (${outsiderPartyId}, 'P-EVIDENCE-OUTSIDER', 'person', 'Outsider', 'Outside', 'Person', 'active')
    `;
    await sql`
      insert into public.unit_ownership_periods (id, unit_id, valid_from)
      values ('a4100000-0000-4000-8000-000000000001', ${unit.id}, '2026-01-01')
    `;
    await sql`
      insert into public.unit_ownership_shares (
        ownership_period_id, party_id, share_basis_points
      ) values (
        'a4100000-0000-4000-8000-000000000001',
        ${landlordPartyId},
        10000
      )
    `;
    await sql`
      insert into public.tenancies (
        id, code, unit_id, status, planned_start, version
      ) values (
        ${tenancyId}, 'TEN-EVIDENCE', ${unit.id}, 'planned', '2026-09-01', 1
      )
    `;
    await sql`
      insert into public.tenancy_parties (
        id, tenancy_id, party_id, role, is_primary
      ) values (
        'a5100000-0000-4000-8000-000000000001',
        ${tenancyId}, ${tenantPartyId}, 'tenant', true
      )
    `;

    const inspection = await createInspectionCommand(
      {
        inspectionRepository,
        portfolioRepository,
        tenancyRepository,
        staffDirectoryRepository: accessRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-21T08:00:00.000Z' },
      },
      actor,
      {
        code: 'INS-EVIDENCE',
        inspectionType: 'move_in',
        unitId: unit.id,
        tenancyId: asTenancyId(tenancyId),
        schemaVersionId: published.id,
        assignedToUserId:
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as import('@portfolio/domain').UserId,
      },
    );

    const started = await startInspectionCommand(
      {
        inspectionRepository,
        clock: { now: () => '2026-09-21T08:05:00.000Z' },
      },
      actor,
      inspection.id,
      1,
    );

    const section = published.sections[0]!;
    const item = section.items[0]!;
    await saveInspectionSectionCommand(
      {
        inspectionRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-21T08:10:00.000Z' },
      },
      actor,
      inspection.id,
      section.id,
      0,
      {
        set: [{ itemId: item.id, value: 'Good' }],
        clearItemIds: [],
      },
    );

    // Exact immutable document versions used by photo/signature evidence.
    await sql`
      insert into public.documents (
        id, code, title, category, status, latest_version_number, revision
      ) values
        ('a2000000-0000-4000-8000-000000000001', 'DOC-EVIDENCE-PHOTO', 'Photo', 'photo', 'active', 1, 2),
        ('a2000000-0000-4000-8000-000000000002', 'DOC-EVIDENCE-LANDLORD-1', 'Landlord signature 1', 'signature', 'active', 1, 2),
        ('a2000000-0000-4000-8000-000000000003', 'DOC-EVIDENCE-LANDLORD-2', 'Landlord signature 2', 'signature', 'active', 1, 2),
        ('a2000000-0000-4000-8000-000000000004', 'DOC-EVIDENCE-TENANT', 'Tenant signature', 'signature', 'active', 1, 2)
    `;
    await sql`
      insert into public.document_versions (
        id, document_id, version_number, file_name, mime_type,
        byte_size, sha256, status, finalized_at,
        storage_provider, storage_object_id, storage_object_key
      ) values
        (
          'a3000000-0000-4000-8000-000000000001',
          'a2000000-0000-4000-8000-000000000001',
          1, 'photo.jpg', 'image/jpeg', 10, ${'1'.repeat(64)},
          'final', '2026-09-21T08:11:00.000Z',
          'test', 'photo-1', 'photo-key-1'
        ),
        (
          'a3000000-0000-4000-8000-000000000002',
          'a2000000-0000-4000-8000-000000000002',
          1, 'landlord-1.png', 'image/png', 10, ${'2'.repeat(64)},
          'final', '2026-09-21T08:12:00.000Z',
          'test', 'sig-landlord-1', 'sig-key-landlord-1'
        ),
        (
          'a3000000-0000-4000-8000-000000000003',
          'a2000000-0000-4000-8000-000000000003',
          1, 'landlord-2.png', 'image/png', 10, ${'3'.repeat(64)},
          'final', '2026-09-21T08:13:00.000Z',
          'test', 'sig-landlord-2', 'sig-key-landlord-2'
        ),
        (
          'a3000000-0000-4000-8000-000000000004',
          'a2000000-0000-4000-8000-000000000004',
          1, 'tenant.png', 'image/png', 10, ${'4'.repeat(64)},
          'final', '2026-09-21T08:14:00.000Z',
          'test', 'sig-tenant', 'sig-key-tenant'
        )
    `;

    const evidenceBinaries = new Map([
      ['photo-1', { byteSize: 10, sha256: '1111111111111111111111111111111111111111111111111111111111111111' }],
      ['sig-landlord-1', { byteSize: 10, sha256: '2222222222222222222222222222222222222222222222222222222222222222' }],
      ['sig-landlord-2', { byteSize: 10, sha256: '3333333333333333333333333333333333333333333333333333333333333333' }],
      ['sig-tenant', { byteSize: 10, sha256: '4444444444444444444444444444444444444444444444444444444444444444' }],
    ]);
    const evidenceFileStorage = {
      async put() {
        throw new Error('not used by seeded inspection evidence');
      },
      async stat(reference: import('@portfolio/application').StorageObjectReference) {
        const metadata = evidenceBinaries.get(reference.objectId);
        return metadata ? { ...reference, ...metadata } : null;
      },
      async remove() {},
    };

    const evidence = await attachInspectionEvidenceCommand(
      {
        inspectionRepository,
        documentRepository,
        fileStorage: evidenceFileStorage,
        idGenerator: ids,
        clock: { now: () => '2026-09-21T08:15:00.000Z' },
      },
      actor,
      inspection.id,
      {
        documentVersionId: 'a3000000-0000-4000-8000-000000000001',
        kind: 'photo',
        sectionId: section.id,
        itemId: item.id,
        caption: 'Entrance condition',
      },
    );
    expect(evidence.documentVersionId).toBe(
      'a3000000-0000-4000-8000-000000000001',
    );

    const beforeLock = (await inspectionRepository.getById(inspection.id))!;
    const locked = await lockInspectionCommand(
      {
        inspectionRepository,
        clock: { now: () => '2026-09-21T08:20:00.000Z' },
      },
      actor,
      inspection.id,
      beforeLock.version,
    );

    await expect(
      attachInspectionEvidenceCommand(
        {
          inspectionRepository,
          documentRepository,
          fileStorage: evidenceFileStorage,
          idGenerator: ids,
          clock: { now: () => '2026-09-21T08:21:00.000Z' },
        },
        actor,
        inspection.id,
        {
          documentVersionId: 'a3000000-0000-4000-8000-000000000001',
          kind: 'photo',
        },
      ),
    ).rejects.toMatchObject({ code: 'INSPECTION_CONTENT_LOCKED' });

    const landlord1 = await addInspectionSignatureCommand(
      {
        inspectionRepository,
        documentRepository,
        fileStorage: evidenceFileStorage,
        partyRepository,
        ownershipRepository,
        tenancyRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-21T08:25:00.000Z' },
      },
      actor,
      inspection.id,
      {
        signerRole: 'landlord',
        signerPartyId: landlordPartyId,
        signerName: 'Landlord Representative',
        signatureDocumentVersionId: 'a3000000-0000-4000-8000-000000000002',
      },
    );
    expect(landlord1.invalidatedAt).toBeNull();

    await expect(
      addInspectionSignatureCommand(
        {
          inspectionRepository,
          documentRepository,
          fileStorage: evidenceFileStorage,
          partyRepository,
          ownershipRepository,
          tenancyRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-21T08:25:10.000Z' },
        },
        actor,
        inspection.id,
        {
          signerRole: 'witness',
          signerName: 'Witness',
          signatureDocumentVersionId: 'a3000000-0000-4000-8000-000000000001',
        },
      ),
    ).rejects.toMatchObject({
      code: 'INSPECTION_SIGNATURE_DOCUMENT_CATEGORY_INVALID',
    });

    await expect(
      sql`
        insert into public.inspection_signatures (
          id, inspection_id, signer_role, signer_name,
          signature_document_version_id, signed_by_user_id, signed_at
        ) values (
          'a6100000-0000-4000-8000-000000000002',
          ${inspection.id}, 'witness', 'Witness',
          'a3000000-0000-4000-8000-000000000001',
          ${actor.userId}, '2026-09-21T08:25:20.000Z'
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_signature_document_category_invalid',
    });

    await expect(
      addInspectionSignatureCommand(
        {
          inspectionRepository,
          documentRepository,
          fileStorage: evidenceFileStorage,
          partyRepository,
          ownershipRepository,
          tenancyRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-21T08:25:30.000Z' },
        },
        actor,
        inspection.id,
        {
          signerRole: 'tenant',
          signerPartyId: outsiderPartyId,
          signerName: 'Outsider',
          signatureDocumentVersionId: 'a3000000-0000-4000-8000-000000000004',
        },
      ),
    ).rejects.toMatchObject({
      code: 'INSPECTION_SIGNATURE_TENANT_PARTY_MISMATCH',
    });

    await expect(
      sql`
        insert into public.inspection_signatures (
          id, inspection_id, signer_role, signer_party_id, signer_name,
          signature_document_version_id, signed_by_user_id, signed_at
        ) values (
          'a6100000-0000-4000-8000-000000000001',
          ${inspection.id}, 'tenant', ${outsiderPartyId}, 'Outsider',
          'a3000000-0000-4000-8000-000000000004',
          ${actor.userId}, '2026-09-21T08:26:00.000Z'
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_signature_tenant_party_mismatch',
    });

    await expect(
      finalizeInspectionCommand(
        {
          inspectionRepository,
          documentRepository,
          fileStorage: evidenceFileStorage,
          idGenerator: ids,
          clock: { now: () => '2026-09-21T08:30:00.000Z' },
        },
        actor,
        inspection.id,
        locked.version,
      ),
    ).rejects.toMatchObject({
      code: 'INSPECTION_REQUIRED_SIGNATURES_MISSING',
    });

    const beforeUnlock = (await inspectionRepository.getById(inspection.id))!;

    await expect(
      sql`
        update public.inspections
        set status = 'in_progress',
            locked_at = null,
            version = version + 1,
            content_revision = content_revision + 1
        where id = ${inspection.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_unlock_record_required',
    });

    await expect(
      sql.begin(async (tx) => {
        await tx`
          insert into public.inspection_unlocks (
            id, inspection_id, unlocked_by_user_id, unlocked_at, reason,
            previous_locked_at, previous_version, previous_content_revision,
            new_version, new_content_revision
          ) values (
            'a6200000-0000-4000-8000-000000000001',
            ${inspection.id}, ${actor.userId},
            '2026-09-21T08:34:00.000Z',
            'Attempt unlock without invalidating signatures',
            ${beforeUnlock.lockedAt}, ${beforeUnlock.version},
            ${beforeUnlock.contentRevision},
            ${beforeUnlock.version + 1},
            ${beforeUnlock.contentRevision + 1}
          )
        `;

        await tx`
          update public.inspections
          set status = 'in_progress',
              locked_at = null,
              version = version + 1,
              content_revision = content_revision + 1
          where id = ${inspection.id}
        `;
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_unlock_active_signatures',
    });

    const unlocked = await unlockInspectionCommand(
      {
        inspectionRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-21T08:35:00.000Z' },
      },
      actor,
      inspection.id,
      beforeUnlock.version,
      'Correct handover details',
    );
    expect(unlocked.status).toBe('in_progress');

    const signaturesAfterUnlock =
      await inspectionRepository.listSignatures(inspection.id);
    expect(signaturesAfterUnlock).toHaveLength(1);
    expect(signaturesAfterUnlock[0]).toMatchObject({
      signerRole: 'landlord',
      invalidatedAt: '2026-09-21T08:35:00.000Z',
      invalidationReason: 'Correct handover details',
    });

    const relocked = await lockInspectionCommand(
      {
        inspectionRepository,
        clock: { now: () => '2026-09-21T08:40:00.000Z' },
      },
      actor,
      inspection.id,
      unlocked.version,
    );

    await addInspectionSignatureCommand(
      {
        inspectionRepository,
        documentRepository,
        fileStorage: evidenceFileStorage,
        partyRepository,
        ownershipRepository,
        tenancyRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-21T08:45:00.000Z' },
      },
      actor,
      inspection.id,
      {
        signerRole: 'landlord',
        signerPartyId: landlordPartyId,
        signerName: 'Landlord Representative',
        signatureDocumentVersionId: 'a3000000-0000-4000-8000-000000000003',
      },
    );
    await addInspectionSignatureCommand(
      {
        inspectionRepository,
        documentRepository,
        fileStorage: evidenceFileStorage,
        partyRepository,
        ownershipRepository,
        tenancyRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-21T08:46:00.000Z' },
      },
      actor,
      inspection.id,
      {
        signerRole: 'tenant',
        signerPartyId: tenantPartyId,
        signerName: 'Tenant',
        signatureDocumentVersionId: 'a3000000-0000-4000-8000-000000000004',
      },
    );

    await expect(
      sql`
        update public.inspections
        set status = 'finalized',
            finalized_at = '2026-09-21T08:50:00.000Z',
            version = version + 1
        where id = ${inspection.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_final_snapshot_required',
    });

    const beforeFinalize = (await inspectionRepository.getById(inspection.id))!;
    const finalized = await finalizeInspectionCommand(
      {
        inspectionRepository,
        documentRepository,
        fileStorage: evidenceFileStorage,
        idGenerator: ids,
        clock: { now: () => '2026-09-21T08:50:00.000Z' },
      },
      actor,
      inspection.id,
      beforeFinalize.version,
    );
    expect(finalized.inspection.status).toBe('finalized');
    expect(finalized.snapshot.payload.evidence).toHaveLength(1);
    expect(finalized.snapshot.payload.evidence[0]).toMatchObject({
      documentVersion: {
        id: 'a3000000-0000-4000-8000-000000000001',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        byteSize: 10,
        sha256: '1111111111111111111111111111111111111111111111111111111111111111',
      },
    });
    expect(
      finalized.snapshot.payload.signatures.map(
        (item) => item.signature.signerRole,
      ),
    ).toEqual(['landlord', 'landlord', 'tenant']);
    expect(
      finalized.snapshot.payload.signatures.map(
        (item) => item.signature.invalidatedAt !== null,
      ),
    ).toEqual([true, false, false]);
    expect(finalized.snapshot.payload.unlockHistory).toHaveLength(1);
    expect(finalized.snapshot.payload.unlockHistory[0]).toMatchObject({
      reason: 'Correct handover details',
      previousVersion: beforeUnlock.version,
      newVersion: unlocked.version,
    });

    await expect(
      sql`
        update public.inspection_final_snapshots
        set content_revision = content_revision + 1
        where inspection_id = ${inspection.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_final_snapshot_immutable',
    });

    await expect(
      sql`
        insert into public.inspection_evidence (
          id, inspection_id, schema_version_id, document_version_id,
          kind, created_by_user_id, created_at
        ) values (
          'a6200000-0000-4000-8000-000000000001',
          ${inspection.id}, ${published.id},
          'a3000000-0000-4000-8000-000000000001',
          'final_report', ${actor.userId}, '2026-09-21T08:55:00.000Z'
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_final_report_document_category_invalid',
    });

    let renderCalls = 0;
    let releaseRenderRace!: () => void;
    const bothRendered = new Promise<void>((resolve) => {
      releaseRenderRace = resolve;
    });
    const pdfPort = {
      async renderInspectionFinalReport(
        snapshot: import('@portfolio/domain').InspectionFinalSnapshot,
      ) {
        renderCalls += 1;
        expect(snapshot.inspectionId).toBe(inspection.id);
        if (renderCalls === 2) releaseRenderRace();
        await bothRendered;
        return {
          fileName: 'inspection-final.pdf',
          content: new Uint8Array([37, 80, 68, 70, 45, 49]),
        };
      },
    };
    const reportObjects = new Set<string>();
    const fileStorage = {
      async put(input: {
        objectKey: string;
        content: Uint8Array;
      }) {
        reportObjects.add(input.objectKey);
        return {
          provider: 'report-test',
          objectId: input.objectKey,
          objectKey: input.objectKey,
          byteSize: input.content.byteLength,
          sha256: 'f'.repeat(64),
          disposition: 'created' as const,
        };
      },
      async stat(reference: import('@portfolio/application').StorageObjectReference) {
        if (!reportObjects.has(reference.objectKey)) return null;
        return {
          ...reference,
          byteSize: 6,
          sha256: 'f'.repeat(64),
        };
      },
      async remove(reference: import('@portfolio/application').StorageObjectReference) {
        reportObjects.delete(reference.objectKey);
      },
    };

    const [reportVersion, concurrentReportVersion] = await Promise.all([
      generateInspectionFinalReportCommand(
        {
          inspectionRepository,
          documentRepository,
          fileStorage,
          pdfPort,
          idGenerator: ids,
          clock: { now: () => '2026-09-21T09:00:00.000Z' },
        },
        actor,
        inspection.id,
      ),
      generateInspectionFinalReportCommand(
        {
          inspectionRepository,
          documentRepository,
          fileStorage,
          pdfPort,
          idGenerator: ids,
          clock: { now: () => '2026-09-21T09:00:00.000Z' },
        },
        actor,
        inspection.id,
      ),
    ]);

    expect(reportVersion).toMatchObject({
      status: 'final',
      mimeType: 'application/pdf',
    });
    expect(concurrentReportVersion.id).toBe(reportVersion.id);
    expect(renderCalls).toBe(2);
    expect(reportObjects.size).toBe(1);

    const reportDocuments = await sql<{ id: string }[]>`
      select id
      from public.documents
      where code = ${`INSPECTION-FINAL-${inspection.id}`}
    `;
    expect(reportDocuments).toHaveLength(1);
    const reportVersions = await sql<{ id: string }[]>`
      select id
      from public.document_versions
      where document_id = ${reportDocuments[0]!.id}
    `;
    expect(reportVersions).toHaveLength(1);

    const reportAgain = await generateInspectionFinalReportCommand(
      {
        inspectionRepository,
        documentRepository,
        fileStorage,
        pdfPort,
        idGenerator: ids,
        clock: { now: () => '2026-09-21T09:01:00.000Z' },
      },
      actor,
      inspection.id,
    );
    expect(reportAgain.id).toBe(reportVersion.id);
    expect(renderCalls).toBe(2);

    const allEvidence = await inspectionRepository.listEvidence(inspection.id);
    expect(allEvidence.map((item) => item.kind)).toEqual([
      'photo',
      'final_report',
    ]);
  });

  it('enforces relational ownership independently of application code', async () => {
    await expect(
      sql`
        insert into public.units (
          id, property_id, code, unit_number, unit_type, status
        ) values (
          '3b601fff-4dad-47be-b2fe-b84553c7840f',
          '11111111-1111-1111-1111-111111111111',
          'UNIT-ORPHAN',
          'X',
          'apartment',
          'active'
        )
      `,
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('translates database uniqueness races to a stable domain error', async () => {
    await expect(
      portfolioRepository.insertProperty({
        id: 'a1e4962e-7023-47f4-85d2-c10071397dbf' as never,
        code: 'prop-0001',
        name: 'Duplicate',
        propertyType: 'house',
        street: 'Other Street',
        houseNumber: '1',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
        yearBuilt: null,
        status: 'active',
      }),
    ).rejects.toMatchObject({ code: 'PROPERTY_CODE_ALREADY_EXISTS' });
  });

  it('persists immutable document evidence and DB-enforces signed originals', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      '61000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000002',
      '61000000-0000-4000-8000-000000000003',
      '61000000-0000-4000-8000-000000000004',
      '61000000-0000-4000-8000-000000000005',
      '61000000-0000-4000-8000-000000000006',
      '61000000-0000-4000-8000-000000000007',
      '61000000-0000-4000-8000-000000000008',
      '61000000-0000-4000-8000-000000000009',
      '61000000-0000-4000-8000-000000000010',
      '61000000-0000-4000-8000-000000000011',
      '61000000-0000-4000-8000-000000000012',
      '61000000-0000-4000-8000-000000000013',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-DOC-INT',
        name: 'Document Integration',
        propertyType: 'apartment_building',
        street: 'Evidence Street',
        houseNumber: '1',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );

    const unit = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-DOC-INT',
        unitNumber: 'D-1',
        unitType: 'apartment',
      },
    );

    const tenant = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-DOC-TENANT',
        partyType: 'person',
        firstName: 'Document',
        lastName: 'Tenant',
      },
    );

    const landlord = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-DOC-LANDLORD',
        partyType: 'company',
        legalName: 'Document Landlord d.o.o.',
      },
    );

    const tenancy = await createTenancyCommand(
      {
        tenancyRepository,
        portfolioRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: unit.id,
        code: 'TEN-DOC-INT',
        parties: [{
          partyId: tenant.id,
          role: 'tenant',
          isPrimary: true,
        }],
      },
    );

    const agreement = await createLeaseAgreementCommand(
      {
        leaseRepository,
        tenancyRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        tenancyId: tenancy.id,
        code: 'AGR-DOC-INT',
        agreementType: 'initial',
        effectiveFrom: '2026-10-01',
        parties: [
          { partyId: landlord.id, role: 'landlord' },
          { partyId: tenant.id, role: 'tenant' },
        ],
      },
    );

    await signLeaseAgreementCommand(
      {
        leaseRepository,
        tenancyRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      agreement.id,
      1,
      '2026-09-20',
      { currency: 'EUR', baseRent: '800' },
    );

    const document = await createDocumentCommand(
      { documentRepository, idGenerator: ids },
      actor,
      {
        code: 'DOC-DOC-INT',
        title: 'Signed lease original',
        category: 'legal',
      },
    );

    const fileStorage = {
      async put(input: {
        objectKey: string;
        content: Uint8Array;
      }) {
        return {
          provider: 'integration-test',
          objectId: 'object-1',
          objectKey: input.objectKey,
          byteSize: input.content.byteLength,
          sha256: 'b'.repeat(64),
          disposition: 'created' as const,
        };
      },
      async stat(reference: import('@portfolio/application').StorageObjectReference) {
        return {
          ...reference,
          byteSize: 4,
          sha256: 'b'.repeat(64),
        };
      },
      async remove() {},
    };

    const version = await uploadDocumentVersionCommand(
      {
        documentRepository,
        fileStorage,
        idGenerator: ids,
      },
      actor,
      {
        documentId: document.id,
        fileName: 'signed-lease.pdf',
        mimeType: 'application/pdf',
        content: new Uint8Array([1, 2, 3, 4]),
      },
    );

    expect(version.status).toBe('stored');
    expect(
      await documentRepository.getStorageReference(version.id),
    ).toEqual({
      provider: 'integration-test',
      objectId: 'object-1',
      objectKey: `document-version:${version.id}`,
    });

    await expect(
      sql`
        insert into public.document_links (
          id, document_id, document_version_id, relation, target_type,
          lease_agreement_id
        ) values (
          '62000000-0000-4000-8000-000000000001',
          ${document.id},
          ${version.id},
          'signed_original',
          'lease_agreement',
          ${agreement.id}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'document_links_signed_original_version_final',
    });

    await expect(
      finalizeDocumentVersionCommand(
        {
          documentRepository,
          fileStorage: {
            ...fileStorage,
            async stat() { return null; },
          },
          clock: {
            now: () => '2026-09-20T11:59:00.000Z',
          },
        },
        actor,
        version.id,
      ),
    ).rejects.toMatchObject({ code: 'DOCUMENT_BINARY_MISSING' });

    const final = await finalizeDocumentVersionCommand(
      {
        documentRepository,
        fileStorage,
        clock: {
          now: () => '2026-09-20T12:00:00.000Z',
        },
      },
      actor,
      version.id,
    );
    expect(final.status).toBe('final');

    const link = await linkDocumentCommand(
      {
        documentRepository,
        portfolioRepository,
        partyRepository,
        tenancyRepository,
        leaseRepository,
        idGenerator: ids,
      },
      actor,
      {
        documentId: document.id,
        documentVersionId: final.id,
        relation: 'signed_original',
        targetType: 'lease_agreement',
        targetId: agreement.id,
      },
    );

    expect(link.relation).toBe('signed_original');

    await expect(
      sql`
        update public.document_links
        set relation = 'supporting'
        where id = ${link.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'document_links_signed_original_immutable',
    });

    await expect(
      sql`
        delete from public.document_links
        where id = ${link.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'document_links_signed_original_immutable',
    });

    await expect(
      sql`
        update public.document_versions
        set file_name = 'rewritten.pdf'
        where id = ${version.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'document_versions_content_immutable',
    });

    await expect(
      sql`
        delete from public.document_versions
        where id = ${version.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'document_versions_append_only',
    });

    await sql`
      insert into public.documents (
        id, code, title, category, status, latest_version_number, revision
      ) values (
        '62000000-0000-4000-8000-000000000100',
        'DOC-SECOND-SIGNED-ORIGINAL',
        'Second signed original candidate',
        'legal',
        'active',
        1,
        2
      )
    `;

    await sql`
      insert into public.document_versions (
        id, document_id, version_number, file_name, mime_type,
        byte_size, sha256, status, finalized_at,
        storage_provider, storage_object_id, storage_object_key
      ) values (
        '62000000-0000-4000-8000-000000000101',
        '62000000-0000-4000-8000-000000000100',
        1,
        'second.pdf',
        'application/pdf',
        5,
        ${'e'.repeat(64)},
        'final',
        '2026-09-20T12:30:00.000Z',
        'integration-test',
        'object-second',
        'document-version:second'
      )
    `;

    await expect(
      sql`
        insert into public.document_links (
          id, document_id, document_version_id, relation, target_type,
          lease_agreement_id
        ) values (
          '62000000-0000-4000-8000-000000000102',
          '62000000-0000-4000-8000-000000000100',
          '62000000-0000-4000-8000-000000000101',
          'signed_original',
          'lease_agreement',
          ${agreement.id}
        )
      `,
    ).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'document_links_signed_agreement_uq',
    });

    await expect(
      sql`
        insert into public.document_links (
          id, document_id, relation, target_type, property_id
        ) values (
          '62000000-0000-4000-8000-000000000003',
          ${document.id},
          'supporting',
          'property',
          'ffffffff-ffff-4fff-8fff-ffffffffffff'
        )
      `,
    ).rejects.toMatchObject({
      code: '23503',
    });

    await sql`
      insert into public.lease_amendments (
        id, agreement_id, code, title, effective_from, status, version
      ) values (
        '62000000-0000-4000-8000-000000000004',
        ${agreement.id},
        'AMD-DOC-DRAFT',
        'Unsigned amendment',
        '2026-11-01',
        'draft',
        1
      )
    `;

    await expect(
      sql`
        insert into public.document_links (
          id, document_id, document_version_id, relation, target_type,
          lease_amendment_id
        ) values (
          '62000000-0000-4000-8000-000000000005',
          ${document.id},
          ${version.id},
          'signed_original',
          'lease_amendment',
          '62000000-0000-4000-8000-000000000004'
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'document_links_signed_original_amendment_signed',
    });

    const currentDocument = await documentRepository.getDocumentById(document.id);
    expect(currentDocument).not.toBeNull();

    const candidateA = addStoredDocumentVersion(currentDocument!, {
      id: asDocumentVersionId('62000000-0000-4000-8000-000000000006'),
      fileName: 'revision-a.pdf',
      mimeType: 'application/pdf',
      byteSize: 5,
      sha256: 'c'.repeat(64),
    });
    const candidateB = addStoredDocumentVersion(currentDocument!, {
      id: asDocumentVersionId('62000000-0000-4000-8000-000000000007'),
      fileName: 'revision-b.pdf',
      mimeType: 'application/pdf',
      byteSize: 5,
      sha256: 'd'.repeat(64),
    });

    await documentRepository.insertVersion(
      candidateA.document,
      currentDocument!.revision,
      candidateA.version,
      {
        provider: 'integration-test',
        objectId: 'object-a',
        objectKey: 'document-version:concurrency-a',
      },
    );

    await expect(
      documentRepository.insertVersion(
        candidateB.document,
        currentDocument!.revision,
        candidateB.version,
        {
          provider: 'integration-test',
          objectId: 'object-b',
          objectKey: 'document-version:concurrency-b',
        },
      ),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_VERSION_CONFLICT',
    });

    const versions = await documentRepository.listVersionsByDocument(document.id);
    expect(versions.map((item) => item.versionNumber)).toEqual([1, 2]);
  });


  it('persists inspection backbone and rejects direct invariant bypasses', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000002',
      '91000000-0000-4000-8000-000000000003',
      '91000000-0000-4000-8000-000000000004',
      '91000000-0000-4000-8000-000000000005',
      '91000000-0000-4000-8000-000000000006',
      '91000000-0000-4000-8000-000000000007',
      '91000000-0000-4000-8000-000000000008',
      '91000000-0000-4000-8000-000000000009',
      '91000000-0000-4000-8000-000000000010',
      '91000000-0000-4000-8000-000000000011',
      '91000000-0000-4000-8000-000000000012',
      '91000000-0000-4000-8000-000000000013',
      '91000000-0000-4000-8000-000000000014',
      '91000000-0000-4000-8000-000000000015',
      '91000000-0000-4000-8000-000000000016',
      '91000000-0000-4000-8000-000000000017',
      '91000000-0000-4000-8000-000000000018',
      '91000000-0000-4000-8000-000000000019',
      '91000000-0000-4000-8000-000000000020',
      '91000000-0000-4000-8000-000000000021',
      '91000000-0000-4000-8000-000000000022',
      '91000000-0000-4000-8000-000000000023',
      '91000000-0000-4000-8000-000000000024',
      '91000000-0000-4000-8000-000000000025',
    ]);

    const schemaV1 = await createInspectionSchemaVersionCommand(
      { inspectionRepository, idGenerator: ids },
      actor,
      {
        schemaCode: 'MOVE-IN-INT',
        inspectionType: 'move_in',
        title: 'Move-in integration schema',
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
              {
                key: 'meter_reading',
                type: 'number',
                label: 'Meter reading',
                sortOrder: 2,
              },
              {
                key: 'tags',
                type: 'multiselect',
                label: 'Tags',
                sortOrder: 3,
                options: [
                  { value: 'a', label: 'A' },
                  { value: 'b', label: 'B' },
                ],
              },
            ],
          },
        ],
      },
    );

    const publishedV1 = await publishInspectionSchemaVersionCommand(
      inspectionRepository,
      actor,
      schemaV1.id,
    );
    expect(publishedV1.status).toBe('published');

    const section = publishedV1.sections[0]!;
    const conditionItem = section.items[0]!;
    const damageItem = section.items[1]!;
    const meterItem = section.items[2]!;
    const tagsItem = section.items[3]!;

    await expect(
      sql`
        update public.inspection_schema_items
        set label = 'Rewritten after publish'
        where id = ${conditionItem.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_schema_structure_immutable',
    });

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-INS-INT',
        name: 'Inspection Integration',
        propertyType: 'apartment_building',
        street: 'Inspection Street',
        houseNumber: '1',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );

    const unit = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-INS-INT-1',
        unitNumber: 'I-1',
        unitType: 'apartment',
      },
    );

    const otherUnit = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-INS-INT-2',
        unitNumber: 'I-2',
        unitType: 'apartment',
      },
    );

    const otherTenancy = await createTenancyCommand(
      {
        tenancyRepository,
        portfolioRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: otherUnit.id,
        code: 'TEN-INS-OTHER',
      },
    );

    await expect(
      createInspectionCommand(
        {
          inspectionRepository,
          portfolioRepository,
          tenancyRepository,
          staffDirectoryRepository: accessRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-18T20:00:00.000Z' },
        },
        actor,
        {
          code: 'INS-MISMATCH-APP',
          inspectionType: 'move_in',
          unitId: unit.id,
          tenancyId: otherTenancy.id,
          schemaVersionId: publishedV1.id,
          assignedToUserId:
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as import('@portfolio/domain').UserId,
        },
      ),
    ).rejects.toMatchObject({
      code: 'INSPECTION_TENANCY_UNIT_MISMATCH',
    });

    const inspection = await createInspectionCommand(
      {
        inspectionRepository,
        portfolioRepository,
        tenancyRepository,
        staffDirectoryRepository: accessRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-18T20:00:00.000Z' },
      },
      actor,
      {
        code: 'INS-INT-1',
        inspectionType: 'move_in',
        unitId: unit.id,
        schemaVersionId: publishedV1.id,
        assignedToUserId:
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as import('@portfolio/domain').UserId,
        scheduledFor: '2026-09-20',
      },
    );

    const initialStates = await inspectionRepository.listSectionStates(
      inspection.id,
    );
    expect(initialStates).toEqual([
      {
        inspectionId: inspection.id,
        sectionId: section.id,
        revision: 0,
      },
    ]);

    const started = await startInspectionCommand(
      {
        inspectionRepository,
        clock: { now: () => '2026-09-20T08:00:00.000Z' },
      },
      actor,
      inspection.id,
      1,
    );
    expect(started.status).toBe('in_progress');

    const saved = await saveInspectionSectionCommand(
      {
        inspectionRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-20T08:05:00.000Z' },
      },
      actor,
      inspection.id,
      section.id,
      0,
      {
        set: [{ itemId: conditionItem.id, value: 'good' }],
        clearItemIds: [],
      },
    );
    expect(saved.revision).toBe(1);
    expect(saved.contentRevision).toBe(1);

    await expect(
      saveInspectionSectionCommand(
        {
          inspectionRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-20T08:06:00.000Z' },
        },
        actor,
        inspection.id,
        section.id,
        0,
        {
          set: [{ itemId: conditionItem.id, value: 'damaged' }],
          clearItemIds: [],
        },
      ),
    ).rejects.toMatchObject({
      code: 'INSPECTION_SECTION_REVISION_CONFLICT',
    });

    await expect(
      sql`
        insert into public.inspection_responses (
          id, inspection_id, schema_version_id, section_id, item_id,
          value, updated_by_user_id, updated_at
        ) values (
          '92000000-0000-4000-8000-000000000001',
          ${inspection.id},
          ${publishedV1.id},
          ${section.id},
          ${meterItem.id},
          'true'::jsonb,
          ${actor.userId},
          '2026-09-20T08:07:00.000Z'
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_response_type_match',
    });

    await expect(
      sql`
        insert into public.inspection_responses (
          id, inspection_id, schema_version_id, section_id, item_id,
          value, updated_by_user_id, updated_at
        ) values (
          '92000000-0000-4000-8000-000000000010',
          ${inspection.id},
          ${publishedV1.id},
          ${section.id},
          ${tagsItem.id},
          '["a","a"]'::jsonb,
          ${actor.userId},
          '2026-09-20T08:07:30.000Z'
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_response_option_match',
    });

    let injectedAutosave = false;
    const racingRepository = new Proxy(inspectionRepository, {
      get(target, property, receiver) {
        if (property === 'listResponses') {
          return async (inspectionId: typeof inspection.id) => {
            const snapshot = await target.listResponses(inspectionId);
            if (!injectedAutosave && inspectionId === inspection.id) {
              const revision = await target.getSectionRevision(
                inspection.id,
                section.id,
              );
              expect(revision).toBe(1);
              const response = createInspectionResponse({
                id: asInspectionResponseId(
                  '92000000-0000-4000-8000-000000000011',
                ),
                inspectionId: inspection.id,
                item: conditionItem,
                value: 'damaged',
                updatedByUserId: actor.userId,
                updatedAt: '2026-09-20T08:08:00.000Z',
              });
              await target.saveSection(
                inspection.id,
                section.id,
                revision!,
                [response],
                [],
              );
              injectedAutosave = true;
            }
            return snapshot;
          };
        }

        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    await expect(
      lockInspectionCommand(
        {
          inspectionRepository: racingRepository,
          clock: { now: () => '2026-09-20T08:09:00.000Z' },
        },
        actor,
        inspection.id,
        2,
      ),
    ).rejects.toMatchObject({
      code: 'INSPECTION_CONTENT_REVISION_CONFLICT',
    });

    expect((await inspectionRepository.getById(inspection.id))?.status).toBe(
      'in_progress',
    );

    const repaired = await saveInspectionSectionCommand(
      {
        inspectionRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-20T08:09:30.000Z' },
      },
      actor,
      inspection.id,
      section.id,
      2,
      {
        set: [
          {
            itemId: damageItem.id,
            value: 'Scratch documented after concurrent edit',
          },
          { itemId: meterItem.id, value: '123.45' },
        ],
        clearItemIds: [],
      },
    );
    expect(repaired.revision).toBe(3);
    expect(repaired.contentRevision).toBe(3);

    const cleared = await saveInspectionSectionCommand(
      {
        inspectionRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-20T08:09:45.000Z' },
      },
      actor,
      inspection.id,
      section.id,
      3,
      {
        set: [],
        clearItemIds: [meterItem.id],
      },
    );
    expect(cleared.revision).toBe(4);
    expect(cleared.contentRevision).toBe(4);
    expect(cleared.clearedItemIds).toEqual([meterItem.id]);
    expect(
      (await inspectionRepository.listResponses(inspection.id)).some(
        (response) => response.itemId === meterItem.id,
      ),
    ).toBe(false);

    const finding = await createInspectionFindingCommand(
      {
        inspectionRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-20T08:10:00.000Z' },
      },
      actor,
      inspection.id,
      {
        sectionId: section.id,
        itemId: conditionItem.id,
        severity: 'minor',
        title: 'Minor observation',
      },
    );
    expect(finding.inspectionId).toBe(inspection.id);

    const locked = await lockInspectionCommand(
      {
        inspectionRepository,
        clock: { now: () => '2026-09-20T09:00:00.000Z' },
      },
      actor,
      inspection.id,
      2,
    );
    expect(locked.status).toBe('locked');
    expect(locked.contentRevision).toBe(5);

    await expect(
      sql`
        delete from public.inspection_section_states
        where inspection_id = ${inspection.id}
          and section_id = ${section.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_content_locked',
    });

    await expect(
      sql`
        update public.inspections
        set
          unit_id = ${otherUnit.id},
          tenancy_id = ${otherTenancy.id}
        where id = ${inspection.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_header_identity_immutable',
    });

    await expect(
      sql`
        update public.inspection_section_states
        set revision = revision + 1
        where inspection_id = ${inspection.id}
          and section_id = ${section.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_content_locked',
    });

    await expect(
      sql`
        insert into public.inspection_findings (
          id, inspection_id, schema_version_id, section_id,
          severity, title, created_by_user_id, created_at
        ) values (
          '92000000-0000-4000-8000-000000000002',
          ${inspection.id},
          ${publishedV1.id},
          ${section.id},
          'major',
          'Late mutation',
          ${actor.userId},
          '2026-09-20T09:01:00.000Z'
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_content_locked',
    });

    await expect(
      sql`
        insert into public.inspections (
          id, code, inspection_type, unit_id, tenancy_id,
          schema_version_id, assigned_to_user_id, created_by_user_id,
          status, version
        ) values (
          '92000000-0000-4000-8000-000000000003',
          'INS-DB-TENANCY-MISMATCH',
          'move_in',
          ${unit.id},
          ${otherTenancy.id},
          ${publishedV1.id},
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          ${actor.userId},
          'draft',
          1
        )
      `,
    ).rejects.toMatchObject({
      code: '23503',
      constraint_name: 'inspections_tenancy_same_unit_fk',
    });

    const schemaV2Draft = await createInspectionSchemaVersionCommand(
      { inspectionRepository, idGenerator: ids },
      actor,
      {
        schemaCode: 'MOVE-IN-INT',
        inspectionType: 'move_in',
        title: 'Move-in integration schema v2',
        requiredSignatureRoles: [],
        sections: [
          {
            key: 'general',
            title: 'General',
            sortOrder: 0,
            items: [
              {
                key: 'condition',
                type: 'text',
                label: 'Condition v2',
                sortOrder: 0,
              },
            ],
          },
        ],
      },
    );
    expect(schemaV2Draft.versionNumber).toBe(2);

    await expect(
      sql`
        update public.inspection_schema_items
        set
          schema_version_id = ${schemaV2Draft.id},
          section_id = ${schemaV2Draft.sections[0]!.id}
        where id = ${conditionItem.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_schema_structure_immutable',
    });

    await expect(
      sql`
        insert into public.inspections (
          id, code, inspection_type, unit_id, schema_version_id,
          assigned_to_user_id, created_by_user_id, status, version
        ) values (
          '92000000-0000-4000-8000-000000000004',
          'INS-DRAFT-SCHEMA',
          'move_in',
          ${unit.id},
          ${schemaV2Draft.id},
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          ${actor.userId},
          'draft',
          1
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspections_schema_published',
    });

    const editableInspection = await createInspectionCommand(
      {
        inspectionRepository,
        portfolioRepository,
        tenancyRepository,
        staffDirectoryRepository: accessRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-20T09:05:00.000Z' },
      },
      actor,
      {
        code: 'INS-EDITABLE-TARGET',
        inspectionType: 'move_in',
        unitId: unit.id,
        schemaVersionId: publishedV1.id,
        assignedToUserId:
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as import('@portfolio/domain').UserId,
      },
    );

    await startInspectionCommand(
      {
        inspectionRepository,
        clock: { now: () => '2026-09-20T09:06:00.000Z' },
      },
      actor,
      editableInspection.id,
      1,
    );

    const lockedResponseRows = await sql<{ id: string }[]>`
      select id
      from public.inspection_responses
      where inspection_id = ${inspection.id}
        and item_id = ${conditionItem.id}
      limit 1
    `;
    const lockedResponseId = lockedResponseRows[0]!.id;

    await expect(
      sql`
        update public.inspection_responses
        set inspection_id = ${editableInspection.id}
        where id = ${lockedResponseId}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_content_locked',
    });

    await expect(
      sql`
        update public.inspection_findings
        set inspection_id = ${editableInspection.id}
        where id = ${finding.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_content_locked',
    });

    const draftLifecycleInspection = await createInspectionCommand(
      {
        inspectionRepository,
        portfolioRepository,
        tenancyRepository,
        staffDirectoryRepository: accessRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-20T09:07:00.000Z' },
      },
      actor,
      {
        code: 'INS-DRAFT-LIFECYCLE',
        inspectionType: 'move_in',
        unitId: unit.id,
        schemaVersionId: publishedV1.id,
        assignedToUserId:
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as import('@portfolio/domain').UserId,
      },
    );

    await expect(
      sql`
        update public.inspections
        set status = 'locked', locked_at = '2026-09-20T09:08:00.000Z'
        where id = ${draftLifecycleInspection.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_lifecycle_transition_invalid',
    });

    await expect(
      sql`
        update public.inspections
        set status = 'finalized', finalized_at = '2026-09-20T09:08:00.000Z'
        where id = ${draftLifecycleInspection.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_lifecycle_transition_invalid',
    });

    await publishInspectionSchemaVersionCommand(
      inspectionRepository,
      actor,
      schemaV2Draft.id,
    );

    const persistedInspection = await inspectionRepository.getById(inspection.id);
    expect(persistedInspection?.schemaVersionId).toBe(publishedV1.id);
  });


  it('persists Asset Registry identity, lifecycle and replacement invariants', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      'b1000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000002',
      'b1000000-0000-4000-8000-000000000003',
      'b1000000-0000-4000-8000-000000000004',
      'b1000000-0000-4000-8000-000000000005',
      'b1000000-0000-4000-8000-000000000006',
      'b1000000-0000-4000-8000-000000000007',
      'b1000000-0000-4000-8000-000000000008',
      'b1000000-0000-4000-8000-000000000009',
      'b1000000-0000-4000-8000-000000000010',
      'b1000000-0000-4000-8000-000000000011',
      'b1000000-0000-4000-8000-000000000012',
      'b1000000-0000-4000-8000-000000000013',
      'b1000000-0000-4000-8000-000000000014',
      'b1000000-0000-4000-8000-000000000015',
      'b1000000-0000-4000-8000-000000000016',
      'b1000000-0000-4000-8000-000000000017',
      'b1000000-0000-4000-8000-000000000018',
      'b1000000-0000-4000-8000-000000000019',
      'b1000000-0000-4000-8000-000000000020',
      'b1000000-0000-4000-8000-000000000021',
      'b1000000-0000-4000-8000-000000000022',
      'b1000000-0000-4000-8000-000000000023',
      'b1000000-0000-4000-8000-000000000024',
      'b1000000-0000-4000-8000-000000000025',
      'b1000000-0000-4000-8000-000000000026',
      'b1000000-0000-4000-8000-000000000027',
      'b1000000-0000-4000-8000-000000000028',
      'b1000000-0000-4000-8000-000000000029',
      'b1000000-0000-4000-8000-000000000030',
      'b1000000-0000-4000-8000-000000000031',
      'b1000000-0000-4000-8000-000000000032',
      'b1000000-0000-4000-8000-000000000033',
      'b1000000-0000-4000-8000-000000000034',
      'b1000000-0000-4000-8000-000000000035',
      'b1000000-0000-4000-8000-000000000036',
      'b1000000-0000-4000-8000-000000000037',
      'b1000000-0000-4000-8000-000000000038',
      'b1000000-0000-4000-8000-000000000039',
      'b1000000-0000-4000-8000-000000000040',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-ASSET-INT',
        name: 'Asset Integration',
        propertyType: 'apartment_building',
        street: 'Asset Street',
        houseNumber: '1',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );

    const unit = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-ASSET-1',
        unitNumber: 'A1',
        unitType: 'apartment',
      },
    );
    const kitchen = await createSpaceCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        unitId: unit.id,
        code: 'KITCHEN',
        name: 'Kitchen',
        spaceType: 'kitchen',
      },
    );

    const otherUnit = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-ASSET-2',
        unitNumber: 'A2',
        unitType: 'apartment',
      },
    );
    const otherSpace = await createSpaceCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        unitId: otherUnit.id,
        code: 'KITCHEN',
        name: 'Other kitchen',
        spaceType: 'kitchen',
      },
    );

    const asset = await createAssetCommand(
      { assetRepository, portfolioRepository, idGenerator: ids, clock: { now: () => '2026-09-22T08:00:00.000Z' } },
      actor,
      {
        code: 'ASSET-FRIDGE-001',
        name: 'Kitchen refrigerator',
        propertyId: property.id,
        unitId: unit.id,
        spaceId: kitchen.id,
        manufacturer: 'Bosh',
        model: 'KGN39',
        identifiers: [
          {
            identifierType: 'serial_number',
            value: 'SN-001',
          },
          {
            identifierType: 'product_number',
            value: 'PN-001',
            label: 'E-Nr',
          },
          {
            identifierType: 'inventory_tag',
            value: 'INV-001',
          },
        ],
      },
    );

    expect(asset).toMatchObject({
      status: 'active',
      version: 1,
      propertyId: property.id,
      unitId: unit.id,
      spaceId: kitchen.id,
      manufacturer: 'Bosh',
      model: 'KGN39',
    });
    expect(asset.identifiers).toHaveLength(3);

    await expect(
      createAssetCommand(
        { assetRepository, portfolioRepository, idGenerator: ids, clock: { now: () => '2026-09-22T08:00:00.000Z' } },
        actor,
        {
          code: 'ASSET-BAD-SPACE',
          name: 'Wrong placement',
          propertyId: property.id,
          unitId: unit.id,
          spaceId: otherSpace.id,
        },
      ),
    ).rejects.toMatchObject({ code: 'ASSET_SPACE_UNIT_MISMATCH' });

    const otherAsset = await createAssetCommand(
      { assetRepository, portfolioRepository, idGenerator: ids, clock: { now: () => '2026-09-22T08:00:00.000Z' } },
      actor,
      {
        code: 'ASSET-OTHER-UNIT',
        name: 'Other unit appliance',
        propertyId: property.id,
        unitId: otherUnit.id,
        spaceId: otherSpace.id,
      },
    );

    await expect(
      sql`
        update public.assets
        set unit_id = ${otherUnit.id},
            space_id = ${otherSpace.id},
            version = version + 1
        where id = ${asset.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_move_location_required',
    });

    await expect(
      sql`
        update public.assets
        set property_id = null,
            unit_id = null,
            space_id = null,
            status = 'replaced',
            version = version + 1
        where id = ${asset.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_replacement_required',
    });

    await expect(
      sql`
        insert into public.asset_replacements (
          id, replaced_asset_id, replacement_asset_id,
          replaced_by_user_id, replaced_at
        ) values (
          'b1f00000-0000-4000-8000-000000000001',
          ${asset.id}, ${otherAsset.id}, ${actor.userId},
          '2026-09-22T09:00:00.000Z'
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_replacement_placement_mismatch',
    });

    await expect(
      sql.begin(async (tx) => {
        await tx`
          insert into public.assets (
            id, code, name, property_id, unit_id, space_id, status, version
          ) values (
            'b1f00000-0000-4000-8000-000000000002',
            'ASSET-DANGLING-SUCCESSOR',
            'Dangling successor',
            ${property.id},
            ${unit.id},
            ${kitchen.id},
            'active',
            1
          )
        `;

        await tx`
          insert into public.asset_location_history (
            id, asset_id, property_id, unit_id, space_id,
            valid_from, change_type, changed_by_user_id, reason
          ) values (
            'b1f00000-0000-4000-8000-000000000010',
            'b1f00000-0000-4000-8000-000000000002',
            ${property.id},
            ${unit.id},
            ${kitchen.id},
            '2026-09-22T09:04:00.000Z',
            'asset_created',
            ${actor.userId},
            'Sabotage successor setup'
          )
        `;

        await tx`
          insert into public.asset_replacements (
            id, replaced_asset_id, replacement_asset_id,
            replaced_by_user_id, replaced_at
          ) values (
            'b1f00000-0000-4000-8000-000000000003',
            ${asset.id},
            'b1f00000-0000-4000-8000-000000000002',
            ${actor.userId},
            '2026-09-22T09:05:00.000Z'
          )
        `;
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_replacement_status_required',
    });

    await expect(
      sql.begin(async (tx) => {
        await tx`
          insert into public.assets (
            id, code, name, property_id, unit_id, space_id, status, version
          ) values
          (
            'b1f00000-0000-4000-8000-000000000004',
            'ASSET-CYCLE-A',
            'Cycle A',
            ${property.id},
            ${unit.id},
            ${kitchen.id},
            'active',
            1
          ),
          (
            'b1f00000-0000-4000-8000-000000000005',
            'ASSET-CYCLE-B',
            'Cycle B',
            ${property.id},
            ${unit.id},
            ${kitchen.id},
            'active',
            1
          )
        `;

        await tx`
          insert into public.asset_replacements (
            id, replaced_asset_id, replacement_asset_id,
            replaced_by_user_id, replaced_at
          ) values (
            'b1f00000-0000-4000-8000-000000000006',
            'b1f00000-0000-4000-8000-000000000004',
            'b1f00000-0000-4000-8000-000000000005',
            ${actor.userId},
            '2026-09-22T09:06:00.000Z'
          )
        `;

        await tx`
          insert into public.asset_replacements (
            id, replaced_asset_id, replacement_asset_id,
            replaced_by_user_id, replaced_at
          ) values (
            'b1f00000-0000-4000-8000-000000000007',
            'b1f00000-0000-4000-8000-000000000005',
            'b1f00000-0000-4000-8000-000000000004',
            ${actor.userId},
            '2026-09-22T09:07:00.000Z'
          )
        `;
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_replacement_cycle',
    });

    const buildingAsset = await createAssetCommand(
      { assetRepository, portfolioRepository, idGenerator: ids, clock: { now: () => '2026-09-22T08:00:00.000Z' } },
      actor,
      {
        code: 'ASSET-BUILDING-LIFT',
        name: 'Building lift controller',
        propertyId: property.id,
      },
    );
    expect(buildingAsset).toMatchObject({
      propertyId: property.id,
      unitId: null,
      spaceId: null,
    });

    await expect(
      createAssetCommand(
        { assetRepository, portfolioRepository, idGenerator: ids, clock: { now: () => '2026-09-22T08:00:00.000Z' } },
        actor,
        {
          code: 'ASSET-DUP-INVENTORY',
          name: 'Duplicate inventory tag',
          propertyId: property.id,
          identifiers: [
            {
              identifierType: 'inventory_tag',
              value: ' inv-001 ',
            },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: 'ASSET_IDENTIFIER_GLOBAL_CONFLICT' });

    await expect(
      sql`
        insert into public.asset_identifiers (
          id, asset_id, identifier_type, value
        ) values (
          'b1f00000-0000-4000-8000-000000000008',
          ${otherAsset.id},
          'inventory_tag',
          'inv-001'
        )
      `,
    ).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'asset_identifiers_inventory_tag_uq',
    });

    await expect(
      sql`
        insert into public.asset_identifiers (
          id, asset_id, identifier_type, value
        ) values (
          'b1f00000-0000-4000-8000-000000000009',
          ${otherAsset.id},
          'serial_number',
          ' SN-DIRECT '
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_identifiers_value_canonical',
    });

    const corrected = await updateAssetMetadataCommand(
      assetRepository,
      actor,
      asset.id,
      {
        expectedVersion: asset.version,
        manufacturer: 'Bosch',
      },
    );
    expect(corrected).toMatchObject({
      id: asset.id,
      manufacturer: 'Bosch',
      version: 2,
      propertyId: property.id,
      unitId: unit.id,
      spaceId: kitchen.id,
    });

    const inactive = await changeAssetStatusCommand(
      assetRepository,
      actor,
      asset.id,
      corrected.version,
      'inactive',
    );
    expect(inactive).toMatchObject({ status: 'inactive', version: 3 });

    const replacementResult = await replaceAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-22T09:10:00.000Z' },
      },
      actor,
      asset.id,
      {
        expectedVersion: inactive.version,
        code: 'ASSET-FRIDGE-002',
        name: 'Replacement refrigerator',
        manufacturer: 'Bosch',
        model: 'KGN49',
        identifiers: [
          {
            identifierType: 'serial_number',
            value: 'SN-002',
          },
        ],
      },
    );

    expect(replacementResult.replacedAsset).toMatchObject({
      id: asset.id,
      status: 'replaced',
      version: 4,
      propertyId: null,
      unitId: null,
      spaceId: null,
    });
    expect(replacementResult.replacementAsset).toMatchObject({
      status: 'active',
      version: 1,
      unitId: unit.id,
      spaceId: kitchen.id,
    });
    expect(replacementResult.replacement).toMatchObject({
      replacedAssetId: asset.id,
      replacementAssetId: replacementResult.replacementAsset.id,
      replacedByUserId: actor.userId,
    });

    const predecessorHistory = await assetRepository.listLocationHistory(asset.id);
    const successorHistory = await assetRepository.listLocationHistory(
      replacementResult.replacementAsset.id,
    );
    expect(predecessorHistory).toHaveLength(1);
    expect(predecessorHistory[0]).toMatchObject({
      propertyId: property.id,
      unitId: unit.id,
      spaceId: kitchen.id,
      validTo: '2026-09-22T09:10:00.000Z',
    });
    expect(successorHistory).toHaveLength(1);
    expect(successorHistory[0]).toMatchObject({
      propertyId: property.id,
      unitId: unit.id,
      spaceId: kitchen.id,
      validFrom: '2026-09-22T09:10:00.000Z',
      validTo: null,
      changeType: 'replacement_created',
    });
    expect(await assetRepository.getCurrentLocation(asset.id)).toBeNull();

    await expect(
      sql`
        update public.asset_identifiers
        set value = 'SN-REWRITTEN'
        where asset_id = ${asset.id}
          and identifier_type = 'serial_number'
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_identifier_immutable',
    });

    await expect(
      changeAssetStatusCommand(
        assetRepository,
        actor,
        asset.id,
        replacementResult.replacedAsset.version,
        'active',
      ),
    ).rejects.toMatchObject({ code: 'ASSET_TERMINAL' });

    const assets = await listAssetsByUnitQuery(
      assetRepository,
      portfolioRepository,
      actor,
      unit.id,
    );
    expect(assets.map((item) => item.code)).toEqual([
      'ASSET-FRIDGE-002',
    ]);

    const persistedOld = await assetRepository.getById(asset.id);
    const persistedReplacement = await assetRepository.getById(
      replacementResult.replacementAsset.id,
    );
    expect(persistedOld).toMatchObject({
      status: 'replaced',
      propertyId: null,
      unitId: null,
      spaceId: null,
    });
    expect(persistedReplacement?.identifiers).toHaveLength(1);

    const propertyAssets = await listAssetsByPropertyQuery(
      assetRepository,
      portfolioRepository,
      actor,
      property.id,
    );
    expect(propertyAssets.map((item) => item.code)).toEqual([
      'ASSET-BUILDING-LIFT',
      'ASSET-FRIDGE-002',
      'ASSET-OTHER-UNIT',
    ]);
  });


  it('keeps AssetLocationHistory authoritative and preserves Tenancy inventory truth', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      'c2000000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000002',
      'c2000000-0000-4000-8000-000000000003',
      'c2000000-0000-4000-8000-000000000004',
      'c2000000-0000-4000-8000-000000000005',
      'c2000000-0000-4000-8000-000000000006',
      'c2000000-0000-4000-8000-000000000007',
      'c2000000-0000-4000-8000-000000000008',
      'c2000000-0000-4000-8000-000000000009',
      'c2000000-0000-4000-8000-000000000010',
      'c2000000-0000-4000-8000-000000000011',
      'c2000000-0000-4000-8000-000000000012',
      'c2000000-0000-4000-8000-000000000013',
      'c2000000-0000-4000-8000-000000000014',
      'c2000000-0000-4000-8000-000000000015',
      'c2000000-0000-4000-8000-000000000016',
      'c2000000-0000-4000-8000-000000000017',
      'c2000000-0000-4000-8000-000000000018',
      'c2000000-0000-4000-8000-000000000019',
      'c2000000-0000-4000-8000-000000000020',
      'c2000000-0000-4000-8000-000000000021',
      'c2000000-0000-4000-8000-000000000022',
      'c2000000-0000-4000-8000-000000000023',
      'c2000000-0000-4000-8000-000000000024',
      'c2000000-0000-4000-8000-000000000025',
      'c2000000-0000-4000-8000-000000000026',
      'c2000000-0000-4000-8000-000000000027',
      'c2000000-0000-4000-8000-000000000028',
      'c2000000-0000-4000-8000-000000000029',
      'c2000000-0000-4000-8000-000000000030',
      'c2000000-0000-4000-8000-000000000031',
      'c2000000-0000-4000-8000-000000000032',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-HISTORY-INT',
        name: 'History Integration',
        propertyType: 'apartment_building',
        street: 'History Street',
        houseNumber: '1',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );
    const unitA = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-HISTORY-A',
        unitNumber: 'HA',
        unitType: 'apartment',
      },
    );
    const unitB = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-HISTORY-B',
        unitNumber: 'HB',
        unitType: 'apartment',
      },
    );
    const spaceA = await createSpaceCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        unitId: unitA.id,
        code: 'KITCHEN',
        name: 'Kitchen A',
        spaceType: 'kitchen',
      },
    );
    const spaceB = await createSpaceCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        unitId: unitB.id,
        code: 'KITCHEN',
        name: 'Kitchen B',
        spaceType: 'kitchen',
      },
    );

    const tenant = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-HISTORY-A',
        partyType: 'person',
        firstName: 'History',
        lastName: 'Tenant',
      },
    );

    const tenancy = await createTenancyCommand(
      {
        tenancyRepository,
        portfolioRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: unitA.id,
        code: 'TEN-HISTORY-A',
        parties: [
          {
            partyId: tenant.id,
            role: 'tenant',
            isPrimary: true,
          },
        ],
      },
    );

    const asset = await createAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:00:00.000Z' },
      },
      actor,
      {
        code: 'ASSET-HISTORY-001',
        name: 'Movable refrigerator',
        propertyId: property.id,
        unitId: unitA.id,
        spaceId: spaceA.id,
      },
    );

    const initialHistory = await listAssetLocationHistoryQuery(
      assetRepository,
      actor,
      asset.id,
    );
    expect(initialHistory).toHaveLength(1);
    expect(initialHistory[0]).toMatchObject({
      unitId: unitA.id,
      spaceId: spaceA.id,
      validTo: null,
      changeType: 'asset_created',
    });

    await assessAssetConditionCommand(
      {
        assetRepository,
        assetInventoryRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:10:00.000Z' },
      },
      actor,
      asset.id,
      { condition: 'good', notes: 'General condition' },
    );

    const assignment = await assignAssetToTenancyCommand(
      {
        assetRepository,
        assetInventoryRepository,
        tenancyRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:20:00.000Z' },
      },
      actor,
      tenancy.id,
      asset.id,
    );
    expect(assignment.version).toBe(1);

    await expect(
      recordTenancyAssetInventoryCommand(
        {
          assetRepository,
          assetInventoryRepository,
          tenancyRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-19T08:25:00.000Z' },
        },
        actor,
        assignment.id,
        {
          expectedVersion: 1,
          phase: 'move_in',
          presence: 'present',
        },
      ),
    ).rejects.toMatchObject({
      code: 'TENANCY_ASSET_TENANCY_STATE_INVALID',
    });

    await expect(
      sql`
        update public.tenancy_asset_assignments
        set
          move_in_presence = 'present',
          move_in_recorded_at = '2026-09-19T08:25:00.000Z',
          move_in_recorded_by_user_id = ${actor.userId},
          version = version + 1
        where id = ${assignment.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancy_asset_assignment_move_in_tenancy_state',
    });

    const plannedTenancy = await planTenancyCommand(
      { tenancyRepository },
      actor,
      tenancy.id,
      1,
      '2026-09-20',
      '2027-09-19',
    );
    expect(plannedTenancy.status).toBe('planned');

    const moveIn = await recordTenancyAssetInventoryCommand(
      {
        assetRepository,
        assetInventoryRepository,
        tenancyRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:30:00.000Z' },
      },
      actor,
      assignment.id,
      {
        expectedVersion: 1,
        phase: 'move_in',
        presence: 'present',
        condition: 'good',
        notes: 'Present at move-in',
      },
    );
    expect(moveIn).toMatchObject({
      version: 2,
      moveIn: { presence: 'present' },
    });

    const activeTenancy = await activateTenancyCommand(
      { tenancyRepository },
      actor,
      tenancy.id,
      plannedTenancy.version,
      '2026-09-20',
    );
    expect(activeTenancy.status).toBe('active');

    const moved = await moveAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T09:00:00.000Z' },
      },
      actor,
      asset.id,
      {
        expectedVersion: 1,
        propertyId: property.id,
        unitId: unitB.id,
        spaceId: spaceB.id,
        reason: 'Transferred to Unit B',
      },
    );
    expect(moved).toMatchObject({
      id: asset.id,
      version: 2,
      unitId: unitB.id,
      spaceId: spaceB.id,
    });

    const history = await listAssetLocationHistoryQuery(
      assetRepository,
      actor,
      asset.id,
    );
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      unitId: unitA.id,
      spaceId: spaceA.id,
      validTo: '2026-09-19T09:00:00.000Z',
    });
    expect(history[1]).toMatchObject({
      unitId: unitB.id,
      spaceId: spaceB.id,
      validFrom: '2026-09-19T09:00:00.000Z',
      validTo: null,
      changeType: 'moved',
    });

    await expect(
      sql`
        insert into public.asset_location_history (
          id, asset_id, property_id, unit_id, space_id,
          valid_from, valid_to, change_type, changed_by_user_id, reason
        ) values (
          'c2f00000-0000-4000-8000-000000000001',
          ${asset.id},
          ${property.id},
          ${unitA.id},
          ${spaceA.id},
          '2026-09-19T07:00:00.000Z',
          '2026-09-19T07:30:00.000Z',
          'moved',
          ${actor.userId},
          'Fabricated backdated history'
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_location_history_insert_must_be_open',
    });

    await expect(
      sql`
        update public.assets
        set
          unit_id = ${unitA.id},
          space_id = ${spaceA.id},
          version = version + 1
        where id = ${asset.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_move_location_required',
    });

    await expect(
      sql.begin(async (tx) => {
        await tx`
          update public.asset_location_history
          set valid_to = '2026-09-19T10:00:00.000Z'
          where asset_id = ${asset.id}
            and valid_to is null
        `;
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_location_open_interval_required',
    });

    await expect(
      sql.begin(async (tx) => {
        await tx`
          update public.asset_location_history
          set valid_to = '2026-09-19T10:00:00.000Z'
          where asset_id = ${asset.id}
            and valid_to is null
        `;

        await tx`
          insert into public.asset_location_history (
            id, asset_id, property_id, unit_id, space_id,
            valid_from, change_type, changed_by_user_id, reason
          ) values (
            'c2f00000-0000-4000-8000-000000000003',
            ${asset.id},
            ${property.id},
            ${unitA.id},
            ${spaceA.id},
            '2026-09-19T11:00:00.000Z',
            'moved',
            ${actor.userId},
            'Attempted move with a one-hour history gap'
          )
        `;
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_location_history_not_contiguous',
    });

    await expect(
      recordTenancyAssetInventoryCommand(
        {
          assetRepository,
          assetInventoryRepository,
          tenancyRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-19T09:55:00.000Z' },
        },
        actor,
        assignment.id,
        {
          expectedVersion: 2,
          phase: 'move_out',
          presence: 'present',
          notes: 'Contradictory present snapshot after move',
        },
      ),
    ).rejects.toMatchObject({
      code: 'TENANCY_ASSET_PRESENT_UNIT_MISMATCH',
    });

    await expect(
      sql`
        update public.tenancy_asset_assignments
        set
          move_out_presence = 'present',
          move_out_recorded_at = '2026-09-19T09:55:00.000Z',
          move_out_recorded_by_user_id = ${actor.userId},
          version = version + 1
        where id = ${assignment.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancy_asset_assignment_present_unit_mismatch',
    });

    const moveOut = await recordTenancyAssetInventoryCommand(
      {
        assetRepository,
        assetInventoryRepository,
        tenancyRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T10:00:00.000Z' },
      },
      actor,
      assignment.id,
      {
        expectedVersion: 2,
        phase: 'move_out',
        presence: 'missing',
        notes: 'Not present at move-out check',
      },
    );
    expect(moveOut).toMatchObject({
      version: 3,
      moveOut: { presence: 'missing', conditionAssessmentId: null },
    });

    const retiredAsset = await createAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T11:00:00.000Z' },
      },
      actor,
      {
        code: 'ASSET-HISTORY-RETIRED',
        name: 'Retired inventory candidate',
        propertyId: property.id,
        unitId: unitA.id,
        spaceId: spaceA.id,
      },
    );
    await changeAssetStatusCommand(
      assetRepository,
      actor,
      retiredAsset.id,
      1,
      'retired',
    );

    await expect(
      sql`
        insert into public.tenancy_asset_assignments (
          id, tenancy_id, asset_id,
          assigned_at, assigned_by_user_id, version
        ) values (
          'c2f00000-0000-4000-8000-000000000002',
          ${tenancy.id},
          ${retiredAsset.id},
          '2026-09-19T11:10:00.000Z',
          ${actor.userId},
          1
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancy_asset_assignment_asset_status_invalid',
    });

    const noticedTenancy = await giveTenancyNoticeCommand(
      { tenancyRepository },
      actor,
      tenancy.id,
      activeTenancy.version,
      '2026-09-20',
      '2026-09-21',
    );
    const pendingTenancy = await markTenancyMoveOutPendingCommand(
      { tenancyRepository },
      actor,
      tenancy.id,
      noticedTenancy.version,
    );
    expect(pendingTenancy.status).toBe('move_out_pending');

    const pendingCandidate = await createAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-20T12:00:00.000Z' },
      },
      actor,
      {
        code: 'ASSET-HISTORY-PENDING',
        name: 'Late assignment candidate',
        propertyId: property.id,
        unitId: unitA.id,
        spaceId: spaceA.id,
      },
    );

    await expect(
      assignAssetToTenancyCommand(
        {
          assetRepository,
          assetInventoryRepository,
          tenancyRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-20T12:05:00.000Z' },
        },
        actor,
        tenancy.id,
        pendingCandidate.id,
      ),
    ).rejects.toMatchObject({
      code: 'TENANCY_ASSET_TENANCY_STATE_INVALID',
    });

    await expect(
      sql`
        insert into public.tenancy_asset_assignments (
          id, tenancy_id, asset_id,
          assigned_at, assigned_by_user_id, version
        ) values (
          'c2f00000-0000-4000-8000-000000000005',
          ${tenancy.id},
          ${pendingCandidate.id},
          '2026-09-20T12:05:00.000Z',
          ${actor.userId},
          1
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancy_asset_assignment_tenancy_state_invalid',
    });

    const endedTenancy = await endTenancyCommand(
      { tenancyRepository },
      actor,
      tenancy.id,
      pendingTenancy.version,
      '2026-09-21',
    );
    expect(endedTenancy.status).toBe('ended');

    const postEndAsset = await createAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-21T11:00:00.000Z' },
      },
      actor,
      {
        code: 'ASSET-HISTORY-POST-END',
        name: 'Post-end inventory candidate',
        propertyId: property.id,
        unitId: unitA.id,
        spaceId: spaceA.id,
      },
    );

    await expect(
      assignAssetToTenancyCommand(
        {
          assetRepository,
          assetInventoryRepository,
          tenancyRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-21T11:05:00.000Z' },
        },
        actor,
        tenancy.id,
        postEndAsset.id,
      ),
    ).rejects.toMatchObject({
      code: 'TENANCY_ASSET_TENANCY_STATE_INVALID',
    });

    await expect(
      sql`
        insert into public.tenancy_asset_assignments (
          id, tenancy_id, asset_id,
          assigned_at, assigned_by_user_id, version
        ) values (
          'c2f00000-0000-4000-8000-000000000004',
          ${tenancy.id},
          ${postEndAsset.id},
          '2026-09-21T11:05:00.000Z',
          ${actor.userId},
          1
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancy_asset_assignment_tenancy_state_invalid',
    });

    const conditions = await listAssetConditionAssessmentsQuery(
      assetInventoryRepository,
      assetRepository,
      actor,
      asset.id,
    );
    expect(conditions.map((item) => item.condition)).toEqual(['good', 'good']);

    const assignments = await listTenancyAssetAssignmentsQuery(
      assetInventoryRepository,
      tenancyRepository,
      actor,
      tenancy.id,
    );
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      assetId: asset.id,
      version: 3,
      moveIn: { presence: 'present' },
      moveOut: { presence: 'missing' },
    });

    await expect(
      sql`
        update public.asset_condition_assessments
        set condition = 'poor'
        where id = ${conditions[0]!.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_condition_assessment_immutable',
    });

  });


  it('persists Warranty and Service history and rejects direct invariant bypasses', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      'fb000000-0000-4000-8000-000000000001',
      'fb000000-0000-4000-8000-000000000002',
      'fb000000-0000-4000-8000-000000000003',
      'fb000000-0000-4000-8000-000000000004',
      'fb000000-0000-4000-8000-000000000005',
      'fb000000-0000-4000-8000-000000000006',
      'fb000000-0000-4000-8000-000000000007',
      'fb000000-0000-4000-8000-000000000008',
      'fb000000-0000-4000-8000-000000000009',
      'fb000000-0000-4000-8000-000000000010',
      'fb000000-0000-4000-8000-000000000011',
      'fb000000-0000-4000-8000-000000000012',
      'fb000000-0000-4000-8000-000000000013',
      'fb000000-0000-4000-8000-000000000014',
      'fb000000-0000-4000-8000-000000000015',
      'fb000000-0000-4000-8000-000000000016',
      'fb000000-0000-4000-8000-000000000017',
      'fb000000-0000-4000-8000-000000000018',
      'fb000000-0000-4000-8000-000000000019',
      'fb000000-0000-4000-8000-000000000020',
      'fb000000-0000-4000-8000-000000000021',
      'fb000000-0000-4000-8000-000000000022',
      'fb000000-0000-4000-8000-000000000023',
      'fb000000-0000-4000-8000-000000000024',
      'fb000000-0000-4000-8000-000000000025',
      'fb000000-0000-4000-8000-000000000026',
      'fb000000-0000-4000-8000-000000000027',
      'fb000000-0000-4000-8000-000000000028',
      'fb000000-0000-4000-8000-000000000029',
      'fb000000-0000-4000-8000-000000000030',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-SERVICE-INT',
        name: 'Service Integration',
        propertyType: 'apartment_building',
        street: 'Service Street',
        houseNumber: '1',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );

    const unit = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-SERVICE-INT',
        unitNumber: 'S1',
        unitType: 'apartment',
      },
    );

    const provider = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-SERVICE-INT',
        partyType: 'company',
        legalName: 'Historic Service Provider d.o.o.',
      },
    );

    const asset = await createAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:00:00.000Z' },
      },
      actor,
      {
        code: 'ASSET-SERVICE-INT',
        name: 'Heat pump',
        propertyId: property.id,
        unitId: unit.id,
      },
    );

    const warranty = await createWarrantyCommand(
      {
        assetRepository,
        assetServiceRepository,
        partyRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:05:00.000Z' },
      },
      actor,
      asset.id,
      {
        warrantyType: 'manufacturer',
        providerPartyId: provider.id,
        reference: 'W-INT-1',
        validFrom: '2026-01-01',
        validTo: '2027-12-31',
        terms: 'Compressor and electronics',
      },
    );

    await expect(
      sql`
        insert into public.asset_warranty_claims (
          id, warranty_id, incident_on, description, status,
          recorded_at, recorded_by_user_id, version
        ) values (
          'fbf00000-0000-4000-8000-000000000001',
          ${warranty.id},
          '2028-01-01',
          'Outside coverage',
          'draft',
          '2026-09-19T08:06:00.000Z',
          ${actor.userId},
          1
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_warranty_claim_outside_coverage',
    });

    await expect(
      sql`
        update public.asset_warranties
        set terms = 'Rewritten terms'
        where id = ${warranty.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_warranty_immutable',
    });

    await expect(
      createWarrantyClaimCommand(
        {
          assetServiceRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-19T08:06:00.000Z' },
        },
        actor,
        warranty.id,
        {
          incidentOn: '2027-03-01',
          description: 'Impossible future incident',
        },
      ),
    ).rejects.toMatchObject({
      code: 'WARRANTY_CLAIM_INCIDENT_IN_FUTURE',
    });

    await expect(
      sql`
        insert into public.asset_warranty_claims (
          id, warranty_id, incident_on, description, status,
          recorded_at, recorded_by_user_id, version
        ) values (
          'fbf00000-0000-4000-8000-000000000004',
          ${warranty.id},
          '2027-03-01',
          'Impossible future incident',
          'draft',
          '2026-09-19T08:06:00.000Z',
          ${actor.userId},
          1
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_warranty_claim_incident_not_future',
    });

    const claim = await createWarrantyClaimCommand(
      {
        assetServiceRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:07:00.000Z' },
      },
      actor,
      warranty.id,
      {
        incidentOn: '2026-09-01',
        description: 'Compressor stopped',
      },
    );

    await expect(
      sql`
        update public.asset_warranty_claims
        set status = 'submitted',
            submitted_at = '2026-09-19T08:06:00.000Z',
            version = version + 1
        where id = ${claim.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_warranty_claims_timestamp_order',
    });

    await expect(
      sql`
        update public.asset_warranty_claims
        set status = 'cancelled',
            cancelled_at = '2026-09-19T08:06:00.000Z',
            version = version + 1
        where id = ${claim.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_warranty_claims_timestamp_order',
    });

    const submitted = await submitWarrantyClaimCommand(
      {
        assetServiceRepository,
        clock: { now: () => '2026-09-19T08:10:00.000Z' },
      },
      actor,
      claim.id,
      1,
      'CASE-INT-77',
    );
    const approved = await resolveWarrantyClaimCommand(
      {
        assetServiceRepository,
        clock: { now: () => '2026-09-19T08:15:00.000Z' },
      },
      actor,
      claim.id,
      submitted.version,
      'approved',
    );
    const closed = await closeWarrantyClaimCommand(
      {
        assetServiceRepository,
        clock: { now: () => '2026-09-19T08:20:00.000Z' },
      },
      actor,
      claim.id,
      approved.version,
    );
    expect(closed).toMatchObject({
      status: 'closed',
      version: 4,
      providerReference: 'CASE-INT-77',
    });

    await expect(
      sql`
        update public.asset_warranty_claims
        set description = 'Rewritten incident',
            version = version + 1
        where id = ${claim.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_warranty_claim_identity_immutable',
    });

    await expect(
      sql`
        update public.asset_warranty_claims
        set status = 'submitted',
            version = version + 1
        where id = ${claim.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_warranty_claim_transition_invalid',
    });

    await expect(
      sql`
        update public.asset_warranty_claims
        set closed_at = null,
            version = version + 1
        where id = ${claim.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_warranty_claim_timestamp_immutable',
    });

    await sql`
      update public.parties
      set status = 'inactive'
      where id = ${provider.id}
    `;

    await expect(
      createServicePlanCommand(
        {
          assetRepository,
          assetServiceRepository,
          partyRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-19T08:24:00.000Z' },
        },
        actor,
        asset.id,
        {
          name: 'Invalid inactive-provider plan',
          scheduleKind: 'one_time',
          firstDueOn: '2027-08-01',
          providerPartyId: provider.id,
        },
      ),
    ).rejects.toMatchObject({
      code: 'SERVICE_PLAN_PROVIDER_STATUS_INVALID',
    });

    await expect(
      sql`
        insert into public.asset_service_plans (
          id, asset_id, name, schedule_kind, first_due_on,
          provider_party_id, status, version, created_at, created_by_user_id
        ) values (
          'fbf00000-0000-4000-8000-000000000005',
          ${asset.id},
          'Invalid inactive-provider plan',
          'one_time',
          '2027-08-01',
          ${provider.id},
          'active',
          1,
          '2026-09-19T08:24:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_service_plan_provider_status_invalid',
    });

    await sql`
      update public.parties
      set status = 'active'
      where id = ${provider.id}
    `;

    const plan = await createServicePlanCommand(
      {
        assetRepository,
        assetServiceRepository,
        partyRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:25:00.000Z' },
      },
      actor,
      asset.id,
      {
        name: 'Annual heat-pump service',
        scheduleKind: 'recurring',
        firstDueOn: '2027-09-01',
        intervalMonths: 12,
        providerPartyId: provider.id,
      },
    );

    await expect(
      sql`
        update public.asset_service_plans
        set name = 'Rewritten plan',
            version = version + 1
        where id = ${plan.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_service_plan_definition_immutable',
    });

    const paused = await changeServicePlanStatusCommand(
      { assetRepository, assetServiceRepository, partyRepository },
      actor,
      plan.id,
      1,
      'paused',
    );

    await sql`
      update public.parties
      set status = 'inactive'
      where id = ${provider.id}
    `;

    await expect(
      changeServicePlanStatusCommand(
        { assetRepository, assetServiceRepository, partyRepository },
        actor,
        plan.id,
        paused.version,
        'active',
      ),
    ).rejects.toMatchObject({
      code: 'SERVICE_PLAN_PROVIDER_STATUS_INVALID',
    });

    await expect(
      sql`
        update public.asset_service_plans
        set status = 'active',
            version = version + 1
        where id = ${plan.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_service_plan_provider_status_invalid',
    });

    await sql`
      update public.parties
      set status = 'active'
      where id = ${provider.id}
    `;

    const activeAgain = await changeServicePlanStatusCommand(
      { assetRepository, assetServiceRepository, partyRepository },
      actor,
      plan.id,
      paused.version,
      'active',
    );
    expect(activeAgain.status).toBe('active');

    const otherAsset = await createAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:35:00.000Z' },
      },
      actor,
      {
        code: 'ASSET-SERVICE-OTHER',
        name: 'Other heat pump',
        propertyId: property.id,
        unitId: unit.id,
      },
    );

    const otherWarranty = await createWarrantyCommand(
      {
        assetRepository,
        assetServiceRepository,
        partyRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:40:00.000Z' },
      },
      actor,
      otherAsset.id,
      {
        warrantyType: 'seller',
        validFrom: '2026-01-01',
        validTo: '2027-12-31',
      },
    );
    const otherClaim = await createWarrantyClaimCommand(
      {
        assetServiceRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:41:00.000Z' },
      },
      actor,
      otherWarranty.id,
      {
        incidentOn: '2026-09-01',
        description: 'Other Asset claim',
      },
    );

    await expect(
      sql`
        insert into public.asset_service_events (
          id, asset_id, service_plan_id, event_type,
          performed_at, description, recorded_at, recorded_by_user_id
        ) values (
          'fbf00000-0000-4000-8000-000000000002',
          ${otherAsset.id},
          ${plan.id},
          'repair',
          '2026-09-10T10:00:00.000Z',
          'Wrong plan Asset',
          '2026-09-19T08:45:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_service_event_plan_asset_mismatch',
    });

    await expect(
      sql`
        insert into public.asset_service_events (
          id, asset_id, warranty_claim_id, event_type,
          performed_at, description, recorded_at, recorded_by_user_id
        ) values (
          'fbf00000-0000-4000-8000-000000000003',
          ${asset.id},
          ${otherClaim.id},
          'warranty_service',
          '2026-09-10T10:00:00.000Z',
          'Wrong claim Asset',
          '2026-09-19T08:45:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_service_event_claim_asset_mismatch',
    });

    await sql`
      update public.parties
      set status = 'inactive'
      where id = ${provider.id}
    `;

    const event = await recordServiceEventCommand(
      {
        assetRepository,
        assetServiceRepository,
        partyRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:30:00.000Z' },
      },
      actor,
      asset.id,
      {
        servicePlanId: plan.id,
        warrantyClaimId: claim.id,
        eventType: 'warranty_service',
        performedAt: '2026-09-10T10:00:00.000Z',
        providerPartyId: provider.id,
        description: 'Compressor replaced under warranty',
        reference: 'SRV-INT-1',
        parts: [
          {
            name: 'Compressor',
            partNumber: 'CMP-9000',
            serialNumber: 'CMP-SN-INT-1',
            quantity: 1,
          },
        ],
      },
    );

    expect(event).toMatchObject({
      assetId: asset.id,
      servicePlanId: plan.id,
      warrantyClaimId: claim.id,
      performedAt: '2026-09-10T10:00:00.000Z',
      recordedAt: '2026-09-19T08:30:00.000Z',
    });
    expect(event.parts).toHaveLength(1);

    const persistedEvents =
      await assetServiceRepository.listServiceEventsByAsset(asset.id);
    expect(persistedEvents).toHaveLength(1);
    expect(persistedEvents[0]?.parts[0]).toMatchObject({
      name: 'Compressor',
      quantity: 1,
    });

    await expect(
      sql`
        update public.asset_service_events
        set description = 'Rewritten service'
        where id = ${event.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_service_event_immutable',
    });

    await expect(
      sql`
        update public.asset_service_parts
        set quantity = 2
        where service_event_id = ${event.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_service_part_immutable',
    });

    await sql`
      update public.parties
      set status = 'active'
      where id = ${provider.id}
    `;

    const replacement = await replaceAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T09:00:00.000Z' },
      },
      actor,
      asset.id,
      {
        expectedVersion: 1,
        code: 'ASSET-SERVICE-INT-REPLACEMENT',
        name: 'Replacement heat pump',
      },
    );
    expect(replacement.replacedAsset.status).toBe('replaced');

    await expect(
      createServicePlanCommand(
        {
          assetRepository,
          assetServiceRepository,
          partyRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-19T09:05:00.000Z' },
        },
        actor,
        asset.id,
        {
          name: 'Impossible successor-era plan',
          scheduleKind: 'one_time',
          firstDueOn: '2027-10-01',
          providerPartyId: provider.id,
        },
      ),
    ).rejects.toMatchObject({
      code: 'SERVICE_PLAN_ASSET_STATUS_INVALID',
    });

    await expect(
      sql`
        insert into public.asset_service_plans (
          id, asset_id, name, schedule_kind, first_due_on,
          status, version, created_at, created_by_user_id
        ) values (
          'fbf00000-0000-4000-8000-000000000006',
          ${asset.id},
          'Impossible successor-era plan',
          'one_time',
          '2027-10-01',
          'active',
          1,
          '2026-09-19T09:05:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_service_plan_asset_status_invalid',
    });

    const pausedAfterReplacement = await changeServicePlanStatusCommand(
      { assetRepository, assetServiceRepository, partyRepository },
      actor,
      plan.id,
      activeAgain.version,
      'paused',
    );

    await expect(
      changeServicePlanStatusCommand(
        { assetRepository, assetServiceRepository, partyRepository },
        actor,
        plan.id,
        pausedAfterReplacement.version,
        'active',
      ),
    ).rejects.toMatchObject({
      code: 'SERVICE_PLAN_ASSET_STATUS_INVALID',
    });

    await expect(
      sql`
        update public.asset_service_plans
        set status = 'active',
            version = version + 1
        where id = ${plan.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_service_plan_asset_status_invalid',
    });

    const ended = await changeServicePlanStatusCommand(
      { assetRepository, assetServiceRepository, partyRepository },
      actor,
      plan.id,
      pausedAfterReplacement.version,
      'ended',
    );
    expect(ended.status).toBe('ended');

    await expect(
      sql`
        update public.asset_service_plans
        set status = 'active',
            version = version + 1
        where id = ${plan.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'asset_service_plan_transition_invalid',
    });
  });


  it('persists Improvements work truth and rejects direct history bypasses', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      'fe000000-0000-4000-8000-000000000001',
      'fe000000-0000-4000-8000-000000000002',
      'fe000000-0000-4000-8000-000000000003',
      'fe000000-0000-4000-8000-000000000004',
      'fe000000-0000-4000-8000-000000000005',
      'fe000000-0000-4000-8000-000000000006',
      'fe000000-0000-4000-8000-000000000007',
      'fe000000-0000-4000-8000-000000000008',
      'fe000000-0000-4000-8000-000000000009',
      'fe000000-0000-4000-8000-000000000010',
      'fe000000-0000-4000-8000-000000000011',
      'fe000000-0000-4000-8000-000000000012',
      'fe000000-0000-4000-8000-000000000013',
      'fe000000-0000-4000-8000-000000000014',
      'fe000000-0000-4000-8000-000000000015',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-IMPROVEMENT-INT',
        name: 'Improvement Integration',
        propertyType: 'apartment_building',
        street: 'Works Street',
        houseNumber: '1',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );
    const unit = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-IMPROVEMENT-INT',
        unitNumber: 'I1',
        unitType: 'apartment',
      },
    );
    const space = await createSpaceCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        unitId: unit.id,
        code: 'KITCHEN-IMPROVEMENT-INT',
        name: 'Kitchen',
        spaceType: 'kitchen',
      },
    );
    const contractor = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-IMPROVEMENT-INT',
        partyType: 'company',
        legalName: 'Historic Renovation Contractor d.o.o.',
      },
    );
    const asset = await createAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T10:00:00.000Z' },
      },
      actor,
      {
        code: 'ASSET-IMPROVEMENT-INT',
        name: 'Built-in oven',
        propertyId: property.id,
        unitId: unit.id,
        spaceId: space.id,
      },
    );

    const project = await createImprovementProjectCommand(
      {
        improvementRepository,
        portfolioRepository,
        partyRepository,
        assetRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T10:05:00.000Z' },
      },
      actor,
      {
        code: 'IMP-INT-001',
        name: 'Kitchen renovation',
        propertyId: property.id,
        unitId: unit.id,
        spaceId: space.id,
        plannedStartOn: '2026-10-01',
        plannedEndOn: '2026-10-31',
      },
    );

    const corrected = await updateImprovementProjectPlanCommand(
      improvementRepository,
      actor,
      project.id,
      1,
      {
        name: 'Kitchen renovation phase 1',
        plannedEndOn: '2026-11-05',
      },
    );
    expect(corrected.version).toBe(2);

    const planned = await changeImprovementProjectStatusCommand(
      {
        improvementRepository,
        clock: { now: () => '2026-09-20T08:00:00.000Z' },
      },
      actor,
      project.id,
      corrected.version,
      'plan',
    );
    const started = await changeImprovementProjectStatusCommand(
      {
        improvementRepository,
        clock: { now: () => '2026-10-01T08:00:00.000Z' },
      },
      actor,
      project.id,
      planned.version,
      'start',
    );

    await expect(
      updateImprovementProjectPlanCommand(
        improvementRepository,
        actor,
        project.id,
        started.version,
        { name: 'Illegal rewrite after start' },
      ),
    ).rejects.toMatchObject({
      code: 'IMPROVEMENT_PROJECT_PLAN_FROZEN',
    });

    await expect(
      sql`
        update public.improvement_projects
        set name = 'Illegal direct rewrite',
            version = version + 1
        where id = ${project.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'improvement_project_plan_frozen',
    });

    const item = await createWorkItemCommand(
      {
        improvementRepository,
        idGenerator: ids,
        clock: { now: () => '2026-10-01T08:05:00.000Z' },
      },
      actor,
      project.id,
      {
        code: 'WI-INT-01',
        title: 'Install cabniets',
      },
    );

    const correctedItem = await updateWorkItemPlanCommand(
      improvementRepository,
      actor,
      item.id,
      1,
      {
        title: 'Install cabinetry',
        description: 'Corrected planned scope',
      },
    );
    expect(correctedItem).toMatchObject({
      title: 'Install cabinetry',
      description: 'Corrected planned scope',
      version: 2,
    });

    await expect(
      changeImprovementProjectStatusCommand(
        {
          improvementRepository,
          clock: { now: () => '2026-10-01T08:10:00.000Z' },
        },
        actor,
        project.id,
        started.version,
        'complete',
      ),
    ).rejects.toMatchObject({
      code: 'IMPROVEMENT_PROJECT_OPEN_WORK_ITEMS',
    });

    await expect(
      sql`
        update public.improvement_projects
        set status = 'completed',
            completed_at = '2026-10-01T08:10:00.000Z',
            version = version + 1
        where id = ${project.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'improvement_project_open_work_items',
    });

    const activeItem = await changeWorkItemStatusCommand(
      {
        improvementRepository,
        clock: { now: () => '2026-10-01T09:00:00.000Z' },
      },
      actor,
      item.id,
      correctedItem.version,
      'start',
    );

    await expect(
      updateWorkItemPlanCommand(
        improvementRepository,
        actor,
        item.id,
        activeItem.version,
        { title: 'Illegal rewrite after start' },
      ),
    ).rejects.toMatchObject({
      code: 'WORK_ITEM_PLAN_FROZEN',
    });

    await expect(
      sql`
        update public.improvement_work_items
        set title = 'Illegal direct rewrite',
            version = version + 1
        where id = ${item.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'improvement_work_item_plan_frozen',
    });

    await expect(
      recordWorkCommand(
        {
          improvementRepository,
          portfolioRepository,
          partyRepository,
          assetRepository,
          idGenerator: ids,
          clock: { now: () => '2026-10-01T10:00:00.000Z' },
        },
        actor,
        item.id,
        {
          performedAt: '2026-10-01T08:30:00.000Z',
          description: 'Impossible work before WorkItem started',
        },
      ),
    ).rejects.toMatchObject({
      code: 'WORK_RECORD_BEFORE_START_TIME',
    });

    await expect(
      sql.begin(async (tx) => {
        await tx`
          insert into public.improvement_work_records (
            id, project_id, work_item_id, performed_at,
            description, recorded_at, recorded_by_user_id, sealed
          ) values (
            'fef00000-0000-4000-8000-000000000004',
            ${project.id},
            ${item.id},
            '2026-10-01T08:30:00.000Z',
            'Impossible direct pre-start work',
            '2026-10-01T10:00:00.000Z',
            ${actor.userId},
            false
          )
        `;
        await tx`
          update public.improvement_work_records
          set sealed = true
          where id = 'fef00000-0000-4000-8000-000000000004'
        `;
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'improvement_work_record_before_start_time',
    });

    await sql`
      update public.parties
      set status = 'inactive'
      where id = ${contractor.id}
    `;

    const record = await recordWorkCommand(
      {
        improvementRepository,
        portfolioRepository,
        partyRepository,
        assetRepository,
        idGenerator: ids,
        clock: { now: () => '2026-10-03T09:00:00.000Z' },
      },
      actor,
      item.id,
      {
        performedAt: '2026-10-02T14:00:00.000Z',
        contractorPartyId: contractor.id,
        description: 'Installed cabinet carcasses and adjusted oven surround',
        reference: 'SITE-DIARY-INT-17',
        materials: [
          {
            name: 'Moisture-resistant board',
            quantity: '12.500000',
            unit: 'm2',
          },
        ],
        assets: [
          {
            assetId: asset.id,
            action: 'affected',
          },
        ],
      },
    );

    const persistedRecords =
      await improvementRepository.listWorkRecordsByProject(project.id);
    expect(persistedRecords).toHaveLength(1);
    expect(persistedRecords[0]).toMatchObject({
      id: record.id,
      contractorPartyId: contractor.id,
      performedAt: '2026-10-02T14:00:00.000Z',
      recordedAt: '2026-10-03T09:00:00.000Z',
    });
    expect(persistedRecords[0]?.materials[0]).toMatchObject({
      quantity: '12.5',
      unit: 'm2',
    });
    expect(persistedRecords[0]?.assets[0]).toMatchObject({
      assetId: asset.id,
      action: 'affected',
    });

    const persistedAsset = await assetRepository.getById(asset.id);
    expect(persistedAsset).toMatchObject({
      id: asset.id,
      status: 'active',
      propertyId: property.id,
      unitId: unit.id,
      spaceId: space.id,
    });

    await expect(
      sql`
        update public.improvement_work_records
        set description = 'Rewritten work history'
        where id = ${record.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'improvement_work_record_immutable',
    });

    await expect(
      sql`
        insert into public.improvement_work_materials (
          id, work_record_id, name, quantity, unit
        ) values (
          'fef00000-0000-4000-8000-000000000001',
          ${record.id},
          'Late material',
          1,
          'piece'
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'improvement_work_record_child_after_seal',
    });

    await expect(
      sql.begin(async (tx) => {
        await tx`
          insert into public.improvement_work_records (
            id, project_id, work_item_id, performed_at,
            description, recorded_at, recorded_by_user_id, sealed
          ) values (
            'fef00000-0000-4000-8000-000000000002',
            ${project.id},
            ${item.id},
            '2026-10-02T15:00:00.000Z',
            'Unsealed sabotage record',
            '2026-10-03T09:30:00.000Z',
            ${actor.userId},
            false
          )
        `;
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'improvement_work_record_must_be_sealed',
    });

    await expect(
      changeWorkItemStatusCommand(
        {
          improvementRepository,
          clock: { now: () => '2026-10-02T12:00:00.000Z' },
        },
        actor,
        item.id,
        activeItem.version,
        'complete',
      ),
    ).rejects.toMatchObject({
      code: 'WORK_ITEM_TERMINAL_BEFORE_WORK_RECORD',
    });

    await expect(
      sql`
        update public.improvement_work_items
        set status = 'completed',
            completed_at = '2026-10-02T12:00:00.000Z',
            version = version + 1
        where id = ${item.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'improvement_work_item_terminal_before_work_record',
    });

    await expect(
      sql`
        update public.improvement_work_items
        set status = 'cancelled',
            cancelled_at = '2026-10-02T12:00:00.000Z',
            version = version + 1
        where id = ${item.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'improvement_work_item_terminal_before_work_record',
    });

    await expect(
      changeImprovementProjectStatusCommand(
        {
          improvementRepository,
          clock: { now: () => '2026-10-02T12:00:00.000Z' },
        },
        actor,
        project.id,
        started.version,
        'cancel',
      ),
    ).rejects.toMatchObject({
      code: 'IMPROVEMENT_PROJECT_TERMINAL_BEFORE_WORK_RECORD',
    });

    await expect(
      sql`
        update public.improvement_projects
        set status = 'cancelled',
            cancelled_at = '2026-10-02T12:00:00.000Z',
            version = version + 1
        where id = ${project.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'improvement_project_terminal_before_work_record',
    });

    const completedItem = await changeWorkItemStatusCommand(
      {
        improvementRepository,
        clock: { now: () => '2026-10-03T10:00:00.000Z' },
      },
      actor,
      item.id,
      activeItem.version,
      'complete',
    );

    await expect(
      changeImprovementProjectStatusCommand(
        {
          improvementRepository,
          clock: { now: () => '2026-10-03T09:30:00.000Z' },
        },
        actor,
        project.id,
        started.version,
        'complete',
      ),
    ).rejects.toMatchObject({
      code: 'IMPROVEMENT_PROJECT_COMPLETED_BEFORE_WORK_ITEM_TERMINAL',
    });

    await expect(
      sql`
        update public.improvement_projects
        set status = 'completed',
            completed_at = '2026-10-03T09:30:00.000Z',
            version = version + 1
        where id = ${project.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'improvement_project_completed_before_work_item_terminal',
    });

    const completedProject = await changeImprovementProjectStatusCommand(
      {
        improvementRepository,
        clock: { now: () => '2026-10-03T11:00:00.000Z' },
      },
      actor,
      project.id,
      started.version,
      'complete',
    );
    expect(completedProject.status).toBe('completed');
    expect(completedItem.status).toBe('completed');

    await expect(
      recordWorkCommand(
        {
          improvementRepository,
          portfolioRepository,
          partyRepository,
          assetRepository,
          idGenerator: ids,
          clock: { now: () => '2026-10-04T13:00:00.000Z' },
        },
        actor,
        item.id,
        {
          performedAt: '2026-10-04T12:00:00.000Z',
          description: 'Impossible post-completion work',
        },
      ),
    ).rejects.toMatchObject({
      code: 'WORK_RECORD_AFTER_TERMINAL_TIME',
    });

    await expect(
      sql.begin(async (tx) => {
        await tx`
          insert into public.improvement_work_records (
            id, project_id, work_item_id, performed_at,
            description, recorded_at, recorded_by_user_id, sealed
          ) values (
            'fef00000-0000-4000-8000-000000000003',
            ${project.id},
            ${item.id},
            '2026-10-04T12:00:00.000Z',
            'Impossible direct post-completion work',
            '2026-10-04T13:00:00.000Z',
            ${actor.userId},
            false
          )
        `;
        await tx`
          update public.improvement_work_records
          set sealed = true
          where id = 'fef00000-0000-4000-8000-000000000003'
        `;
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'improvement_work_record_after_terminal_time',
    });
  });

});
