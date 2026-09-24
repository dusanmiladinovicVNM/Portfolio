import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activateTenancyCommand,
  createAccessItemCommand,
  issueAccessItemCommand,
  reportAccessItemLostCommand,
  retireAccessItemCommand,
  returnAccessItemCommand,
  updateAccessItemLabelCommand,
  createMeterCommand,
  linkMeterReadingBoundaryCommand,
  recordMeterReadingCommand,
  retireMeterCommand,
  updateMeterLabelCommand,
  changeAssetStatusCommand,
  changeImprovementProjectStatusCommand,
  changeWorkItemStatusCommand,
  changeServicePlanStatusCommand,
  closeWarrantyClaimCommand,
  correctCostCommand,
  createAssetCommand,
  createImprovementProjectCommand,
  createMaintenanceIssueCommand,
  createMaintenanceWorkOrderCommand,
  assignMaintenanceWorkOrderCommand,
  changeMaintenanceWorkOrderStatusCommand,
  changeMaintenanceIssueStatusCommand,
  linkServiceEventToMaintenanceWorkOrderCommand,
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
  createCostCommand,
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
  listLeaseAgreementDocumentsQuery,
  listLeaseAmendmentDocumentsQuery,
  listUnitDocumentsQuery,
  listUnitsByPropertyQuery,
  listAssetsByPropertyQuery,
  listAssetsByUnitQuery,
  lockInspectionCommand,
  markTenancyMoveOutPendingCommand,
  planTenancyCommand,
  publishInspectionSchemaVersionCommand,
  replaceAssetCommand,
  reverseCostCommand,
  updateAssetMetadataCommand,
  resolveActor,
  saveInspectionSectionCommand,
  startInspectionCommand,
  unlockInspectionCommand,
  updateInspectionOrchestrationCommand,
  signLeaseAgreementCommand,
  signLeaseAmendmentCommand,
  uploadDocumentVersionCommand,
  type IdGenerator,
  type VerifiedIdentity,
} from '@portfolio/application';
import {
  addStoredDocumentVersion,
  asDateOnly,
  asCostId,
  asCostReversalId,
  asDocumentVersionId,
  asLeaseAmendmentId,
  asInspectionResponseId,
  asOwnershipPeriodId,
  asPropertyId,
  asPartyAddressId,
  asPartyId,
  asTenancyId,
  createCost,
  createCostReversal,
  createInspectionResponse,
  createOwnershipPeriod,
  createTenancy,
  planTenancy,
  type Party,
} from '@portfolio/domain';
import {
  PostgresAccessItemRepository,
  PostgresAssetInventoryRepository,
  PostgresAssetRepository,
  PostgresAssetServiceRepository,
  PostgresCostRepository,
  PostgresDocumentRepository,
  PostgresImprovementRepository,
  PostgresInspectionRepository,
  PostgresLeaseRepository,
  PostgresMaintenanceRepository,
  PostgresMeterRepository,
  PostgresOwnershipRepository,
  PostgresPartyRepository,
  PostgresPortfolioRepository,
  PostgresReportingRepository,
  PostgresTenancyRepository,
  PostgresUnitTimelineRepository,
  PostgresUserAccessRepository,
} from '../../src/index.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
}

const sql = postgres(connectionString, { max: 1 });
const portfolioRepository = new PostgresPortfolioRepository(sql);
const accessItemRepository = new PostgresAccessItemRepository(sql);
const assetRepository = new PostgresAssetRepository(sql);
const assetInventoryRepository = new PostgresAssetInventoryRepository(sql);
const assetServiceRepository = new PostgresAssetServiceRepository(sql);
const partyRepository = new PostgresPartyRepository(sql);
const ownershipRepository = new PostgresOwnershipRepository(sql);
const leaseRepository = new PostgresLeaseRepository(sql);
const tenancyRepository = new PostgresTenancyRepository(sql);
const accessRepository = new PostgresUserAccessRepository(sql);
const documentRepository = new PostgresDocumentRepository(sql);
const costRepository = new PostgresCostRepository(sql);
const inspectionRepository = new PostgresInspectionRepository(sql);
const improvementRepository = new PostgresImprovementRepository(sql);
const maintenanceRepository = new PostgresMaintenanceRepository(sql);
const meterRepository = new PostgresMeterRepository(sql);
const unitTimelineRepository = new PostgresUnitTimelineRepository(sql);
const reportingRepository = new PostgresReportingRepository(sql);

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
  await sql.unsafe(`
    do $test_roles$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
    end
    $test_roles$;
  `);

  await sql.unsafe(
    `drop table if exists
      public.api_rate_limit_buckets,
      public.meter_reading_boundaries,
      public.meter_readings,
      public.meters,
      public.access_item_transactions,
      public.access_items,
      public.cost_reversals,
      public.costs,
      public.maintenance_work_order_service_events,
      public.maintenance_work_orders,
      public.maintenance_issues,
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
      public.api_rate_limit_buckets,
      public.meter_reading_boundaries,
      public.meter_readings,
      public.meters,
      public.access_item_transactions,
      public.access_items,
      public.cost_reversals,
      public.costs,
      public.maintenance_work_order_service_events,
      public.maintenance_work_orders,
      public.maintenance_issues,
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

  it('keeps every public business table behind row-level security', async () => {
    const unprotected = await sql<{ relname: string }[]>`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not c.relrowsecurity
      order by c.relname
    `;

    expect(unprotected).toEqual([]);
  });
  it('denies direct browser-role access to business tables, views and reporting RPCs', async () => {
    const privileges = await sql<{
      anon_property_select: boolean;
      authenticated_timeline_select: boolean;
      authenticated_reporting_execute: boolean;
      timeline_security_invoker: boolean;
    }[]>`
      select
        has_table_privilege('anon', 'public.properties', 'select')
          as anon_property_select,
        has_table_privilege(
          'authenticated',
          'public.unit_business_events',
          'select'
        ) as authenticated_timeline_select,
        has_function_privilege(
          'authenticated',
          'public.reporting_unit_snapshots(date)',
          'execute'
        ) as authenticated_reporting_execute,
        exists (
          select 1
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname = 'unit_business_events'
            and 'security_invoker=true' = any(coalesce(c.reloptions, '{}'))
        ) as timeline_security_invoker
    `;

    expect(privileges[0]).toEqual({
      anon_property_select: false,
      authenticated_timeline_select: false,
      authenticated_reporting_execute: false,
      timeline_security_invoker: true,
    });

    const directRelationPrivileges = await sql<{
      role_name: string;
      relname: string;
    }[]>`
      select roles.role_name, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) roles(role_name)
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and (
          has_table_privilege(roles.role_name, c.oid, 'select')
          or has_table_privilege(roles.role_name, c.oid, 'insert')
          or has_table_privilege(roles.role_name, c.oid, 'update')
          or has_table_privilege(roles.role_name, c.oid, 'delete')
          or has_table_privilege(roles.role_name, c.oid, 'truncate')
          or has_table_privilege(roles.role_name, c.oid, 'references')
          or has_table_privilege(roles.role_name, c.oid, 'trigger')
        )
      order by roles.role_name, c.relname
    `;
    expect(directRelationPrivileges).toEqual([]);

    const directSequencePrivileges = await sql<{
      role_name: string;
      relname: string;
    }[]>`
      select roles.role_name, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) roles(role_name)
      where n.nspname = 'public'
        and c.relkind = 'S'
        and (
          has_sequence_privilege(roles.role_name, c.oid, 'usage')
          or has_sequence_privilege(roles.role_name, c.oid, 'select')
          or has_sequence_privilege(roles.role_name, c.oid, 'update')
        )
      order by roles.role_name, c.relname
    `;
    expect(directSequencePrivileges).toEqual([]);

    const securityDefinerFunctions = await sql<{ routine: string }[]>`
      select p.oid::regprocedure::text as routine
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
      order by routine
    `;
    expect(securityDefinerFunctions).toEqual([]);

    const directFunctionPrivileges = await sql<{
      role_name: string;
      routine: string;
    }[]>`
      select
        roles.role_name,
        p.oid::regprocedure::text as routine
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'), ('authenticated')) roles(role_name)
      where n.nspname = 'public'
        and has_function_privilege(roles.role_name, p.oid, 'execute')
      order by roles.role_name, routine
    `;
    expect(directFunctionPrivileges).toEqual([]);

    const schemaPrivileges = await sql<{
      anon_create: boolean;
      authenticated_create: boolean;
    }[]>`
      select
        has_schema_privilege('anon', 'public', 'create') as anon_create,
        has_schema_privilege(
          'authenticated',
          'public',
          'create'
        ) as authenticated_create
    `;
    expect(schemaPrivileges[0]).toEqual({
      anon_create: false,
      authenticated_create: false,
    });

    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx.unsafe(
          'select * from public.unit_business_events limit 1',
        );
      }),
    ).rejects.toMatchObject({ code: '42501' });

    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx.unsafe(
          'select * from public.reporting_unit_snapshots(current_date) limit 1',
        );
      }),
    ).rejects.toMatchObject({ code: '42501' });

    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe('set local role anon');
        await tx.unsafe('select * from public.properties limit 1');
      }),
    ).rejects.toMatchObject({ code: '42501' });
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
      '61000000-0000-4000-8000-000000000014',
      '61000000-0000-4000-8000-000000000015',
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

    const agreementDocuments = await listLeaseAgreementDocumentsQuery(
      documentRepository,
      leaseRepository,
      actor,
      agreement.id,
    );
    expect(agreementDocuments).toHaveLength(1);
    expect(agreementDocuments[0]).toMatchObject({
      document: { id: document.id, code: 'DOC-DOC-INT' },
      link: {
        id: link.id,
        relation: 'signed_original',
        targetType: 'lease_agreement',
        targetId: agreement.id,
      },
      linkedVersion: {
        id: final.id,
        versionNumber: 1,
        fileName: 'signed-lease.pdf',
        status: 'final',
      },
    });

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

    const signedAmendment = await signLeaseAmendmentCommand(
      {
        leaseRepository,
        tenancyRepository,
        idGenerator: ids,
      },
      actor,
      asLeaseAmendmentId('62000000-0000-4000-8000-000000000004'),
      1,
      '2026-10-20',
      {
        currency: 'EUR',
        baseRent: '825',
      },
    );
    expect(signedAmendment.status).toBe('signed');

    const amendmentLink = await linkDocumentCommand(
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
        targetType: 'lease_amendment',
        targetId: signedAmendment.id,
      },
    );

    const amendmentDocuments = await listLeaseAmendmentDocumentsQuery(
      documentRepository,
      leaseRepository,
      actor,
      signedAmendment.id,
    );
    expect(amendmentDocuments).toHaveLength(1);
    expect(amendmentDocuments[0]).toMatchObject({
      link: {
        id: amendmentLink.id,
        relation: 'signed_original',
        targetType: 'lease_amendment',
        targetId: signedAmendment.id,
      },
      linkedVersion: {
        id: final.id,
        status: 'final',
      },
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



  it('keeps DocumentVersion evidence immutable while relocating storage through an append-only CAS chain', async () => {
    const documentId = '63000000-0000-4000-8000-000000000010';
    const versionId = asDocumentVersionId(
      '63000000-0000-4000-8000-000000000011',
    );
    const objectKey = `document-version:${versionId}`;

    await sql`
      insert into public.documents (
        id, code, title, category, status, latest_version_number, revision
      ) values (
        ${documentId},
        'RECOVERY-STORAGE-001',
        'Recovery storage evidence',
        'technical',
        'active',
        1,
        1
      )
    `;

    await sql`
      insert into public.document_versions (
        id, document_id, version_number, file_name, mime_type,
        byte_size, sha256, status, finalized_at,
        storage_provider, storage_object_id, storage_object_key
      ) values (
        ${versionId},
        ${documentId},
        1,
        'recovery.pdf',
        'application/pdf',
        4,
        ${'a'.repeat(64)},
        'final',
        '2026-09-24T12:00:00.000Z',
        'google-drive',
        'drive-original',
        ${objectKey}
      )
    `;

    const original = {
      provider: 'google-drive',
      objectId: 'drive-original',
      objectKey,
    };
    const recovered = {
      provider: 'google-drive',
      objectId: 'drive-recovered-1',
      objectKey,
    };

    await expect(
      documentRepository.getStorageReference(versionId),
    ).resolves.toEqual(original);

    await documentRepository.relocateStorageReference(
      versionId,
      original,
      recovered,
      'restore from secondary binary backup',
    );

    await expect(
      documentRepository.getStorageReference(versionId),
    ).resolves.toEqual(recovered);

    await expect(
      documentRepository.relocateStorageReference(
        versionId,
        original,
        {
          ...recovered,
          objectId: 'drive-recovered-stale-writer',
        },
        'stale recovery attempt',
      ),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_STORAGE_RELOCATION_CONFLICT',
    });

    await expect(
      sql`
        insert into public.document_version_storage_relocations (
          document_version_id,
          generation,
          previous_storage_provider,
          previous_storage_object_id,
          previous_storage_object_key,
          storage_provider,
          storage_object_id,
          storage_object_key,
          reason
        ) values (
          ${versionId},
          3,
          'google-drive',
          'drive-recovered-1',
          ${objectKey},
          'google-drive',
          'drive-recovered-3',
          ${objectKey},
          'skip one generation'
        )
      `,
    ).rejects.toMatchObject({
      constraint_name: 'document_storage_relocation_generation_chain',
    });

    await expect(
      sql`
        insert into public.document_version_storage_relocations (
          document_version_id,
          generation,
          previous_storage_provider,
          previous_storage_object_id,
          previous_storage_object_key,
          storage_provider,
          storage_object_id,
          storage_object_key,
          reason
        ) values (
          ${versionId},
          2,
          'google-drive',
          'wrong-previous-object',
          ${objectKey},
          'google-drive',
          'drive-recovered-2',
          ${objectKey},
          'wrong previous locator'
        )
      `,
    ).rejects.toMatchObject({
      constraint_name: 'document_storage_relocation_previous_mismatch',
    });

    await expect(
      sql`
        update public.document_version_storage_relocations
        set reason = 'rewrite history'
        where document_version_id = ${versionId}
          and generation = 1
      `,
    ).rejects.toMatchObject({
      constraint_name: 'document_storage_relocation_append_only',
    });

    const persistedVersion = await documentRepository.getVersionById(versionId);
    expect(persistedVersion).toMatchObject({
      id: versionId,
      byteSize: 4,
      sha256: 'a'.repeat(64),
      status: 'final',
    });

    const originalLocator = await sql<{
      storage_provider: string;
      storage_object_id: string;
      storage_object_key: string;
    }[]>`
      select storage_provider, storage_object_id, storage_object_key
      from public.document_versions
      where id = ${versionId}
    `;

    expect(originalLocator).toEqual([
      {
        storage_provider: 'google-drive',
        storage_object_id: 'drive-original',
        storage_object_key: objectKey,
      },
    ]);
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

    await expect(
      sql`
        update public.inspections
        set scheduled_for = '2026-09-22'
        where id = ${editableInspection.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_orchestration_version_progression',
    });

    const orchestratedInspection =
      await updateInspectionOrchestrationCommand(
        {
          inspectionRepository,
          staffDirectoryRepository: accessRepository,
        },
        actor,
        editableInspection.id,
        editableInspection.version,
        {
          assignedToUserId: editableInspection.assignedToUserId,
          scheduledFor: '2026-09-22',
        },
      );
    expect(orchestratedInspection).toMatchObject({
      scheduledFor: '2026-09-22',
      version: 2,
      status: 'draft',
    });

    const startedEditableInspection = await startInspectionCommand(
      {
        inspectionRepository,
        clock: { now: () => '2026-09-20T09:06:00.000Z' },
      },
      actor,
      editableInspection.id,
      orchestratedInspection.version,
    );

    await expect(
      sql`
        update public.inspections
        set scheduled_for = '2026-09-23',
            version = version + 1
        where id = ${editableInspection.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'inspection_orchestration_draft_only',
    });

    expect(startedEditableInspection.status).toBe('in_progress');

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


  it('does not backdate Project cancellation before child work history but allows later child cleanup cancellation', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });
    const ids = new SequenceIds([
      'ff200000-0000-4000-8000-000000000001',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-IMPROVEMENT-CANCEL-HISTORY',
        name: 'Improvement Cancellation History',
        propertyType: 'apartment_building',
        street: 'Temporal Street',
        houseNumber: '2',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );

    const projectId = 'ff2a0000-0000-4000-8000-000000000001';
    const itemId = 'ff2a0000-0000-4000-8000-000000000002';

    await sql`
      insert into public.improvement_projects (
        id, code, name, property_id, created_at, created_by_user_id
      ) values (
        ${projectId},
        'IMP-CANCEL-HISTORY',
        'Cancellation history sabotage',
        ${property.id},
        '2026-10-20T08:00:00.000Z',
        ${actor.userId}
      )
    `;
    await sql`
      update public.improvement_projects
      set status = 'planned',
          planned_at = '2026-10-20T08:05:00.000Z',
          version = 2
      where id = ${projectId}
    `;
    await sql`
      update public.improvement_projects
      set status = 'in_progress',
          started_at = '2026-10-20T08:10:00.000Z',
          version = 3
      where id = ${projectId}
    `;

    await sql`
      insert into public.improvement_work_items (
        id, project_id, code, title, created_at, created_by_user_id
      ) values (
        ${itemId},
        ${projectId},
        'WI-CANCEL-HISTORY',
        'Child completed after proposed parent cancellation',
        '2026-10-20T13:00:00.000Z',
        ${actor.userId}
      )
    `;
    await sql`
      update public.improvement_work_items
      set status = 'in_progress',
          started_at = '2026-10-20T14:00:00.000Z',
          version = 2
      where id = ${itemId}
    `;
    await sql`
      update public.improvement_work_items
      set status = 'completed',
          completed_at = '2026-10-20T16:00:00.000Z',
          version = 3
      where id = ${itemId}
    `;

    await expect(
      sql`
        update public.improvement_projects
        set status = 'cancelled',
            cancelled_at = '2026-10-20T12:00:00.000Z',
            version = 4
        where id = ${projectId}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name:
        'improvement_project_cancelled_before_work_item_history',
    });

    const cleanupProjectId = 'ff2a0000-0000-4000-8000-000000000003';
    const cleanupItemId = 'ff2a0000-0000-4000-8000-000000000004';

    await sql`
      insert into public.improvement_projects (
        id, code, name, property_id, created_at, created_by_user_id
      ) values (
        ${cleanupProjectId},
        'IMP-CANCEL-CLEANUP',
        'Cancellation cleanup policy',
        ${property.id},
        '2026-10-21T08:00:00.000Z',
        ${actor.userId}
      )
    `;
    await sql`
      update public.improvement_projects
      set status = 'planned',
          planned_at = '2026-10-21T08:05:00.000Z',
          version = 2
      where id = ${cleanupProjectId}
    `;
    await sql`
      update public.improvement_projects
      set status = 'in_progress',
          started_at = '2026-10-21T08:10:00.000Z',
          version = 3
      where id = ${cleanupProjectId}
    `;
    await sql`
      insert into public.improvement_work_items (
        id, project_id, code, title, created_at, created_by_user_id
      ) values (
        ${cleanupItemId},
        ${cleanupProjectId},
        'WI-CANCEL-CLEANUP',
        'Cleanup after parent cancellation',
        '2026-10-21T09:00:00.000Z',
        ${actor.userId}
      )
    `;
    await sql`
      update public.improvement_work_items
      set status = 'in_progress',
          started_at = '2026-10-21T10:00:00.000Z',
          version = 2
      where id = ${cleanupItemId}
    `;

    await sql`
      update public.improvement_projects
      set status = 'cancelled',
          cancelled_at = '2026-10-21T12:00:00.000Z',
          version = 4
      where id = ${cleanupProjectId}
    `;

    await sql`
      update public.improvement_work_items
      set status = 'cancelled',
          cancelled_at = '2026-10-21T13:00:00.000Z',
          version = 3
      where id = ${cleanupItemId}
    `;

    const cleanupRows = await sql<
      { project_cancelled_at: Date; item_cancelled_at: Date }[]
    >`
      select
        p.cancelled_at as project_cancelled_at,
        wi.cancelled_at as item_cancelled_at
      from public.improvement_projects p
      join public.improvement_work_items wi on wi.project_id = p.id
      where p.id = ${cleanupProjectId}
        and wi.id = ${cleanupItemId}
    `;
    expect(cleanupRows[0]?.project_cancelled_at.toISOString()).toBe(
      '2026-10-21T12:00:00.000Z',
    );
    expect(cleanupRows[0]?.item_cancelled_at.toISOString()).toBe(
      '2026-10-21T13:00:00.000Z',
    );
  });

  it('serializes Improvement parent lifecycle with child writes', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });
    const ids = new SequenceIds([
      'ff100000-0000-4000-8000-000000000001',
      'ff100000-0000-4000-8000-000000000002',
      'ff100000-0000-4000-8000-000000000003',
      'ff100000-0000-4000-8000-000000000004',
      'ff100000-0000-4000-8000-000000000005',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-IMPROVEMENT-CONCURRENCY',
        name: 'Improvement Concurrency',
        propertyType: 'apartment_building',
        street: 'Lock Street',
        houseNumber: '1',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );

    const createStartedProject = async (
      code: string,
      createdAt: string,
      plannedAt: string,
      startedAt: string,
    ) => {
      const project = await createImprovementProjectCommand(
        {
          improvementRepository,
          portfolioRepository,
          partyRepository,
          assetRepository,
          idGenerator: ids,
          clock: { now: () => createdAt },
        },
        actor,
        {
          code,
          name: code,
          propertyId: property.id,
        },
      );
      const planned = await changeImprovementProjectStatusCommand(
        {
          improvementRepository,
          clock: { now: () => plannedAt },
        },
        actor,
        project.id,
        project.version,
        'plan',
      );
      return changeImprovementProjectStatusCommand(
        {
          improvementRepository,
          clock: { now: () => startedAt },
        },
        actor,
        project.id,
        planned.version,
        'start',
      );
    };

    const projectForChildRace = await createStartedProject(
      'IMP-CONCURRENCY-CHILD',
      '2026-10-10T08:00:00.000Z',
      '2026-10-10T08:05:00.000Z',
      '2026-10-10T09:00:00.000Z',
    );
    const projectForRecordRace = await createStartedProject(
      'IMP-CONCURRENCY-RECORD',
      '2026-10-11T08:00:00.000Z',
      '2026-10-11T08:05:00.000Z',
      '2026-10-11T09:00:00.000Z',
    );
    const projectForReverseRace = await createStartedProject(
      'IMP-CONCURRENCY-REVERSE',
      '2026-10-12T08:00:00.000Z',
      '2026-10-12T08:05:00.000Z',
      '2026-10-12T09:00:00.000Z',
    );
    const itemForRecordRace = await createWorkItemCommand(
      {
        improvementRepository,
        idGenerator: ids,
        clock: { now: () => '2026-10-11T09:05:00.000Z' },
      },
      actor,
      projectForRecordRace.id,
      {
        code: 'WI-CONCURRENCY-RECORD',
        title: 'Concurrent work',
      },
    );
    const activeItem = await changeWorkItemStatusCommand(
      {
        improvementRepository,
        clock: { now: () => '2026-10-11T10:00:00.000Z' },
      },
      actor,
      itemForRecordRace.id,
      itemForRecordRace.version,
      'start',
    );

    const blocker = postgres(connectionString, { max: 1 });
    const contender = postgres(connectionString, { max: 1 });

    function deferred() {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }

    try {
      const projectLocked = deferred();
      const releaseProject = deferred();
      const completingProject = blocker.begin(async (tx) => {
        await tx`
          update public.improvement_projects
          set status = 'completed',
              completed_at = '2026-10-10T12:00:00.000Z',
              version = version + 1
          where id = ${projectForChildRace.id}
        `;
        projectLocked.resolve();
        await releaseProject.promise;
      });

      await projectLocked.promise;

      await expect(
        contender.begin(async (tx) => {
          await tx.unsafe("set local lock_timeout = '250ms'");
          await tx`
            insert into public.improvement_work_items (
              id, project_id, code, title, status, version,
              created_at, created_by_user_id
            ) values (
              'ff1f0000-0000-4000-8000-000000000001',
              ${projectForChildRace.id},
              'WI-RACE',
              'Concurrent child',
              'planned',
              1,
              '2026-10-10T12:00:01.000Z',
              ${actor.userId}
            )
          `;
        }),
      ).rejects.toMatchObject({ code: '55P03' });

      releaseProject.resolve();
      await completingProject;

      await expect(
        contender`
          insert into public.improvement_work_items (
            id, project_id, code, title, status, version,
            created_at, created_by_user_id
          ) values (
            'ff1f0000-0000-4000-8000-000000000001',
            ${projectForChildRace.id},
            'WI-RACE',
            'Concurrent child',
            'planned',
            1,
            '2026-10-10T12:00:01.000Z',
            ${actor.userId}
          )
        `,
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'improvement_work_item_project_terminal',
      });

      const itemLocked = deferred();
      const releaseItem = deferred();
      const completingItem = blocker.begin(async (tx) => {
        await tx`
          update public.improvement_work_items
          set status = 'completed',
              completed_at = '2026-10-11T12:00:00.000Z',
              version = version + 1
          where id = ${activeItem.id}
        `;
        itemLocked.resolve();
        await releaseItem.promise;
      });

      await itemLocked.promise;

      await expect(
        contender.begin(async (tx) => {
          await tx.unsafe("set local lock_timeout = '250ms'");
          await tx`
            insert into public.improvement_work_records (
              id, project_id, work_item_id, performed_at,
              description, recorded_at, recorded_by_user_id, sealed
            ) values (
              'ff1f0000-0000-4000-8000-000000000002',
              ${projectForRecordRace.id},
              ${activeItem.id},
              '2026-10-11T13:00:00.000Z',
              'Concurrent work record',
              '2026-10-11T14:00:00.000Z',
              ${actor.userId},
              false
            )
          `;
        }),
      ).rejects.toMatchObject({ code: '55P03' });

      releaseItem.resolve();
      await completingItem;

      await expect(
        contender`
          insert into public.improvement_work_records (
            id, project_id, work_item_id, performed_at,
            description, recorded_at, recorded_by_user_id, sealed
          ) values (
            'ff1f0000-0000-4000-8000-000000000002',
            ${projectForRecordRace.id},
            ${activeItem.id},
            '2026-10-11T13:00:00.000Z',
            'Concurrent work record',
            '2026-10-11T14:00:00.000Z',
            ${actor.userId},
            false
          )
        `,
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'improvement_work_record_after_terminal_time',
      });

      const childLockedProject = deferred();
      const releaseChild = deferred();
      const insertingChild = blocker.begin(async (tx) => {
        await tx`
          insert into public.improvement_work_items (
            id, project_id, code, title, status, version,
            created_at, created_by_user_id
          ) values (
            'ff1f0000-0000-4000-8000-000000000003',
            ${projectForReverseRace.id},
            'WI-REVERSE-RACE',
            'Child gets shared lock first',
            'planned',
            1,
            '2026-10-12T10:00:00.000Z',
            ${actor.userId}
          )
        `;
        childLockedProject.resolve();
        await releaseChild.promise;
      });

      await childLockedProject.promise;

      await expect(
        contender.begin(async (tx) => {
          await tx.unsafe("set local lock_timeout = '250ms'");
          await tx`
            update public.improvement_projects
            set status = 'completed',
                completed_at = '2026-10-12T12:00:00.000Z',
                version = version + 1
            where id = ${projectForReverseRace.id}
          `;
        }),
      ).rejects.toMatchObject({ code: '55P03' });

      releaseChild.resolve();
      await insertingChild;

      await expect(
        contender`
          update public.improvement_projects
          set status = 'completed',
              completed_at = '2026-10-12T12:00:00.000Z',
              version = version + 1
          where id = ${projectForReverseRace.id}
        `,
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'improvement_project_open_work_items',
      });
    } finally {
      await Promise.all([blocker.end(), contender.end()]);
    }
  });




  it('anchors Maintenance scope at reportedAt and enforces originating Finding time', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });
    const ids = new SequenceIds([
      'ab000000-0000-4000-8000-000000000001',
      'ab000000-0000-4000-8000-000000000002',
      'ab000000-0000-4000-8000-000000000003',
      'ab000000-0000-4000-8000-000000000004',
      'ab000000-0000-4000-8000-000000000005',
      'ab000000-0000-4000-8000-000000000006',
      'ab000000-0000-4000-8000-000000000007',
      'ab000000-0000-4000-8000-000000000008',
      'ab000000-0000-4000-8000-000000000009',
      'ab000000-0000-4000-8000-000000000010',
      'ab000000-0000-4000-8000-000000000011',
      'ab000000-0000-4000-8000-000000000012',
      'ab000000-0000-4000-8000-000000000013',
      'ab000000-0000-4000-8000-000000000014',
      'ab000000-0000-4000-8000-000000000015',
      'ab000000-0000-4000-8000-000000000016',
      'ab000000-0000-4000-8000-000000000017',
      'ab000000-0000-4000-8000-000000000018',
      'ab000000-0000-4000-8000-000000000019',
      'ab000000-0000-4000-8000-000000000020',
    ]);
    const inspectionIds = new SequenceIds([
      'ab100000-0000-4000-8000-000000000001',
      'ab100000-0000-4000-8000-000000000002',
      'ab100000-0000-4000-8000-000000000003',
      'ab100000-0000-4000-8000-000000000004',
      'ab100000-0000-4000-8000-000000000005',
      'ab100000-0000-4000-8000-000000000006',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-MAINT-HISTORY',
        name: 'Maintenance history property',
        propertyType: 'apartment_building',
        street: 'History Street',
        houseNumber: '20',
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
        code: 'UNIT-MAINT-A',
        unitNumber: 'A',
        unitType: 'apartment',
      },
    );
    const spaceA = await createSpaceCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        unitId: unitA.id,
        code: 'ROOM-A',
        name: 'Room A',
        spaceType: 'storage',
      },
    );
    const unitB = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-MAINT-B',
        unitNumber: 'B',
        unitType: 'apartment',
      },
    );
    const spaceB = await createSpaceCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        unitId: unitB.id,
        code: 'ROOM-B',
        name: 'Room B',
        spaceType: 'storage',
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
        code: 'ASSET-MAINT-HISTORY',
        name: 'Movable maintenance asset',
        propertyId: property.id,
        unitId: unitA.id,
        spaceId: spaceA.id,
      },
    );

    const schema = await createInspectionSchemaVersionCommand(
      { inspectionRepository, idGenerator: inspectionIds },
      actor,
      {
        schemaCode: 'MAINT-ORIGIN',
        inspectionType: 'periodic',
        title: 'Maintenance origin inspection',
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
                label: 'Condition',
                sortOrder: 0,
              },
            ],
          },
        ],
      },
    );
    const published = await publishInspectionSchemaVersionCommand(
      inspectionRepository,
      actor,
      schema.id,
    );
    const inspection = await createInspectionCommand(
      {
        inspectionRepository,
        portfolioRepository,
        tenancyRepository,
        staffDirectoryRepository: accessRepository,
        idGenerator: inspectionIds,
        clock: { now: () => '2026-09-19T10:10:00.000Z' },
      },
      actor,
      {
        code: 'INS-MAINT-ORIGIN',
        inspectionType: 'periodic',
        unitId: unitA.id,
        schemaVersionId: published.id,
        assignedToUserId:
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as import('@portfolio/domain').UserId,
      },
    );
    await startInspectionCommand(
      {
        inspectionRepository,
        clock: { now: () => '2026-09-19T10:15:00.000Z' },
      },
      actor,
      inspection.id,
      inspection.version,
    );
    const finding = await createInspectionFindingCommand(
      {
        inspectionRepository,
        idGenerator: inspectionIds,
        clock: { now: () => '2026-09-19T10:20:00.000Z' },
      },
      actor,
      inspection.id,
      {
        sectionId: published.sections[0]!.id,
        itemId: published.sections[0]!.items[0]!.id,
        severity: 'major',
        title: 'Historical maintenance finding',
      },
    );

    const moved = await moveAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T12:00:00.000Z' },
      },
      actor,
      asset.id,
      {
        expectedVersion: asset.version,
        propertyId: property.id,
        unitId: unitB.id,
        spaceId: spaceB.id,
        reason: 'Moved after the reported maintenance occurrence',
      },
    );
    expect(moved).toMatchObject({
      unitId: unitB.id,
      spaceId: spaceB.id,
      version: 2,
    });
    expect(await assetRepository.getLocationAt(asset.id, '2026-09-19T10:30:00.000Z'))
      .toMatchObject({ unitId: unitA.id, spaceId: spaceA.id });
    expect(await assetRepository.getLocationAt(asset.id, '2026-09-19T12:00:00.000Z'))
      .toMatchObject({ unitId: unitB.id, spaceId: spaceB.id });

    const maintenanceDeps = {
      maintenanceRepository,
      portfolioRepository,
      assetRepository,
      assetServiceRepository,
      inspectionRepository,
      partyRepository,
      staffDirectoryRepository: accessRepository,
      idGenerator: ids,
      clock: { now: () => '2026-09-19T15:00:00.000Z' },
    };

    await expect(
      createMaintenanceIssueCommand(
        maintenanceDeps,
        actor,
        {
          code: 'MI-BEFORE-FINDING-APP',
          propertyId: property.id,
          unitId: unitA.id,
          inspectionFindingId: finding.id,
          title: 'Impossible origin ordering',
          priority: 'normal',
          reportedAt: '2026-09-19T10:19:00.000Z',
        },
      ),
    ).rejects.toMatchObject({
      code: 'MAINTENANCE_FINDING_REPORTED_BEFORE_ORIGIN',
    });

    await expect(
      sql`
        insert into public.maintenance_issues (
          id, code, property_id, unit_id, inspection_finding_id,
          title, priority, status, reported_at, version,
          recorded_at, recorded_by_user_id
        ) values (
          'abf00000-0000-4000-8000-000000000001',
          'MI-BEFORE-FINDING-DB',
          ${property.id},
          ${unitA.id},
          ${finding.id},
          'Impossible origin ordering in SQL',
          'normal',
          'open',
          '2026-09-19T10:19:00.000Z',
          1,
          '2026-09-19T15:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'maintenance_issue_finding_temporal_invalid',
    });

    const historicalIssue = await createMaintenanceIssueCommand(
      maintenanceDeps,
      actor,
      {
        code: 'MI-HISTORICAL-ASSET',
        propertyId: property.id,
        unitId: unitA.id,
        spaceId: spaceA.id,
        assetId: asset.id,
        inspectionFindingId: finding.id,
        title: 'Issue reported before Asset move',
        priority: 'high',
        reportedAt: '2026-09-19T10:30:00.000Z',
      },
    );
    expect(historicalIssue).toMatchObject({
      unitId: unitA.id,
      spaceId: spaceA.id,
      assetId: asset.id,
      inspectionFindingId: finding.id,
      reportedAt: '2026-09-19T10:30:00.000Z',
      recordedAt: '2026-09-19T15:00:00.000Z',
    });
    expect((await assetRepository.getById(asset.id))?.unitId).toBe(unitB.id);

    // Sequential sabotage: once an Issue has captured Unit A at 13:00,
    // a later direct-SQL backdated move may not close that interval at 12:00.
    const protectedAsset = await createAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T10:00:00.000Z' },
      },
      actor,
      {
        code: 'ASSET-MAINT-SNAPSHOT-GUARD',
        name: 'Asset with protected Maintenance snapshot',
        propertyId: property.id,
        unitId: unitA.id,
        spaceId: spaceA.id,
      },
    );
    const protectedIssue = await createMaintenanceIssueCommand(
      {
        ...maintenanceDeps,
        clock: { now: () => '2026-09-19T15:00:00.000Z' },
      },
      actor,
      {
        code: 'MI-PROTECTED-HISTORY',
        propertyId: property.id,
        unitId: unitA.id,
        spaceId: spaceA.id,
        assetId: protectedAsset.id,
        title: 'Historical scope must survive later Asset edits',
        priority: 'normal',
        reportedAt: '2026-09-19T13:00:00.000Z',
      },
    );
    expect(protectedIssue).toMatchObject({
      assetId: protectedAsset.id,
      unitId: unitA.id,
      spaceId: spaceA.id,
      reportedAt: '2026-09-19T13:00:00.000Z',
      recordedAt: '2026-09-19T15:00:00.000Z',
    });

    const protectedLocation = await assetRepository.getCurrentLocation(
      protectedAsset.id,
    );
    expect(protectedLocation).toMatchObject({
      unitId: unitA.id,
      spaceId: spaceA.id,
      validFrom: '2026-09-19T10:00:00.000Z',
      validTo: null,
    });

    await expect(
      sql`
        update public.asset_location_history
        set valid_to = '2026-09-19T12:00:00.000Z'
        where id = ${protectedLocation!.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'maintenance_issue_asset_history_snapshot_conflict',
    });

    // Positive boundary: closing the interval after the Issue occurrence
    // preserves [10:00, 14:00), so the 13:00 snapshot remains true.
    const protectedMoved = await moveAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T14:00:00.000Z' },
      },
      actor,
      protectedAsset.id,
      {
        expectedVersion: protectedAsset.version,
        propertyId: property.id,
        unitId: unitB.id,
        spaceId: spaceB.id,
        reason: 'Backdated move after the protected Issue occurrence',
      },
    );
    expect(protectedMoved).toMatchObject({
      unitId: unitB.id,
      spaceId: spaceB.id,
      version: protectedAsset.version + 1,
    });
    expect(
      await assetRepository.getLocationAt(
        protectedAsset.id,
        '2026-09-19T13:00:00.000Z',
      ),
    ).toMatchObject({
      unitId: unitA.id,
      spaceId: spaceA.id,
      validTo: '2026-09-19T14:00:00.000Z',
    });
    expect(
      await assetRepository.getLocationAt(
        protectedAsset.id,
        '2026-09-19T14:00:00.000Z',
      ),
    ).toMatchObject({
      unitId: unitB.id,
      spaceId: spaceB.id,
      validFrom: '2026-09-19T14:00:00.000Z',
    });

    await expect(
      createMaintenanceIssueCommand(
        maintenanceDeps,
        actor,
        {
          code: 'MI-WRONG-CURRENT-SCOPE',
          propertyId: property.id,
          unitId: unitB.id,
          spaceId: spaceB.id,
          assetId: asset.id,
          title: 'Must not use current projection for historical occurrence',
          priority: 'normal',
          reportedAt: '2026-09-19T10:30:00.000Z',
        },
      ),
    ).rejects.toMatchObject({ code: 'MAINTENANCE_ASSET_SCOPE_MISMATCH' });

    await expect(
      createMaintenanceIssueCommand(
        maintenanceDeps,
        actor,
        {
          code: 'MI-BEFORE-ASSET-EXISTED',
          propertyId: property.id,
          unitId: unitA.id,
          spaceId: spaceA.id,
          assetId: asset.id,
          title: 'Asset did not yet have a managed location',
          priority: 'normal',
          reportedAt: '2026-09-19T09:59:00.000Z',
        },
      ),
    ).rejects.toMatchObject({ code: 'MAINTENANCE_ASSET_LOCATION_NOT_FOUND' });

    await expect(
      sql`
        insert into public.maintenance_issues (
          id, code, property_id, unit_id, space_id, asset_id,
          title, priority, status, reported_at, version,
          recorded_at, recorded_by_user_id
        ) values (
          'abf00000-0000-4000-8000-000000000002',
          'MI-WRONG-CURRENT-SCOPE-DB',
          ${property.id},
          ${unitB.id},
          ${spaceB.id},
          ${asset.id},
          'Current projection must not replace historical scope',
          'normal',
          'open',
          '2026-09-19T10:30:00.000Z',
          1,
          '2026-09-19T15:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'maintenance_issue_asset_scope_mismatch',
    });

    await expect(
      sql`
        insert into public.maintenance_issues (
          id, code, property_id, unit_id, space_id, asset_id,
          title, priority, status, reported_at, version,
          recorded_at, recorded_by_user_id
        ) values (
          'abf00000-0000-4000-8000-000000000003',
          'MI-NO-HISTORY-DB',
          ${property.id},
          ${unitA.id},
          ${spaceA.id},
          ${asset.id},
          'No location existed yet',
          'normal',
          'open',
          '2026-09-19T09:59:00.000Z',
          1,
          '2026-09-19T15:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'maintenance_issue_asset_location_missing',
    });

    await expect(
      sql`
        update public.inspection_findings
        set created_at = '2026-09-19T10:31:00.000Z'
        where id = ${finding.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'maintenance_origin_finding_created_at_immutable',
    });

    const currentLocation = await assetRepository.getCurrentLocation(asset.id);
    expect(currentLocation).toMatchObject({
      unitId: unitB.id,
      spaceId: spaceB.id,
      validFrom: '2026-09-19T12:00:00.000Z',
      validTo: null,
    });

    const blocker = postgres(connectionString, { max: 1 });
    const contender = postgres(connectionString, { max: 1 });
    let releaseMove!: () => void;
    const moveHeld = new Promise<void>((resolve) => {
      releaseMove = resolve;
    });
    let moveLockedResolve!: () => void;
    const moveLocked = new Promise<void>((resolve) => {
      moveLockedResolve = resolve;
    });

    try {
      const moving = blocker.begin(async (tx) => {
        await tx`
          update public.asset_location_history
          set valid_to = '2026-09-19T14:00:00.000Z'
          where id = ${currentLocation!.id}
        `;
        await tx`
          insert into public.asset_location_history (
            id, asset_id, property_id, unit_id, space_id,
            valid_from, change_type, changed_by_user_id, reason
          ) values (
            'abf10000-0000-4000-8000-000000000001',
            ${asset.id},
            ${property.id},
            ${unitA.id},
            ${spaceA.id},
            '2026-09-19T14:00:00.000Z',
            'moved',
            ${actor.userId},
            'Concurrent move while historical Maintenance scope is inserted'
          )
        `;
        await tx`
          update public.assets
          set property_id = ${property.id},
              unit_id = ${unitA.id},
              space_id = ${spaceA.id},
              version = version + 1
          where id = ${asset.id}
        `;
        moveLockedResolve();
        await moveHeld;
      });

      await moveLocked;

      await expect(
        contender.begin(async (tx) => {
          await tx.unsafe("set local lock_timeout = '250ms'");
          await tx`
            insert into public.maintenance_issues (
              id, code, property_id, unit_id, space_id, asset_id,
              title, priority, status, reported_at, version,
              recorded_at, recorded_by_user_id
            ) values (
              'abf10000-0000-4000-8000-000000000002',
              'MI-MOVE-RACE',
              ${property.id},
              ${unitB.id},
              ${spaceB.id},
              ${asset.id},
              'Historical scope races with location interval closure',
              'normal',
              'open',
              '2026-09-19T13:00:00.000Z',
              1,
              '2026-09-19T15:00:00.000Z',
              ${actor.userId}
            )
          `;
        }),
      ).rejects.toMatchObject({ code: '55P03' });

      releaseMove();
      await moving;

      await contender`
        insert into public.maintenance_issues (
          id, code, property_id, unit_id, space_id, asset_id,
          title, priority, status, reported_at, version,
          recorded_at, recorded_by_user_id
        ) values (
          'abf10000-0000-4000-8000-000000000002',
          'MI-MOVE-RACE',
          ${property.id},
          ${unitB.id},
          ${spaceB.id},
          ${asset.id},
          'Historical scope races with location interval closure',
          'normal',
          'open',
          '2026-09-19T13:00:00.000Z',
          1,
          '2026-09-19T15:00:00.000Z',
          ${actor.userId}
        )
      `;

      expect(
        await assetRepository.getLocationAt(asset.id, '2026-09-19T13:00:00.000Z'),
      ).toMatchObject({
        unitId: unitB.id,
        spaceId: spaceB.id,
        validTo: '2026-09-19T14:00:00.000Z',
      });
    } finally {
      releaseMove();
      await Promise.all([blocker.end(), contender.end()]);
    }
  });


  it('persists Maintenance workflow and rejects lifecycle, linkage and concurrency bypasses', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });
    const ids = new SequenceIds([
      'ac000000-0000-4000-8000-000000000001',
      'ac000000-0000-4000-8000-000000000002',
      'ac000000-0000-4000-8000-000000000003',
      'ac000000-0000-4000-8000-000000000004',
      'ac000000-0000-4000-8000-000000000005',
      'ac000000-0000-4000-8000-000000000006',
      'ac000000-0000-4000-8000-000000000007',
      'ac000000-0000-4000-8000-000000000008',
      'ac000000-0000-4000-8000-000000000009',
      'ac000000-0000-4000-8000-000000000010',
      'ac000000-0000-4000-8000-000000000011',
      'ac000000-0000-4000-8000-000000000012',
      'ac000000-0000-4000-8000-000000000013',
      'ac000000-0000-4000-8000-000000000014',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-MAINT-INT',
        name: 'Maintenance Integration Property',
        propertyType: 'apartment_building',
        street: 'Maintenance Street',
        houseNumber: '19',
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
        code: 'UNIT-MAINT-INT',
        unitNumber: 'M1',
        unitType: 'apartment',
      },
    );
    const space = await createSpaceCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        unitId: unit.id,
        code: 'UTILITY-MAINT-INT',
        name: 'Utility room',
        spaceType: 'storage',
      },
    );
    const asset = await createAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T09:00:00.000Z' },
      },
      actor,
      {
        code: 'ASSET-MAINT-INT',
        name: 'Boiler',
        propertyId: property.id,
        unitId: unit.id,
        spaceId: space.id,
      },
    );

    const maintenanceDeps = {
      maintenanceRepository,
      portfolioRepository,
      assetRepository,
      assetServiceRepository,
      inspectionRepository,
      partyRepository,
      staffDirectoryRepository: accessRepository,
      idGenerator: ids,
      clock: { now: () => '2026-09-19T09:10:00.000Z' },
    };

    const issue = await createMaintenanceIssueCommand(
      maintenanceDeps,
      actor,
      {
        code: 'MI-INT-1',
        propertyId: property.id,
        unitId: unit.id,
        spaceId: space.id,
        assetId: asset.id,
        title: 'Boiler stops during heating',
        description: 'Intermittent shutdown under load.',
        priority: 'high',
        reportedAt: '2026-09-19T09:05:00.000Z',
      },
    );
    expect(issue).toMatchObject({
      status: 'open',
      assetId: asset.id,
      unitId: unit.id,
      spaceId: space.id,
      version: 1,
    });

    await sql`
      insert into public.maintenance_issues (
        id, code, property_id,
        title, priority, status, reported_at, version,
        recorded_at, recorded_by_user_id
      ) values (
        'acf00000-0000-4000-8000-000000000006',
        'MI-WO-TIME-PARENT',
        ${property.id},
        'Parent Issue for WorkOrder timestamp parity',
        'normal',
        'open',
        '2026-09-19T08:00:00.000Z',
        1,
        '2026-09-19T10:00:00.000Z',
        ${actor.userId}
      )
    `;

    await expect(
      sql`
        insert into public.maintenance_work_orders (
          id, issue_id, code, title, status, version,
          created_at, created_by_user_id
        ) values (
          'acf00000-0000-4000-8000-000000000007',
          'acf00000-0000-4000-8000-000000000006',
          'MWO-BEFORE-PARENT-RECORDED',
          'Illegal WorkOrder before parent recording',
          'draft',
          1,
          '2026-09-19T09:59:59.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'maintenance_work_order_before_issue_recorded',
    });

    await sql`
      insert into public.maintenance_work_orders (
        id, issue_id, code, title, status, version,
        created_at, created_by_user_id
      ) values (
        'acf00000-0000-4000-8000-000000000008',
        'acf00000-0000-4000-8000-000000000006',
        'MWO-AT-PARENT-RECORDED',
        'Exact Issue recording boundary',
        'draft',
        1,
        '2026-09-19T10:00:00.000Z',
        ${actor.userId}
      )
    `;

    const exactBoundaryWorkOrder = await maintenanceRepository.getWorkOrderById(
      'acf00000-0000-4000-8000-000000000008' as import('@portfolio/domain').MaintenanceWorkOrderId,
    );
    expect(exactBoundaryWorkOrder).toMatchObject({
      status: 'draft',
      createdAt: '2026-09-19T10:00:00.000Z',
    });

    await expect(
      sql`
        insert into public.maintenance_issues (
          id, code, property_id, asset_id,
          title, priority, status, reported_at, version,
          recorded_at, recorded_by_user_id
        ) values (
          'acf00000-0000-4000-8000-000000000001',
          'MI-BAD-ASSET-SCOPE',
          ${property.id},
          ${asset.id},
          'Wrong historical placement',
          'normal',
          'open',
          '2026-09-19T09:05:00.000Z',
          1,
          '2026-09-19T09:10:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'maintenance_issue_asset_scope_mismatch',
    });

    const order = await createMaintenanceWorkOrderCommand(
      {
        maintenanceRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T09:15:00.000Z' },
      },
      actor,
      issue.id,
      {
        code: 'MWO-INT-1',
        title: 'Diagnose boiler shutdown',
      },
    );
    const assigned = await assignMaintenanceWorkOrderCommand(
      {
        maintenanceRepository,
        staffDirectoryRepository: accessRepository,
        partyRepository,
        clock: { now: () => '2026-09-19T09:20:00.000Z' },
      },
      actor,
      order.id,
      order.version,
      { kind: 'user', userId: actor.userId },
    );
    const started = await changeMaintenanceWorkOrderStatusCommand(
      {
        maintenanceRepository,
        assetServiceRepository,
        clock: { now: () => '2026-09-19T09:25:00.000Z' },
      },
      actor,
      assigned.id,
      assigned.version,
      'start',
    );

    const serviceEvent = await recordServiceEventCommand(
      {
        assetRepository,
        assetServiceRepository,
        partyRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T09:35:00.000Z' },
      },
      actor,
      asset.id,
      {
        eventType: 'repair',
        performedAt: '2026-09-19T09:30:00.000Z',
        description: 'Reset controller and replaced relay.',
      },
    );

    const link = await linkServiceEventToMaintenanceWorkOrderCommand(
      {
        maintenanceRepository,
        assetServiceRepository,
        clock: { now: () => '2026-09-19T09:40:00.000Z' },
      },
      actor,
      started.id,
      serviceEvent.id,
    );
    expect(link).toMatchObject({
      workOrderId: started.id,
      serviceEventId: serviceEvent.id,
    });

    const completed = await changeMaintenanceWorkOrderStatusCommand(
      {
        maintenanceRepository,
        assetServiceRepository,
        clock: { now: () => '2026-09-19T09:45:00.000Z' },
      },
      actor,
      started.id,
      started.version,
      'complete',
    );
    expect(completed.status).toBe('completed');

    const resolved = await changeMaintenanceIssueStatusCommand(
      {
        maintenanceRepository,
        clock: { now: () => '2026-09-19T09:50:00.000Z' },
      },
      actor,
      issue.id,
      issue.version,
      'resolve',
    );
    expect(resolved.status).toBe('resolved');

    await expect(
      sql`
        insert into public.maintenance_work_orders (
          id, issue_id, code, title, status, version,
          created_at, created_by_user_id
        ) values (
          'acf00000-0000-4000-8000-000000000002',
          ${issue.id},
          'MWO-AFTER-RESOLVE',
          'Illegal child after resolution',
          'draft',
          1,
          '2026-09-19T10:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'maintenance_work_order_parent_terminal',
    });

    await expect(
      sql`
        delete from public.maintenance_work_orders
        where id = ${completed.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'maintenance_work_order_immutable',
    });

    const cost = await createCostCommand(
      {
        costRepository,
        portfolioRepository,
        partyRepository,
        assetRepository,
        assetServiceRepository,
        improvementRepository,
        maintenanceRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T10:00:00.000Z' },
      },
      actor,
      {
        source: {
          kind: 'maintenance_work_order',
          maintenanceWorkOrderId: completed.id,
        },
        description: 'Boiler repair allocation',
        amount: '180.00',
        currency: 'CHF',
        incurredOn: '2026-09-19',
        reportingClass: 'opex',
      },
    );
    expect(cost.source).toEqual({
      kind: 'maintenance_work_order',
      maintenanceWorkOrderId: completed.id,
    });
    expect(
      await costRepository.listCostsBySource({
        kind: 'maintenance_work_order',
        maintenanceWorkOrderId: completed.id,
      }),
    ).toHaveLength(1);

    await expect(
      sql`
        insert into public.costs (
          id, source_kind,
          maintenance_issue_id, maintenance_work_order_id,
          description, amount, currency, incurred_on, reporting_class,
          recorded_at, recorded_by_user_id
        ) values (
          'acf00000-0000-4000-8000-000000000003',
          'maintenance_work_order',
          ${issue.id},
          ${completed.id},
          'Ambiguous Maintenance cost source',
          1,
          'CHF',
          '2026-09-19',
          'opex',
          '2026-09-19T10:01:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'costs_exactly_one_source',
    });

    await sql`
      insert into public.asset_service_events (
        id, asset_id, event_type, performed_at, description,
        recorded_at, recorded_by_user_id
      ) values (
        'acf00000-0000-4000-8000-000000000004',
        ${asset.id},
        'repair',
        '2026-09-19T09:24:00.000Z',
        'Predates WorkOrder start',
        '2026-09-19T10:05:00.000Z',
        ${actor.userId}
      )
    `;

    await expect(
      sql`
        insert into public.maintenance_work_order_service_events (
          work_order_id, service_event_id, linked_at, linked_by_user_id
        ) values (
          ${completed.id},
          'acf00000-0000-4000-8000-000000000004',
          '2026-09-19T10:06:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'maintenance_service_event_before_work_order',
    });

    const raceIssue = await createMaintenanceIssueCommand(
      {
        ...maintenanceDeps,
        clock: { now: () => '2026-09-19T11:00:00.000Z' },
      },
      actor,
      {
        code: 'MI-RACE-CHILD',
        propertyId: property.id,
        title: 'Issue resolution child race',
        priority: 'normal',
        reportedAt: '2026-09-19T10:59:00.000Z',
      },
    );
    const raceOrder = await createMaintenanceWorkOrderCommand(
      {
        maintenanceRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T11:05:00.000Z' },
      },
      actor,
      raceIssue.id,
      {
        code: 'MWO-RACE-COMPLETE',
        title: 'Completed prerequisite work',
      },
    );
    const raceAssigned = await assignMaintenanceWorkOrderCommand(
      {
        maintenanceRepository,
        staffDirectoryRepository: accessRepository,
        partyRepository,
        clock: { now: () => '2026-09-19T11:10:00.000Z' },
      },
      actor,
      raceOrder.id,
      raceOrder.version,
      { kind: 'user', userId: actor.userId },
    );
    const raceStarted = await changeMaintenanceWorkOrderStatusCommand(
      {
        maintenanceRepository,
        assetServiceRepository,
        clock: { now: () => '2026-09-19T11:15:00.000Z' },
      },
      actor,
      raceAssigned.id,
      raceAssigned.version,
      'start',
    );
    await changeMaintenanceWorkOrderStatusCommand(
      {
        maintenanceRepository,
        assetServiceRepository,
        clock: { now: () => '2026-09-19T11:20:00.000Z' },
      },
      actor,
      raceStarted.id,
      raceStarted.version,
      'complete',
    );

    const blocker = postgres(connectionString, { max: 1 });
    const contender = postgres(connectionString, { max: 1 });

    function deferred() {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }

    try {
      const childInserted = deferred();
      const releaseChild = deferred();
      const childWrite = blocker.begin(async (tx) => {
        await tx`
          insert into public.maintenance_work_orders (
            id, issue_id, code, title, status, version,
            created_at, created_by_user_id
          ) values (
            'acf00000-0000-4000-8000-000000000005',
            ${raceIssue.id},
            'MWO-RACE-LATE',
            'Concurrent draft child',
            'draft',
            1,
            '2026-09-19T11:21:00.000Z',
            ${actor.userId}
          )
        `;
        childInserted.resolve();
        await releaseChild.promise;
      });

      await childInserted.promise;

      await expect(
        contender.begin(async (tx) => {
          await tx.unsafe("set local lock_timeout = '250ms'");
          await tx`
            update public.maintenance_issues
            set status = 'resolved',
                resolved_at = '2026-09-19T11:30:00.000Z',
                version = version + 1
            where id = ${raceIssue.id}
          `;
        }),
      ).rejects.toMatchObject({ code: '55P03' });

      releaseChild.resolve();
      await childWrite;

      await expect(
        contender`
          update public.maintenance_issues
          set status = 'resolved',
              resolved_at = '2026-09-19T11:30:00.000Z',
              version = version + 1
          where id = ${raceIssue.id}
        `,
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'maintenance_issue_open_work_orders',
      });

      const linkRaceIssue = await createMaintenanceIssueCommand(
        {
          ...maintenanceDeps,
          clock: { now: () => '2026-09-19T12:00:00.000Z' },
        },
        actor,
        {
          code: 'MI-RACE-LINK',
          propertyId: property.id,
          unitId: unit.id,
          spaceId: space.id,
          assetId: asset.id,
          title: 'Service link cancellation race',
          priority: 'normal',
          reportedAt: '2026-09-19T11:59:00.000Z',
        },
      );
      const linkRaceOrder = await createMaintenanceWorkOrderCommand(
        {
          maintenanceRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-19T12:05:00.000Z' },
        },
        actor,
        linkRaceIssue.id,
        {
          code: 'MWO-RACE-LINK',
          title: 'Concurrent service link',
        },
      );
      const linkRaceAssigned = await assignMaintenanceWorkOrderCommand(
        {
          maintenanceRepository,
          staffDirectoryRepository: accessRepository,
          partyRepository,
          clock: { now: () => '2026-09-19T12:10:00.000Z' },
        },
        actor,
        linkRaceOrder.id,
        linkRaceOrder.version,
        { kind: 'user', userId: actor.userId },
      );
      const linkRaceStarted = await changeMaintenanceWorkOrderStatusCommand(
        {
          maintenanceRepository,
          assetServiceRepository,
          clock: { now: () => '2026-09-19T12:15:00.000Z' },
        },
        actor,
        linkRaceAssigned.id,
        linkRaceAssigned.version,
        'start',
      );
      const linkRaceEvent = await recordServiceEventCommand(
        {
          assetRepository,
          assetServiceRepository,
          partyRepository,
          idGenerator: ids,
          clock: { now: () => '2026-09-19T12:25:00.000Z' },
        },
        actor,
        asset.id,
        {
          eventType: 'repair',
          performedAt: '2026-09-19T12:20:00.000Z',
          description: 'Concurrent maintenance evidence',
        },
      );

      const linkInserted = deferred();
      const releaseLink = deferred();
      const linkWrite = blocker.begin(async (tx) => {
        await tx`
          insert into public.maintenance_work_order_service_events (
            work_order_id, service_event_id, linked_at, linked_by_user_id
          ) values (
            ${linkRaceStarted.id},
            ${linkRaceEvent.id},
            '2026-09-19T12:30:00.000Z',
            ${actor.userId}
          )
        `;
        linkInserted.resolve();
        await releaseLink.promise;
      });

      await linkInserted.promise;

      await expect(
        contender.begin(async (tx) => {
          await tx.unsafe("set local lock_timeout = '250ms'");
          await tx`
            update public.maintenance_work_orders
            set status = 'cancelled',
                cancelled_at = '2026-09-19T12:31:00.000Z',
                version = version + 1
            where id = ${linkRaceStarted.id}
          `;
        }),
      ).rejects.toMatchObject({ code: '55P03' });

      releaseLink.resolve();
      await linkWrite;

      await expect(
        contender`
          update public.maintenance_work_orders
          set status = 'cancelled',
              cancelled_at = '2026-09-19T12:31:00.000Z',
              version = version + 1
          where id = ${linkRaceStarted.id}
        `,
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'maintenance_work_order_has_service_events',
      });
    } finally {
      await Promise.all([blocker.end(), contender.end()]);
    }
  });


  it('persists AccessItem custody and rejects scope, temporal, state and concurrency bypasses', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      'ae000000-0000-4000-8000-000000000001',
      'ae000000-0000-4000-8000-000000000002',
      'ae000000-0000-4000-8000-000000000003',
      'ae000000-0000-4000-8000-000000000004',
      'ae000000-0000-4000-8000-000000000005',
      'ae000000-0000-4000-8000-000000000006',
      'ae000000-0000-4000-8000-000000000007',
      'ae000000-0000-4000-8000-000000000008',
      'ae000000-0000-4000-8000-000000000009',
      'ae000000-0000-4000-8000-000000000010',
      'ae000000-0000-4000-8000-000000000011',
      'ae000000-0000-4000-8000-000000000012',
      'ae000000-0000-4000-8000-000000000013',
      'ae000000-0000-4000-8000-000000000014',
      'ae000000-0000-4000-8000-000000000015',
      'ae000000-0000-4000-8000-000000000016',
      'ae000000-0000-4000-8000-000000000017',
      'ae000000-0000-4000-8000-000000000018',
      'ae000000-0000-4000-8000-000000000019',
      'ae000000-0000-4000-8000-000000000020',
      'ae000000-0000-4000-8000-000000000021',
      'ae000000-0000-4000-8000-000000000022',
      'ae000000-0000-4000-8000-000000000023',
      'ae000000-0000-4000-8000-000000000024',
      'ae000000-0000-4000-8000-000000000025',
      'ae000000-0000-4000-8000-000000000026',
      'ae000000-0000-4000-8000-000000000027',
      'ae000000-0000-4000-8000-000000000028',
      'ae000000-0000-4000-8000-000000000029',
      'ae000000-0000-4000-8000-000000000030',
      'ae000000-0000-4000-8000-000000000031',
      'ae000000-0000-4000-8000-000000000032',
      'ae000000-0000-4000-8000-000000000033',
      'ae000000-0000-4000-8000-000000000034',
      'ae000000-0000-4000-8000-000000000035',
      'ae000000-0000-4000-8000-000000000036',
      'ae000000-0000-4000-8000-000000000037',
      'ae000000-0000-4000-8000-000000000038',
      'ae000000-0000-4000-8000-000000000039',
      'ae000000-0000-4000-8000-000000000040',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-ACCESS-INT',
        name: 'Access Integration Property',
        propertyType: 'apartment_building',
        street: 'Access Street',
        houseNumber: '20',
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
        code: 'UNIT-ACCESS-A',
        unitNumber: 'A',
        unitType: 'apartment',
      },
    );
    const unitB = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-ACCESS-B',
        unitNumber: 'B',
        unitType: 'apartment',
      },
    );

    const partyA = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-ACCESS-A',
        partyType: 'person',
        firstName: 'Access',
        lastName: 'Tenant A',
      },
    );
    const partyB = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-ACCESS-B',
        partyType: 'person',
        firstName: 'Access',
        lastName: 'Tenant B',
      },
    );

    const tenancyA = await createTenancyCommand(
      {
        tenancyRepository,
        portfolioRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: unitA.id,
        code: 'TEN-ACCESS-A',
        parties: [
          { partyId: partyA.id, role: 'tenant', isPrimary: true },
        ],
      },
    );
    const plannedA = await planTenancyCommand(
      { tenancyRepository },
      actor,
      tenancyA.id,
      tenancyA.version,
      '2026-09-19',
    );
    const activeA = await activateTenancyCommand(
      { tenancyRepository },
      actor,
      plannedA.id,
      plannedA.version,
      '2026-09-19',
    );

    const tenancyB = await createTenancyCommand(
      {
        tenancyRepository,
        portfolioRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: unitB.id,
        code: 'TEN-ACCESS-B',
        parties: [
          { partyId: partyB.id, role: 'tenant', isPrimary: true },
        ],
      },
    );

    const accessDeps = {
      accessItemRepository,
      portfolioRepository,
      tenancyRepository,
      idGenerator: ids,
      clock: { now: () => '2026-09-19T10:00:00.000Z' },
    };

    await expect(
      sql`
        insert into public.access_items (
          id, code, kind, property_id, unit_id, label,
          status, retired_at, retired_by_user_id, retirement_reason, version,
          recorded_at, recorded_by_user_id
        ) values (
          'aef40000-0000-4000-8000-000000000001',
          'KEY-ACCESS-ILLEGAL-RETIRED',
          'key',
          ${property.id},
          ${unitA.id},
          'Illegal retired creation',
          'retired',
          '2026-09-19T09:00:00.000Z',
          ${actor.userId},
          'Must pass through lifecycle transition',
          1,
          '2026-09-19T09:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'access_item_initial_state',
    });

    await expect(
      sql`
        insert into public.access_items (
          id, code, kind, property_id, unit_id, label,
          status, version, recorded_at, recorded_by_user_id
        ) values (
          'aef40000-0000-4000-8000-000000000002',
          'KEY-ACCESS-ILLEGAL-VERSION',
          'key',
          ${property.id},
          ${unitA.id},
          'Illegal initial version',
          'active',
          2,
          '2026-09-19T09:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'access_item_initial_state',
    });

    await sql`
      insert into public.access_items (
        id, code, kind, property_id, unit_id, label,
        status, version, recorded_at, recorded_by_user_id
      ) values (
        'aef40000-0000-4000-8000-000000000003',
        'KEY-ACCESS-VALID-INITIAL',
        'key',
        ${property.id},
        ${unitA.id},
        'Valid direct initial state',
        'active',
        1,
        '2026-09-19T09:00:00.000Z',
        ${actor.userId}
      )
    `;

    expect(
      await accessItemRepository.getItemById(
        'aef40000-0000-4000-8000-000000000003' as import('@portfolio/domain').AccessItemId,
      ),
    ).toMatchObject({
      status: 'active',
      version: 1,
      retiredAt: null,
      retirementReason: null,
    });

    const tenancyStartBoundaryKey = await createAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-18T12:00:00.000Z' },
      },
      actor,
      {
        code: 'KEY-ACCESS-START-BOUNDARY',
        kind: 'key',
        propertyId: property.id,
        unitId: unitA.id,
        label: 'Tenancy start UTC boundary key',
      },
    );

    await expect(
      issueAccessItemCommand(
        {
          ...accessDeps,
          clock: { now: () => '2026-09-19T00:05:00.000Z' },
        },
        actor,
        tenancyStartBoundaryKey.id,
        {
          tenancyId: activeA.id,
          occurredAt: '2026-09-18T23:59:59.000Z',
        },
      ),
    ).rejects.toMatchObject({
      code: 'ACCESS_ITEM_ISSUE_BEFORE_TENANCY_START',
    });

    await expect(
      sql`
        insert into public.access_item_transactions (
          id, access_item_id, tenancy_id, type, sequence,
          occurred_at, recorded_at, recorded_by_user_id
        ) values (
          'aef20000-0000-4000-8000-000000000001',
          ${tenancyStartBoundaryKey.id},
          ${activeA.id},
          'issued',
          1,
          '2026-09-18T23:59:59.000Z',
          '2026-09-19T00:05:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'access_item_transaction_before_tenancy_start',
    });

    await sql`
      insert into public.access_item_transactions (
        id, access_item_id, tenancy_id, type, sequence,
        occurred_at, recorded_at, recorded_by_user_id
      ) values (
        'aef20000-0000-4000-8000-000000000002',
        ${tenancyStartBoundaryKey.id},
        ${activeA.id},
        'issued',
        1,
        '2026-09-19T00:00:00.000Z',
        '2026-09-19T00:00:00.000Z',
        ${actor.userId}
      )
    `;

    expect(
      await accessItemRepository.getLastTransaction(tenancyStartBoundaryKey.id),
    ).toMatchObject({
      type: 'issued',
      sequence: 1,
      occurredAt: '2026-09-19T00:00:00.000Z',
    });

    const unitKey = await createAccessItemCommand(
      accessDeps,
      actor,
      {
        code: 'KEY-ACCESS-A',
        kind: 'key',
        propertyId: property.id,
        unitId: unitA.id,
        label: 'Unit A entrance key',
      },
    );

    const issued = await issueAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T10:05:00.000Z' },
      },
      actor,
      unitKey.id,
      {
        tenancyId: activeA.id,
        occurredAt: '2026-09-19T10:05:00.000Z',
      },
    );
    expect(issued).toMatchObject({
      type: 'issued',
      sequence: 1,
      tenancyId: activeA.id,
    });

    await expect(
      sql`
        update public.tenancies
        set actual_start = '2026-09-20',
            version = version + 1,
            updated_at = now()
        where id = ${activeA.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancy_actual_start_immutable',
    });

    await expect(
      sql`
        update public.tenancies
        set unit_id = ${unitB.id},
            version = version + 1,
            updated_at = now()
        where id = ${activeA.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancy_unit_immutable',
    });

    expect(await tenancyRepository.getById(activeA.id)).toMatchObject({
      unitId: unitA.id,
      actualStart: '2026-09-19',
    });

    const lost = await reportAccessItemLostCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T10:10:00.000Z' },
      },
      actor,
      unitKey.id,
      {
        occurredAt: '2026-09-19T10:09:00.000Z',
        note: 'Reported lost',
      },
    );
    expect(lost).toMatchObject({ type: 'lost', sequence: 2 });

    await expect(
      issueAccessItemCommand(
        {
          ...accessDeps,
          clock: { now: () => '2026-09-19T10:11:00.000Z' },
        },
        actor,
        unitKey.id,
        {
          tenancyId: activeA.id,
          occurredAt: '2026-09-19T10:11:00.000Z',
        },
      ),
    ).rejects.toMatchObject({ code: 'ACCESS_ITEM_NOT_AVAILABLE' });

    const returned = await returnAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T10:12:00.000Z' },
      },
      actor,
      unitKey.id,
      {
        occurredAt: '2026-09-19T10:12:00.000Z',
        note: 'Recovered and returned',
      },
    );
    expect(returned).toMatchObject({ type: 'returned', sequence: 3 });

    const reissued = await issueAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T10:13:00.000Z' },
      },
      actor,
      unitKey.id,
      {
        tenancyId: activeA.id,
        occurredAt: '2026-09-19T10:13:00.000Z',
      },
    );
    expect(reissued).toMatchObject({ type: 'issued', sequence: 4 });

    const propertyCard = await createAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T10:20:00.000Z' },
      },
      actor,
      {
        code: 'CARD-ACCESS-PROP',
        kind: 'card',
        propertyId: property.id,
        label: 'Building entrance card',
      },
    );

    await expect(
      sql`
        insert into public.access_item_transactions (
          id, access_item_id, tenancy_id, type, sequence,
          occurred_at, recorded_at, recorded_by_user_id
        ) values (
          'aef00000-0000-4000-8000-000000000001',
          ${propertyCard.id},
          ${tenancyB.id},
          'issued',
          1,
          '2026-09-19T10:21:00.000Z',
          '2026-09-19T10:21:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'access_item_transaction_tenancy_not_eligible',
    });

    const plannedB = await planTenancyCommand(
      { tenancyRepository },
      actor,
      tenancyB.id,
      tenancyB.version,
      '2026-09-19',
    );
    const activeB = await activateTenancyCommand(
      { tenancyRepository },
      actor,
      plannedB.id,
      plannedB.version,
      '2026-09-19',
    );

    const propertyIssued = await issueAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T10:22:00.000Z' },
      },
      actor,
      propertyCard.id,
      {
        tenancyId: activeB.id,
        occurredAt: '2026-09-19T10:22:00.000Z',
      },
    );
    expect(propertyIssued).toMatchObject({
      tenancyId: activeB.id,
      type: 'issued',
    });

    const wrongUnitRemote = await createAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T10:30:00.000Z' },
      },
      actor,
      {
        code: 'REMOTE-ACCESS-A',
        kind: 'remote',
        propertyId: property.id,
        unitId: unitA.id,
        label: 'Unit A garage remote',
      },
    );

    await expect(
      sql`
        insert into public.access_item_transactions (
          id, access_item_id, tenancy_id, type, sequence,
          occurred_at, recorded_at, recorded_by_user_id
        ) values (
          'aef00000-0000-4000-8000-000000000002',
          ${wrongUnitRemote.id},
          ${activeB.id},
          'issued',
          1,
          '2026-09-19T10:31:00.000Z',
          '2026-09-19T10:31:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'access_item_transaction_unit_mismatch',
    });

    const temporalKey = await createAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T11:00:00.000Z' },
      },
      actor,
      {
        code: 'KEY-ACCESS-TIME',
        kind: 'key',
        propertyId: property.id,
        unitId: unitA.id,
        label: 'Temporal guard key',
      },
    );

    await expect(
      sql`
        insert into public.access_item_transactions (
          id, access_item_id, tenancy_id, type, sequence,
          occurred_at, recorded_at, recorded_by_user_id
        ) values (
          'aef00000-0000-4000-8000-000000000003',
          ${temporalKey.id},
          ${activeA.id},
          'issued',
          1,
          '2026-09-19T10:59:59.000Z',
          '2026-09-19T11:01:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'access_item_transaction_before_item_recorded',
    });

    const emptyKey = await createAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T11:10:00.000Z' },
      },
      actor,
      {
        code: 'KEY-ACCESS-EMPTY',
        kind: 'key',
        propertyId: property.id,
        unitId: unitA.id,
        label: 'Never issued key',
      },
    );

    await expect(
      sql`
        insert into public.access_item_transactions (
          id, access_item_id, tenancy_id, type, sequence,
          occurred_at, recorded_at, recorded_by_user_id
        ) values (
          'aef00000-0000-4000-8000-000000000004',
          ${emptyKey.id},
          ${activeA.id},
          'returned',
          1,
          '2026-09-19T11:11:00.000Z',
          '2026-09-19T11:11:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'access_item_transaction_return_invalid_state',
    });

    const holderCard = await createAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T11:20:00.000Z' },
      },
      actor,
      {
        code: 'CARD-ACCESS-HOLDER',
        kind: 'card',
        propertyId: property.id,
        label: 'Property-wide holder check card',
      },
    );
    await issueAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T11:21:00.000Z' },
      },
      actor,
      holderCard.id,
      {
        tenancyId: activeA.id,
        occurredAt: '2026-09-19T11:21:00.000Z',
      },
    );

    await expect(
      sql`
        insert into public.access_item_transactions (
          id, access_item_id, tenancy_id, type, sequence,
          occurred_at, recorded_at, recorded_by_user_id
        ) values (
          'aef00000-0000-4000-8000-000000000005',
          ${holderCard.id},
          ${activeB.id},
          'returned',
          2,
          '2026-09-19T11:22:00.000Z',
          '2026-09-19T11:22:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'access_item_transaction_tenancy_mismatch',
    });

    await expect(
      sql`
        update public.access_item_transactions
        set note = 'rewrite custody history'
        where id = ${issued.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'access_item_transaction_immutable',
    });

    const correctedUnitKey = await updateAccessItemLabelCommand(
      { accessItemRepository },
      actor,
      unitKey.id,
      unitKey.version,
      'Unit A entrance key — corrected label',
    );
    expect(correctedUnitKey).toMatchObject({
      label: 'Unit A entrance key — corrected label',
      version: 2,
    });

    await expect(
      sql`
        update public.access_items
        set unit_id = ${unitB.id},
            version = version + 1
        where id = ${unitKey.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'access_item_immutable',
    });

    const retirementCard = await createAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T11:30:00.000Z' },
      },
      actor,
      {
        code: 'CARD-ACCESS-RETIRE',
        kind: 'card',
        propertyId: property.id,
        label: 'Credential to retire while issued',
      },
    );

    const retirementIssued = await issueAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T11:31:00.000Z' },
      },
      actor,
      retirementCard.id,
      {
        tenancyId: activeA.id,
        occurredAt: '2026-09-19T11:31:00.000Z',
      },
    );
    expect(retirementIssued.sequence).toBe(1);

    await expect(
      sql`
        update public.access_items
        set status = 'retired',
            retired_at = '2026-09-19T11:30:30.000Z',
            retired_by_user_id = ${actor.userId},
            retirement_reason = 'Backdated invalid retirement',
            version = version + 1
        where id = ${retirementCard.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'access_item_retirement_before_custody',
    });

    const retiredWhileIssued = await retireAccessItemCommand(
      {
        accessItemRepository,
        clock: { now: () => '2026-09-19T11:32:00.000Z' },
      },
      actor,
      retirementCard.id,
      retirementCard.version,
      'Credential permanently disabled',
    );
    expect(retiredWhileIssued).toMatchObject({
      status: 'retired',
      version: 2,
      retirementReason: 'Credential permanently disabled',
    });

    await expect(
      issueAccessItemCommand(
        {
          ...accessDeps,
          clock: { now: () => '2026-09-19T11:33:00.000Z' },
        },
        actor,
        retirementCard.id,
        {
          tenancyId: activeA.id,
          occurredAt: '2026-09-19T11:33:00.000Z',
        },
      ),
    ).rejects.toMatchObject({ code: 'ACCESS_ITEM_RETIRED' });

    const retirementReturned = await returnAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T11:34:00.000Z' },
      },
      actor,
      retirementCard.id,
      {
        occurredAt: '2026-09-19T11:34:00.000Z',
        note: 'Returned after credential was disabled',
      },
    );
    expect(retirementReturned).toMatchObject({
      type: 'returned',
      sequence: 2,
      tenancyId: activeA.id,
    });

    await expect(
      sql`
        insert into public.access_item_transactions (
          id, access_item_id, tenancy_id, type, sequence,
          occurred_at, recorded_at, recorded_by_user_id
        ) values (
          'aef20000-0000-4000-8000-000000000003',
          ${retirementCard.id},
          ${activeA.id},
          'issued',
          3,
          '2026-09-19T11:35:00.000Z',
          '2026-09-19T11:35:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'access_item_transaction_item_not_active',
    });

    const correctedRetiredCard = await updateAccessItemLabelCommand(
      { accessItemRepository },
      actor,
      retirementCard.id,
      retiredWhileIssued.version,
      'Disabled building credential',
    );
    expect(correctedRetiredCard).toMatchObject({
      status: 'retired',
      label: 'Disabled building credential',
      version: 3,
    });

    const raceKey = await createAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T12:00:00.000Z' },
      },
      actor,
      {
        code: 'KEY-ACCESS-RACE',
        kind: 'key',
        propertyId: property.id,
        unitId: unitA.id,
        label: 'Concurrent issue key',
      },
    );

    const blocker = postgres(connectionString, { max: 1 });
    const contender = postgres(connectionString, { max: 1 });
    let releaseIssue!: () => void;
    const holdIssue = new Promise<void>((resolve) => {
      releaseIssue = resolve;
    });
    let issueInsertedResolve!: () => void;
    const issueInserted = new Promise<void>((resolve) => {
      issueInsertedResolve = resolve;
    });

    try {
      const firstIssue = blocker.begin(async (tx) => {
        await tx`
          insert into public.access_item_transactions (
            id, access_item_id, tenancy_id, type, sequence,
            occurred_at, recorded_at, recorded_by_user_id
          ) values (
            'aef10000-0000-4000-8000-000000000001',
            ${raceKey.id},
            ${activeA.id},
            'issued',
            1,
            '2026-09-19T12:01:00.000Z',
            '2026-09-19T12:01:00.000Z',
            ${actor.userId}
          )
        `;
        issueInsertedResolve();
        await holdIssue;
      });

      await issueInserted;

      await expect(
        contender.begin(async (tx) => {
          await tx.unsafe("set local lock_timeout = '250ms'");
          await tx`
            insert into public.access_item_transactions (
              id, access_item_id, tenancy_id, type, sequence,
              occurred_at, recorded_at, recorded_by_user_id
            ) values (
              'aef10000-0000-4000-8000-000000000002',
              ${raceKey.id},
              ${activeA.id},
              'issued',
              1,
              '2026-09-19T12:01:00.000Z',
              '2026-09-19T12:01:00.000Z',
              ${actor.userId}
            )
          `;
        }),
      ).rejects.toMatchObject({ code: '55P03' });

      releaseIssue();
      await firstIssue;

      await expect(
        contender`
          insert into public.access_item_transactions (
            id, access_item_id, tenancy_id, type, sequence,
            occurred_at, recorded_at, recorded_by_user_id
          ) values (
            'aef10000-0000-4000-8000-000000000002',
            ${raceKey.id},
            ${activeA.id},
            'issued',
            1,
            '2026-09-19T12:01:00.000Z',
            '2026-09-19T12:01:00.000Z',
            ${actor.userId}
          )
        `,
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'access_item_transaction_sequence_invalid',
      });
    } finally {
      releaseIssue();
      await Promise.all([blocker.end(), contender.end()]);
    }

    expect(await accessItemRepository.listTransactions(raceKey.id)).toHaveLength(1);

    const retireRaceKey = await createAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T12:10:00.000Z' },
      },
      actor,
      {
        code: 'KEY-ACCESS-RETIRE-RACE',
        kind: 'key',
        propertyId: property.id,
        unitId: unitA.id,
        label: 'Retirement serialization key',
      },
    );

    const retireBlocker = postgres(connectionString, { max: 1 });
    const retireContender = postgres(connectionString, { max: 1 });
    let releaseRetirement!: () => void;
    const holdRetirement = new Promise<void>((resolve) => {
      releaseRetirement = resolve;
    });
    let retirementUpdatedResolve!: () => void;
    const retirementUpdated = new Promise<void>((resolve) => {
      retirementUpdatedResolve = resolve;
    });

    try {
      const retirementWrite = retireBlocker.begin(async (tx) => {
        await tx`
          update public.access_items
          set status = 'retired',
              retired_at = '2026-09-19T12:11:00.000Z',
              retired_by_user_id = ${actor.userId},
              retirement_reason = 'Concurrent retirement',
              version = version + 1
          where id = ${retireRaceKey.id}
        `;
        retirementUpdatedResolve();
        await holdRetirement;
      });

      await retirementUpdated;

      await expect(
        retireContender.begin(async (tx) => {
          await tx.unsafe("set local lock_timeout = '250ms'");
          await tx`
            insert into public.access_item_transactions (
              id, access_item_id, tenancy_id, type, sequence,
              occurred_at, recorded_at, recorded_by_user_id
            ) values (
              'aef30000-0000-4000-8000-000000000001',
              ${retireRaceKey.id},
              ${activeA.id},
              'issued',
              1,
              '2026-09-19T12:12:00.000Z',
              '2026-09-19T12:12:00.000Z',
              ${actor.userId}
            )
          `;
        }),
      ).rejects.toMatchObject({ code: '55P03' });

      releaseRetirement();
      await retirementWrite;

      await expect(
        retireContender`
          insert into public.access_item_transactions (
            id, access_item_id, tenancy_id, type, sequence,
            occurred_at, recorded_at, recorded_by_user_id
          ) values (
            'aef30000-0000-4000-8000-000000000001',
            ${retireRaceKey.id},
            ${activeA.id},
            'issued',
            1,
            '2026-09-19T12:12:00.000Z',
            '2026-09-19T12:12:00.000Z',
            ${actor.userId}
          )
        `,
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'access_item_transaction_item_not_active',
      });
    } finally {
      releaseRetirement();
      await Promise.all([retireBlocker.end(), retireContender.end()]);
    }

    const retireRaceLoaded = await accessItemRepository.getItemById(retireRaceKey.id);
    expect(retireRaceLoaded).toMatchObject({
      status: 'retired',
      version: 2,
      retirementReason: 'Concurrent retirement',
    });
    expect(
      await accessItemRepository.listTransactions(retireRaceKey.id),
    ).toHaveLength(0);

    const endedA = await endTenancyCommand(
      { tenancyRepository },
      actor,
      activeA.id,
      activeA.version,
      '2026-09-19',
    );
    expect(endedA.status).toBe('ended');

    const returnedAfterTenancyEnd = await returnAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-19T13:00:00.000Z' },
      },
      actor,
      holderCard.id,
      {
        occurredAt: '2026-09-19T13:00:00.000Z',
        note: 'Returned during final post-tenancy reconciliation',
      },
    );
    expect(returnedAfterTenancyEnd).toMatchObject({
      type: 'returned',
      tenancyId: activeA.id,
    });

    await expect(
      issueAccessItemCommand(
        {
          ...accessDeps,
          clock: { now: () => '2026-09-19T13:05:00.000Z' },
        },
        actor,
        emptyKey.id,
        {
          tenancyId: endedA.id,
          occurredAt: '2026-09-19T13:05:00.000Z',
        },
      ),
    ).rejects.toMatchObject({
      code: 'ACCESS_ITEM_TENANCY_NOT_ELIGIBLE',
    });
  });


  it('persists Meter measurement truth and rejects lifecycle, boundary and concurrency bypasses', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      'c9000000-0000-4000-8000-000000000001',
      'c9000000-0000-4000-8000-000000000002',
      'c9000000-0000-4000-8000-000000000003',
      'c9000000-0000-4000-8000-000000000004',
      'c9000000-0000-4000-8000-000000000005',
      'c9000000-0000-4000-8000-000000000006',
      'c9000000-0000-4000-8000-000000000007',
      'c9000000-0000-4000-8000-000000000008',
      'c9000000-0000-4000-8000-000000000009',
      'c9000000-0000-4000-8000-000000000010',
      'c9000000-0000-4000-8000-000000000011',
      'c9000000-0000-4000-8000-000000000012',
      'c9000000-0000-4000-8000-000000000013',
      'c9000000-0000-4000-8000-000000000014',
      'c9000000-0000-4000-8000-000000000015',
      'c9000000-0000-4000-8000-000000000016',
      'c9000000-0000-4000-8000-000000000017',
      'c9000000-0000-4000-8000-000000000018',
      'c9000000-0000-4000-8000-000000000019',
      'c9000000-0000-4000-8000-000000000020',
      'c9000000-0000-4000-8000-000000000021',
      'c9000000-0000-4000-8000-000000000022',
      'c9000000-0000-4000-8000-000000000023',
      'c9000000-0000-4000-8000-000000000024',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-METER-INT',
        name: 'Meter Integration Property',
        propertyType: 'apartment_building',
        street: 'Meter Street',
        houseNumber: '21',
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
        code: 'UNIT-METER-A',
        unitNumber: 'M-A',
        unitType: 'apartment',
      },
    );

    const unitB = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-METER-B',
        unitNumber: 'M-B',
        unitType: 'apartment',
      },
    );

    const party = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-METER',
        partyType: 'person',
        firstName: 'Meter',
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
        code: 'TEN-METER-A',
        parties: [
          { partyId: party.id, role: 'tenant', isPrimary: true },
        ],
      },
    );
    const planned = await planTenancyCommand(
      { tenancyRepository },
      actor,
      tenancy.id,
      tenancy.version,
      '2026-09-20',
    );
    const active = await activateTenancyCommand(
      { tenancyRepository },
      actor,
      planned.id,
      planned.version,
      '2026-09-20',
    );
    const ended = await endTenancyCommand(
      { tenancyRepository },
      actor,
      active.id,
      active.version,
      '2026-09-20',
    );

    await expect(
      sql`
        insert into public.meters (
          id, code, serial_number, utility_type, measurement_unit,
          unit_id, label, installed_at, status,
          retired_at, retirement_recorded_at, retired_by_user_id,
          retirement_reason, version, recorded_at, recorded_by_user_id
        ) values (
          'cf000000-0000-4000-8000-000000000001',
          'MTR-ILLEGAL-RETIRED',
          'SER-ILLEGAL-RETIRED',
          'electricity',
          'kwh',
          ${unitA.id},
          'Illegal retired Meter',
          '2026-01-01T00:00:00.000Z',
          'retired',
          '2026-09-20T10:00:00.000Z',
          '2026-09-20T11:00:00.000Z',
          ${actor.userId},
          'Must transition from active',
          1,
          '2026-09-20T09:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'meter_initial_state',
    });

    await expect(
      sql`
        insert into public.meters (
          id, code, serial_number, utility_type, measurement_unit,
          unit_id, label, installed_at, status, version,
          recorded_at, recorded_by_user_id
        ) values (
          'cf000000-0000-4000-8000-000000000002',
          'MTR-ILLEGAL-VERSION',
          'SER-ILLEGAL-VERSION',
          'electricity',
          'kwh',
          ${unitA.id},
          'Illegal version Meter',
          '2026-01-01T00:00:00.000Z',
          'active',
          2,
          '2026-09-20T09:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'meter_initial_state',
    });

    const meterDeps = {
      meterRepository,
      portfolioRepository,
      tenancyRepository,
      idGenerator: ids,
      clock: { now: () => '2026-09-20T13:00:00.000Z' },
    };

    const meter = await createMeterCommand(
      meterDeps,
      actor,
      {
        code: 'MTR-INT-A',
        serialNumber: 'SER-INT-A',
        utilityType: 'electricity',
        measurementUnit: 'kwh',
        unitId: unitA.id,
        label: 'Unit A electricity',
        installedAt: '2026-01-01T00:00:00.000Z',
      },
    );

    await expect(
      sql`
        insert into public.meter_readings (
          id, meter_id, value, read_at, recorded_at,
          recorded_by_user_id
        ) values (
          'cf500000-0000-4000-8000-000000000001',
          ${meter.id},
          1,
          '2026-02-01T08:00:00.000Z',
          '2026-02-01T08:05:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'meter_reading_recorded_before_meter_registration',
    });

    await sql`
      insert into public.meters (
        id, code, serial_number, utility_type, measurement_unit,
        unit_id, label, installed_at, status, version,
        recorded_at, recorded_by_user_id
      ) values (
        'cf500000-0000-4000-8000-000000000002',
        'MTR-HIST-RETIRE',
        'SER-HIST-RETIRE',
        'water',
        'm3',
        ${unitA.id},
        'Historical retirement provenance meter',
        '2026-01-01T00:00:00.000Z',
        'active',
        1,
        '2026-09-20T13:00:00.000Z',
        ${actor.userId}
      )
    `;

    await expect(
      sql`
        update public.meters
        set status = 'retired',
            retired_at = '2026-02-01T08:00:00.000Z',
            retirement_recorded_at = '2026-03-01T08:00:00.000Z',
            retired_by_user_id = ${actor.userId},
            retirement_reason = 'Historical retirement',
            version = version + 1
        where id = 'cf500000-0000-4000-8000-000000000002'
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'meters_retirement_recorded_after_registration',
    });

    await sql`
      update public.meters
      set status = 'retired',
          retired_at = '2026-02-01T08:00:00.000Z',
          retirement_recorded_at = '2026-09-20T13:00:00.000Z',
          retired_by_user_id = ${actor.userId},
          retirement_reason = 'Historical retirement backfilled after registration',
          version = version + 1
      where id = 'cf500000-0000-4000-8000-000000000002'
    `;

    const corrected = await updateMeterLabelCommand(
      { meterRepository },
      actor,
      meter.id,
      meter.version,
      'Unit A main electricity register',
    );
    expect(corrected).toMatchObject({
      version: 2,
      label: 'Unit A main electricity register',
    });

    const preStartReading = await recordMeterReadingCommand(
      meterDeps,
      actor,
      meter.id,
      {
        value: '90',
        readAt: '2026-09-19T23:59:59.000Z',
      },
    );

    await expect(
      sql`
        insert into public.meter_reading_boundaries (
          id, reading_id, tenancy_id, boundary_type,
          recorded_at, recorded_by_user_id
        ) values (
          'cf100000-0000-4000-8000-000000000001',
          ${preStartReading.id},
          ${ended.id},
          'move_in',
          '2026-09-20T13:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'meter_boundary_move_in_date_mismatch',
    });

    const boundaryReading = await recordMeterReadingCommand(
      meterDeps,
      actor,
      meter.id,
      {
        value: '100.25',
        readAt: '2026-09-20T10:00:00.000Z',
        note: 'Tenancy boundary observation',
      },
    );

    const moveIn = await linkMeterReadingBoundaryCommand(
      meterDeps,
      actor,
      boundaryReading.id,
      {
        tenancyId: ended.id,
        type: 'move_in',
      },
    );
    const moveOut = await linkMeterReadingBoundaryCommand(
      meterDeps,
      actor,
      boundaryReading.id,
      {
        tenancyId: ended.id,
        type: 'move_out',
      },
    );
    expect(moveIn.readingId).toBe(boundaryReading.id);
    expect(moveOut.readingId).toBe(boundaryReading.id);

    const secondReading = await recordMeterReadingCommand(
      meterDeps,
      actor,
      meter.id,
      {
        value: '110.375',
        readAt: '2026-09-20T11:00:00.000Z',
      },
    );

    await expect(
      sql`
        insert into public.meter_reading_boundaries (
          id, reading_id, tenancy_id, boundary_type,
          recorded_at, recorded_by_user_id
        ) values (
          'cf100000-0000-4000-8000-000000000002',
          ${secondReading.id},
          ${ended.id},
          'move_in',
          '2026-09-20T13:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'meter_boundary_already_exists',
    });

    await expect(
      sql`
        insert into public.meter_readings (
          id, meter_id, value, read_at, recorded_at,
          recorded_by_user_id
        ) values (
          'cf200000-0000-4000-8000-000000000001',
          ${meter.id},
          1.1234567,
          '2026-09-20T11:30:00.000Z',
          '2026-09-20T13:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'meter_readings_value_scale_valid',
    });

    await expect(
      sql`
        update public.meter_readings
        set note = 'rewrite historical observation'
        where id = ${boundaryReading.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'meter_reading_immutable',
    });

    await expect(
      sql`
        update public.tenancies
        set actual_end = '2026-09-21',
            version = version + 1,
            updated_at = now()
        where id = ${ended.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'tenancy_actual_end_immutable',
    });

    await expect(
      sql`
        update public.meters
        set status = 'retired',
            retired_at = '2026-09-20T10:30:00.000Z',
            retirement_recorded_at = '2026-09-20T13:00:00.000Z',
            retired_by_user_id = ${actor.userId},
            retirement_reason = 'Backdated retirement',
            version = version + 1
        where id = ${meter.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'meter_retirement_before_reading',
    });

    const retired = await retireMeterCommand(
      {
        meterRepository,
        clock: { now: () => '2026-09-20T13:00:00.000Z' },
      },
      actor,
      meter.id,
      {
        expectedVersion: corrected.version,
        retiredAt: '2026-09-20T12:00:00.000Z',
        retirementReason: 'Meter replaced',
      },
    );
    expect(retired).toMatchObject({
      status: 'retired',
      version: 3,
      retirementRecordedAt: '2026-09-20T13:00:00.000Z',
    });

    const backfill = await recordMeterReadingCommand(
      meterDeps,
      actor,
      meter.id,
      {
        value: '111',
        readAt: '2026-09-20T11:30:00.000Z',
        note: 'Late historical backfill',
      },
    );
    expect(backfill.value).toBe('111.000000');

    await expect(
      recordMeterReadingCommand(
        meterDeps,
        actor,
        meter.id,
        {
          value: '112',
          readAt: '2026-09-20T12:00:01.000Z',
        },
      ),
    ).rejects.toMatchObject({
      code: 'METER_READING_AFTER_RETIREMENT',
    });

    await expect(
      sql`
        update public.meters
        set unit_id = ${unitB.id},
            version = version + 1
        where id = ${meter.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'meter_identity_immutable',
    });

    const tenancyB = await createTenancyCommand(
      {
        tenancyRepository,
        portfolioRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: unitB.id,
        code: 'TEN-METER-B',
        parties: [{ partyId: party.id, role: 'tenant', isPrimary: true }],
      },
    );
    const plannedB = await planTenancyCommand(
      { tenancyRepository },
      actor,
      tenancyB.id,
      tenancyB.version,
      '2026-09-20',
    );
    const activeB = await activateTenancyCommand(
      { tenancyRepository },
      actor,
      plannedB.id,
      plannedB.version,
      '2026-09-20',
    );

    await expect(
      sql`
        insert into public.meter_reading_boundaries (
          id, reading_id, tenancy_id, boundary_type,
          recorded_at, recorded_by_user_id
        ) values (
          'cf100000-0000-4000-8000-000000000003',
          ${boundaryReading.id},
          ${activeB.id},
          'move_in',
          '2026-09-20T13:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'meter_boundary_tenancy_unit_mismatch',
    });

    const retireRaceMeter = await createMeterCommand(
      meterDeps,
      actor,
      {
        code: 'MTR-RETIRE-RACE',
        serialNumber: 'SER-RETIRE-RACE',
        utilityType: 'water',
        measurementUnit: 'm3',
        unitId: unitA.id,
        label: 'Retire race meter',
        installedAt: '2026-01-01T00:00:00.000Z',
      },
    );

    const retireBlocker = postgres(connectionString, { max: 1 });
    const readingContender = postgres(connectionString, { max: 1 });
    let releaseRetirement!: () => void;
    const holdRetirement = new Promise<void>((resolve) => {
      releaseRetirement = resolve;
    });
    let retirementUpdatedResolve!: () => void;
    const retirementUpdated = new Promise<void>((resolve) => {
      retirementUpdatedResolve = resolve;
    });

    try {
      const retirementWrite = retireBlocker.begin(async (tx) => {
        await tx`
          update public.meters
          set status = 'retired',
              retired_at = '2026-09-20T14:00:00.000Z',
              retirement_recorded_at = '2026-09-20T14:05:00.000Z',
              retired_by_user_id = ${actor.userId},
              retirement_reason = 'Concurrent retirement',
              version = version + 1
          where id = ${retireRaceMeter.id}
        `;
        retirementUpdatedResolve();
        await holdRetirement;
      });

      await retirementUpdated;

      await expect(
        readingContender.begin(async (tx) => {
          await tx.unsafe("set local lock_timeout = '250ms'");
          await tx`
            insert into public.meter_readings (
              id, meter_id, value, read_at, recorded_at, recorded_by_user_id
            ) values (
              'cf300000-0000-4000-8000-000000000001',
              ${retireRaceMeter.id},
              1,
              '2026-09-20T14:00:01.000Z',
              '2026-09-20T14:06:00.000Z',
              ${actor.userId}
            )
          `;
        }),
      ).rejects.toMatchObject({ code: '55P03' });

      releaseRetirement();
      await retirementWrite;

      await expect(
        readingContender`
          insert into public.meter_readings (
            id, meter_id, value, read_at, recorded_at, recorded_by_user_id
          ) values (
            'cf300000-0000-4000-8000-000000000001',
            ${retireRaceMeter.id},
            1,
            '2026-09-20T14:00:01.000Z',
            '2026-09-20T14:06:00.000Z',
            ${actor.userId}
          )
        `,
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'meter_reading_after_retirement',
      });
    } finally {
      releaseRetirement();
      await Promise.all([retireBlocker.end(), readingContender.end()]);
    }

    const boundaryRaceMeter = await createMeterCommand(
      meterDeps,
      actor,
      {
        code: 'MTR-BOUNDARY-RACE',
        serialNumber: 'SER-BOUNDARY-RACE',
        utilityType: 'gas',
        measurementUnit: 'm3',
        unitId: unitA.id,
        label: 'Boundary race meter',
        installedAt: '2026-01-01T00:00:00.000Z',
      },
    );
    const boundaryRaceReadingA = await recordMeterReadingCommand(
      meterDeps,
      actor,
      boundaryRaceMeter.id,
      {
        value: '10',
        readAt: '2026-09-20T08:00:00.000Z',
      },
    );
    const boundaryRaceReadingB = await recordMeterReadingCommand(
      meterDeps,
      actor,
      boundaryRaceMeter.id,
      {
        value: '11',
        readAt: '2026-09-20T09:00:00.000Z',
      },
    );

    const boundaryBlocker = postgres(connectionString, { max: 1 });
    const boundaryContender = postgres(connectionString, { max: 1 });
    let releaseBoundary!: () => void;
    const holdBoundary = new Promise<void>((resolve) => {
      releaseBoundary = resolve;
    });
    let boundaryInsertedResolve!: () => void;
    const boundaryInserted = new Promise<void>((resolve) => {
      boundaryInsertedResolve = resolve;
    });

    try {
      const firstBoundary = boundaryBlocker.begin(async (tx) => {
        await tx`
          insert into public.meter_reading_boundaries (
            id, reading_id, tenancy_id, boundary_type,
            recorded_at, recorded_by_user_id
          ) values (
            'cf400000-0000-4000-8000-000000000001',
            ${boundaryRaceReadingA.id},
            ${ended.id},
            'move_in',
            '2026-09-20T13:00:00.000Z',
            ${actor.userId}
          )
        `;
        boundaryInsertedResolve();
        await holdBoundary;
      });

      await boundaryInserted;

      await expect(
        boundaryContender.begin(async (tx) => {
          await tx.unsafe("set local lock_timeout = '250ms'");
          await tx`
            insert into public.meter_reading_boundaries (
              id, reading_id, tenancy_id, boundary_type,
              recorded_at, recorded_by_user_id
            ) values (
              'cf400000-0000-4000-8000-000000000002',
              ${boundaryRaceReadingB.id},
              ${ended.id},
              'move_in',
              '2026-09-20T13:00:00.000Z',
              ${actor.userId}
            )
          `;
        }),
      ).rejects.toMatchObject({ code: '55P03' });

      releaseBoundary();
      await firstBoundary;

      await expect(
        boundaryContender`
          insert into public.meter_reading_boundaries (
            id, reading_id, tenancy_id, boundary_type,
            recorded_at, recorded_by_user_id
          ) values (
            'cf400000-0000-4000-8000-000000000002',
            ${boundaryRaceReadingB.id},
            ${ended.id},
            'move_in',
            '2026-09-20T13:00:00.000Z',
            ${actor.userId}
          )
        `,
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'meter_boundary_already_exists',
      });
    } finally {
      releaseBoundary();
      await Promise.all([boundaryBlocker.end(), boundaryContender.end()]);
    }
  });


  it('projects stable cross-context Unit business events without becoming a second write model', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const ids = new SequenceIds([
      'd8000000-0000-4000-8000-000000000001',
      'd8000000-0000-4000-8000-000000000002',
      'd8000000-0000-4000-8000-000000000003',
      'd8000000-0000-4000-8000-000000000004',
      'd8000000-0000-4000-8000-000000000005',
      'd8000000-0000-4000-8000-000000000006',
      'd8000000-0000-4000-8000-000000000007',
      'd8000000-0000-4000-8000-000000000008',
      'd8000000-0000-4000-8000-000000000009',
      'd8000000-0000-4000-8000-000000000010',
      'd8000000-0000-4000-8000-000000000011',
      'd8000000-0000-4000-8000-000000000012',
      'd8000000-0000-4000-8000-000000000013',
      'd8000000-0000-4000-8000-000000000014',
      'd8000000-0000-4000-8000-000000000015',
      'd8000000-0000-4000-8000-000000000016',
      'd8000000-0000-4000-8000-000000000017',
      'd8000000-0000-4000-8000-000000000018',
      'd8000000-0000-4000-8000-000000000019',
      'd8000000-0000-4000-8000-000000000020',
      'd8000000-0000-4000-8000-000000000021',
      'd8000000-0000-4000-8000-000000000022',
      'd8000000-0000-4000-8000-000000000023',
      'd8000000-0000-4000-8000-000000000024',
      'd8000000-0000-4000-8000-000000000025',
      'd8000000-0000-4000-8000-000000000026',
      'd8000000-0000-4000-8000-000000000027',
      'd8000000-0000-4000-8000-000000000028',
      'd8000000-0000-4000-8000-000000000029',
      'd8000000-0000-4000-8000-000000000030',
      'd8000000-0000-4000-8000-000000000031',
      'd8000000-0000-4000-8000-000000000032',
      'd8000000-0000-4000-8000-000000000033',
      'd8000000-0000-4000-8000-000000000034',
      'd8000000-0000-4000-8000-000000000035',
      'd8000000-0000-4000-8000-000000000036',
      'd8000000-0000-4000-8000-000000000037',
      'd8000000-0000-4000-8000-000000000038',
      'd8000000-0000-4000-8000-000000000039',
      'd8000000-0000-4000-8000-000000000040',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-TIMELINE-INT',
        name: 'Timeline Integration Property',
        propertyType: 'apartment_building',
        street: 'Timeline Street',
        houseNumber: '22',
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
        code: 'UNIT-TIMELINE-A',
        unitNumber: 'TL-A',
        unitType: 'apartment',
      },
    );

    const unitB = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: property.id,
        code: 'UNIT-TIMELINE-B',
        unitNumber: 'TL-B',
        unitType: 'apartment',
      },
    );

    const spaceA = await createSpaceCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        unitId: unitA.id,
        code: 'TIMELINE-SPACE',
        name: 'Timeline Space',
        spaceType: 'other',
      },
    );

    const tenant = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-TIMELINE',
        partyType: 'person',
        firstName: 'Timeline',
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
        code: 'TEN-TIMELINE-A',
        parties: [{ partyId: tenant.id, role: 'tenant', isPrimary: true }],
      },
    );
    const tenancyB = await createTenancyCommand(
      {
        tenancyRepository,
        portfolioRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: unitB.id,
        code: 'TEN-TIMELINE-B',
        parties: [{ partyId: tenant.id, role: 'tenant', isPrimary: true }],
      },
    );

    await sql`
      insert into public.lease_agreements (
        id, tenancy_id, code, agreement_type, effective_from,
        status, version, created_at, updated_at
      ) values
      (
        'd8f10000-0000-4000-8000-000000000001',
        ${tenancy.id},
        'AGR-TIMELINE-A',
        'initial',
        '2026-10-01',
        'draft',
        1,
        '2026-09-20T08:00:00.000Z',
        '2026-09-20T08:00:00.000Z'
      ),
      (
        'd8f10000-0000-4000-8000-000000000002',
        ${tenancyB.id},
        'AGR-TIMELINE-B',
        'initial',
        '2026-10-01',
        'draft',
        1,
        '2026-09-20T08:05:00.000Z',
        '2026-09-20T08:05:00.000Z'
      )
    `;

    await sql`
      insert into public.lease_amendments (
        id, agreement_id, code, title, effective_from,
        status, version, created_at, updated_at
      ) values (
        'd8f20000-0000-4000-8000-000000000001',
        'd8f10000-0000-4000-8000-000000000001',
        'AMD-TIMELINE-A',
        'Timeline amendment',
        '2026-11-01',
        'draft',
        1,
        '2026-09-20T08:10:00.000Z',
        '2026-09-20T08:10:00.000Z'
      )
    `;

    await sql`
      insert into public.documents (
        id, code, title, category, status,
        latest_version_number, revision, created_at, updated_at
      ) values (
        'd8f30000-0000-4000-8000-000000000001',
        'DOC-TIMELINE-A',
        'Timeline supporting document',
        'other',
        'active',
        0,
        1,
        '2026-09-20T08:15:00.000Z',
        '2026-09-20T08:15:00.000Z'
      )
    `;

    await sql`
      insert into public.document_links (
        id, document_id, relation, target_type, unit_id, created_at
      ) values (
        'd8f30000-0000-4000-8000-000000000002',
        'd8f30000-0000-4000-8000-000000000001',
        'supporting',
        'unit',
        ${unitA.id},
        '2026-09-20T08:16:00.000Z'
      )
    `;

    const planned = await planTenancyCommand(
      { tenancyRepository },
      actor,
      tenancy.id,
      tenancy.version,
      '2026-09-20',
    );
    const active = await activateTenancyCommand(
      { tenancyRepository },
      actor,
      planned.id,
      planned.version,
      '2026-09-20',
    );

    const accessDeps = {
      accessItemRepository,
      portfolioRepository,
      tenancyRepository,
      idGenerator: ids,
      clock: { now: () => '2026-09-20T09:00:00.000Z' },
    };
    const propertyKey = await createAccessItemCommand(
      accessDeps,
      actor,
      {
        code: 'KEY-TIMELINE-PROPERTY',
        kind: 'key',
        propertyId: property.id,
        label: 'Property-scope key attributed through Tenancy',
      },
    );
    const issued = await issueAccessItemCommand(
      {
        ...accessDeps,
        clock: { now: () => '2026-09-20T09:10:00.000Z' },
      },
      actor,
      propertyKey.id,
      {
        tenancyId: active.id,
        occurredAt: '2026-09-20T09:10:00.000Z',
      },
    );

    const meterDeps = {
      meterRepository,
      portfolioRepository,
      tenancyRepository,
      idGenerator: ids,
      clock: { now: () => '2026-09-20T09:20:00.000Z' },
    };
    const meter = await createMeterCommand(
      meterDeps,
      actor,
      {
        code: 'MTR-TIMELINE-A',
        serialNumber: 'SER-TIMELINE-A',
        utilityType: 'electricity',
        measurementUnit: 'kwh',
        unitId: unitA.id,
        label: 'Timeline electricity meter',
        installedAt: '2026-01-01T00:00:00.000Z',
      },
    );
    const reading = await recordMeterReadingCommand(
      {
        ...meterDeps,
        clock: { now: () => '2026-09-20T10:05:00.000Z' },
      },
      actor,
      meter.id,
      {
        value: '123.400000',
        readAt: '2026-09-20T10:00:00.000Z',
      },
    );
    const moveInBoundary = await linkMeterReadingBoundaryCommand(
      {
        ...meterDeps,
        clock: { now: () => '2026-09-20T10:10:00.000Z' },
      },
      actor,
      reading.id,
      { tenancyId: active.id, type: 'move_in' },
    );

    const ended = await endTenancyCommand(
      { tenancyRepository },
      actor,
      active.id,
      active.version,
      '2026-09-20',
    );
    const moveOutBoundary = await linkMeterReadingBoundaryCommand(
      {
        ...meterDeps,
        clock: { now: () => '2026-09-20T10:15:00.000Z' },
      },
      actor,
      reading.id,
      { tenancyId: ended.id, type: 'move_out' },
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
        code: 'ASSET-TIMELINE-A',
        name: 'Timeline movable asset',
        propertyId: property.id,
        unitId: unitA.id,
      },
    );

    const serviceEvent = await recordServiceEventCommand(
      {
        assetRepository,
        assetServiceRepository,
        partyRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T08:40:00.000Z' },
      },
      actor,
      asset.id,
      {
        eventType: 'repair',
        performedAt: '2026-09-19T08:30:00.000Z',
        description: 'Service while Asset still belonged to Unit A',
      },
    );

    await moveAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T09:00:00.000Z' },
      },
      actor,
      asset.id,
      {
        expectedVersion: asset.version,
        propertyId: property.id,
        unitId: unitB.id,
        reason: 'Moved after historical service',
      },
    );

    const costDeps = {
      costRepository,
      portfolioRepository,
      partyRepository,
      assetRepository,
      assetServiceRepository,
      improvementRepository,
      maintenanceRepository,
      idGenerator: ids,
      clock: { now: () => '2026-09-20T11:00:00.000Z' },
    };
    const unitCost = await createCostCommand(
      costDeps,
      actor,
      {
        source: { kind: 'unit', unitId: unitA.id },
        description: 'Timeline Unit cost',
        amount: '123.40',
        currency: 'CHF',
        incurredOn: '2026-09-20',
        reportingClass: 'opex',
      },
    );
    const spaceCost = await createCostCommand(
      {
        ...costDeps,
        clock: { now: () => '2026-09-20T11:02:00.000Z' },
      },
      actor,
      {
        source: { kind: 'space', spaceId: spaceA.id },
        description: 'Timeline Space cost',
        amount: '45.60',
        currency: 'CHF',
        incurredOn: '2026-09-20',
        reportingClass: 'opex',
      },
    );

    const propertyCost = await createCostCommand(
      {
        ...costDeps,
        clock: { now: () => '2026-09-20T11:05:00.000Z' },
      },
      actor,
      {
        source: { kind: 'property', propertyId: property.id },
        description: 'Property-wide cost must not be copied to every Unit',
        amount: '999.00',
        currency: 'CHF',
        incurredOn: '2026-09-20',
        reportingClass: 'opex',
      },
    );

    const beforeParentSabotage = await unitTimelineRepository.listByUnit(
      unitA.id,
      { limit: 500, offset: 0 },
    );
    expect(beforeParentSabotage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKey: `cost.incurred:${spaceCost.id}`,
          sourceId: spaceCost.id,
          unitId: unitA.id,
        }),
        expect.objectContaining({
          eventKey:
            'lease.created:d8f10000-0000-4000-8000-000000000001',
          unitId: unitA.id,
        }),
        expect.objectContaining({
          eventKey:
            'lease_amendment.created:d8f20000-0000-4000-8000-000000000001',
          unitId: unitA.id,
        }),
        expect.objectContaining({
          eventKey:
            'document.linked:d8f30000-0000-4000-8000-000000000002',
          unitId: unitA.id,
        }),
      ]),
    );

    await expect(
      sql`
        update public.spaces
        set unit_id = ${unitB.id}
        where id = ${spaceA.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'spaces_unit_immutable',
    });

    await expect(
      sql`
        update public.lease_agreements
        set tenancy_id = ${tenancyB.id}
        where id = 'd8f10000-0000-4000-8000-000000000001'
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'lease_agreements_tenancy_immutable',
    });

    await expect(
      sql`
        update public.lease_amendments
        set agreement_id = 'd8f10000-0000-4000-8000-000000000002'
        where id = 'd8f20000-0000-4000-8000-000000000001'
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'lease_amendments_agreement_immutable',
    });

    await expect(
      sql`
        update public.document_links
        set unit_id = ${unitB.id}
        where id = 'd8f30000-0000-4000-8000-000000000002'
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'document_links_immutable',
    });

    await expect(
      sql`
        delete from public.document_links
        where id = 'd8f30000-0000-4000-8000-000000000002'
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'document_links_immutable',
    });

    const allA = await unitTimelineRepository.listByUnit(unitA.id, {
      limit: 500,
      offset: 0,
    });
    const repeatedA = await unitTimelineRepository.listByUnit(unitA.id, {
      limit: 500,
      offset: 0,
    });

    expect(repeatedA.map((event) => event.eventKey)).toEqual(
      allA.map((event) => event.eventKey),
    );
    expect(new Set(allA.map((event) => event.eventKey)).size).toBe(
      allA.length,
    );

    expect(
      allA.every(
        (event) => event.eventKey === `${event.eventType}:${event.sourceId}`,
      ),
    ).toBe(true);

    const tenancyCreated = allA.find(
      (event) =>
        event.eventType === 'tenancy.created' && event.sourceId === ended.id,
    );
    expect(tenancyCreated?.details).toEqual({ code: 'TEN-TIMELINE-A' });

    expect(allA).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKey: `cost.incurred:${spaceCost.id}`,
          unitId: unitA.id,
          relatedEntityType: 'space',
          relatedEntityId: spaceA.id,
        }),
        expect.objectContaining({
          eventKey:
            'lease.created:d8f10000-0000-4000-8000-000000000001',
          unitId: unitA.id,
        }),
        expect.objectContaining({
          eventKey:
            'lease_amendment.created:d8f20000-0000-4000-8000-000000000001',
          unitId: unitA.id,
        }),
        expect.objectContaining({
          eventKey:
            'document.linked:d8f30000-0000-4000-8000-000000000002',
          unitId: unitA.id,
        }),
      ]),
    );

    expect(allA).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'tenancy.started',
          precision: 'date',
          occurredOn: '2026-09-20',
          occurredAt: null,
          sourceId: ended.id,
        }),
        expect.objectContaining({
          eventKey: `access.issued:${issued.id}`,
          eventType: 'access.issued',
          unitId: unitA.id,
          relatedEntityId: propertyKey.id,
        }),
        expect.objectContaining({
          eventKey: `meter.reading:${reading.id}`,
          eventType: 'meter.reading',
          details: expect.objectContaining({
            value: '123.400000',
            measurementUnit: 'kwh',
          }),
        }),
        expect.objectContaining({
          eventKey: `meter.boundary_move_in:${moveInBoundary.id}`,
          eventType: 'meter.boundary_move_in',
          relatedEntityId: ended.id,
        }),
        expect.objectContaining({
          eventKey: `meter.boundary_move_out:${moveOutBoundary.id}`,
          eventType: 'meter.boundary_move_out',
          relatedEntityId: ended.id,
        }),
        expect.objectContaining({
          eventKey: `service.performed:${serviceEvent.id}`,
          eventType: 'service.performed',
          unitId: unitA.id,
          relatedEntityId: asset.id,
        }),
        expect.objectContaining({
          eventKey: `cost.incurred:${unitCost.id}`,
          eventType: 'cost.incurred',
          precision: 'date',
          details: expect.objectContaining({
            amount: '123.40',
            currency: 'CHF',
          }),
        }),
      ]),
    );

    expect(
      allA.some((event) => event.sourceId === propertyCost.id),
    ).toBe(false);

    const allB = await unitTimelineRepository.listByUnit(unitB.id, {
      limit: 500,
      offset: 0,
    });
    expect(
      allB.some(
        (event) =>
          event.eventType === 'service.performed' &&
          event.sourceId === serviceEvent.id,
      ),
    ).toBe(false);
    expect(
      allB.some(
        (event) =>
          event.eventType === 'asset.location_started' &&
          event.relatedEntityId === asset.id,
      ),
    ).toBe(true);

    expect(
      allB.some(
        (event) =>
          event.sourceId === spaceCost.id ||
          event.sourceId === 'd8f10000-0000-4000-8000-000000000001' ||
          event.sourceId === 'd8f20000-0000-4000-8000-000000000001' ||
          event.sourceId === 'd8f30000-0000-4000-8000-000000000002',
      ),
    ).toBe(false);

    const meterOnly = await unitTimelineRepository.listByUnit(unitA.id, {
      categories: ['meter'],
      from: '2026-09-20' as import('@portfolio/domain').DateOnly,
      to: '2026-09-20' as import('@portfolio/domain').DateOnly,
      limit: 500,
      offset: 0,
    });
    const readingFromAll = allA.find(
      (event) => event.eventKey === `meter.reading:${reading.id}`,
    );
    const readingFromFilter = meterOnly.find(
      (event) => event.eventKey === `meter.reading:${reading.id}`,
    );
    expect(readingFromFilter?.eventKey).toBe(readingFromAll?.eventKey);

    const sameDay = await unitTimelineRepository.listByUnit(unitA.id, {
      categories: ['meter', 'tenancy'],
      from: '2026-09-20' as import('@portfolio/domain').DateOnly,
      to: '2026-09-20' as import('@portfolio/domain').DateOnly,
      limit: 500,
      offset: 0,
    });
    const readingIndex = sameDay.findIndex(
      (event) => event.eventKey === `meter.reading:${reading.id}`,
    );
    const tenancyStartIndex = sameDay.findIndex(
      (event) => event.eventType === 'tenancy.started',
    );
    expect(readingIndex).toBeGreaterThanOrEqual(0);
    expect(tenancyStartIndex).toBeGreaterThan(readingIndex);

    const projectionMeta = await sql<{
      is_insertable_into: string;
      domain_events_relation: string | null;
    }[]>`
      select
        v.is_insertable_into,
        to_regclass('public.domain_events')::text as domain_events_relation
      from information_schema.views v
      where v.table_schema = 'public'
        and v.table_name = 'unit_business_events'
    `;
    expect(projectionMeta[0]).toEqual({
      is_insertable_into: 'NO',
      domain_events_relation: null,
    });
  });


  it('persists append-only Cost ledger facts and rejects financial history bypasses', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });
    const ids = new SequenceIds([
      'ad000000-0000-4000-8000-000000000001',
      'ad000000-0000-4000-8000-000000000002',
      'ad000000-0000-4000-8000-000000000003',
      'ad000000-0000-4000-8000-000000000004',
      'ad000000-0000-4000-8000-000000000005',
      'ad000000-0000-4000-8000-000000000006',
      'ad000000-0000-4000-8000-000000000007',
      'ad000000-0000-4000-8000-000000000008',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-COST-INT',
        name: 'Cost Integration Property',
        propertyType: 'apartment_building',
        street: 'Ledger Street',
        houseNumber: '18',
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
        code: 'UNIT-COST-INT',
        unitNumber: 'C1',
        unitType: 'apartment',
      },
    );
    const supplier = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-COST-INT',
        partyType: 'company',
        legalName: 'Historical Cost Supplier d.o.o.',
      },
    );

    await sql`
      update public.parties
      set status = 'inactive'
      where id = ${supplier.id}
    `;

    const costDeps = {
      costRepository,
      portfolioRepository,
      partyRepository,
      assetRepository,
      assetServiceRepository,
      improvementRepository,
      maintenanceRepository,
      idGenerator: ids,
      clock: { now: () => '2026-09-19T10:00:00.000Z' },
    };

    const first = await createCostCommand(
      costDeps,
      actor,
      {
        source: { kind: 'property', propertyId: property.id },
        description: 'Roof works allocation',
        amount: '1200.5',
        currency: 'chf',
        incurredOn: '2026-09-18',
        reportingClass: 'capex',
        supplierPartyId: supplier.id,
        invoiceReference: 'INV-COST-INT-77',
      },
    );
    expect(first).toMatchObject({
      amount: '1200.50',
      currency: 'CHF',
      supplierPartyId: supplier.id,
    });

    const second = await createCostCommand(
      {
        ...costDeps,
        clock: { now: () => '2026-09-19T10:05:00.000Z' },
      },
      actor,
      {
        source: { kind: 'unit', unitId: unit.id },
        description: 'Unit share of the same supplier invoice',
        amount: '300',
        currency: 'CHF',
        incurredOn: '2026-09-18',
        reportingClass: 'opex',
        supplierPartyId: supplier.id,
        invoiceReference: 'INV-COST-INT-77',
      },
    );

    const sameInvoice =
      await costRepository.listCostsByInvoiceReference('INV-COST-INT-77');
    expect(sameInvoice).toHaveLength(2);

    await expect(
      sql`
        insert into public.costs (
          id, source_kind, property_id,
          description, amount, currency, incurred_on, reporting_class,
          recorded_at, recorded_by_user_id
        ) values (
          'adf00000-0000-4000-8000-000000000009',
          'property',
          ${property.id},
          'Unsupported currency',
          1,
          'ZZZ',
          '2026-09-18',
          'opex',
          '2026-09-19T10:09:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'costs_currency_supported',
    });

    await expect(
      sql`
        insert into public.costs (
          id, source_kind, property_id,
          description, amount, currency, incurred_on, reporting_class,
          recorded_at, recorded_by_user_id
        ) values (
          'adf00000-0000-4000-8000-000000000012',
          'property',
          ${property.id},
          'Over-scale amount must not be rounded',
          1.005,
          'CHF',
          '2026-09-18',
          'opex',
          '2026-09-19T10:09:30.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'costs_amount_scale_valid',
    });

    await expect(
      sql`
        insert into public.costs (
          id, source_kind, property_id, unit_id,
          description, amount, currency, incurred_on, reporting_class,
          recorded_at, recorded_by_user_id
        ) values (
          'adf00000-0000-4000-8000-000000000001',
          'property',
          ${property.id},
          ${unit.id},
          'Ambiguous source',
          1,
          'CHF',
          '2026-09-18',
          'opex',
          '2026-09-19T10:10:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'costs_exactly_one_source',
    });

    await expect(
      sql`
        insert into public.costs (
          id, source_kind, property_id,
          description, amount, currency, incurred_on, reporting_class,
          recorded_at, recorded_by_user_id
        ) values (
          'adf00000-0000-4000-8000-000000000002',
          'asset',
          ${property.id},
          'Spoofed source kind',
          1,
          'CHF',
          '2026-09-18',
          'opex',
          '2026-09-19T10:10:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'costs_source_kind_matches_target',
    });

    await expect(
      sql`
        insert into public.costs (
          id, source_kind, property_id,
          description, amount, currency, incurred_on, reporting_class,
          recorded_at, recorded_by_user_id
        ) values (
          'adf00000-0000-4000-8000-000000000003',
          'property',
          ${property.id},
          'Future financial fact',
          1,
          'CHF',
          '2026-09-20',
          'opex',
          '2026-09-19T23:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'costs_incurred_not_future',
    });

    await expect(
      sql`
        update public.costs
        set amount = 999
        where id = ${first.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'cost_immutable',
    });

    const correction = await correctCostCommand(
      {
        ...costDeps,
        clock: { now: () => '2026-09-19T11:00:00.000Z' },
      },
      actor,
      first.id,
      'Supplier corrected invoice allocation',
      {
        source: first.source,
        description: 'Roof works corrected allocation',
        amount: '1150',
        currency: 'CHF',
        incurredOn: '2026-09-18',
        reportingClass: 'capex',
        supplierPartyId: supplier.id,
        invoiceReference: 'INV-COST-INT-77',
      },
    );

    expect(correction.replacement).toMatchObject({
      amount: '1150.00',
      recordedAt: '2026-09-19T11:00:00.000Z',
    });
    expect(correction.reversal).toMatchObject({
      costId: first.id,
      replacementCostId: correction.replacement.id,
      recordedAt: '2026-09-19T11:00:00.000Z',
    });

    const originalStillThere = await costRepository.getCostById(first.id);
    expect(originalStillThere).toMatchObject({ amount: '1200.50' });

    const incomingCorrection =
      await costRepository.getReversalByReplacementCostId(
        correction.replacement.id,
      );
    expect(incomingCorrection).toMatchObject({
      costId: first.id,
      replacementCostId: correction.replacement.id,
    });

    await sql`
      insert into public.costs (
        id, source_kind, property_id,
        description, amount, currency, incurred_on, reporting_class,
        recorded_at, recorded_by_user_id
      ) values (
        'adf00000-0000-4000-8000-000000000010',
        'property',
        ${property.id},
        'Pre-existing would-be replacement',
        1100,
        'CHF',
        '2026-09-18',
        'capex',
        '2026-09-19T13:00:00.000Z',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      )
    `;

    await expect(
      sql`
        insert into public.cost_reversals (
          id, cost_id, replacement_cost_id, reason,
          recorded_at, recorded_by_user_id
        ) values (
          'adf00000-0000-4000-8000-000000000011',
          ${correction.replacement.id},
          'adf00000-0000-4000-8000-000000000010',
          'Must not retrofit another recorder cost as replacement',
          '2026-09-19T13:00:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'cost_reversal_replacement_recorder_mismatch',
    });

    await expect(
      sql`
        insert into public.cost_reversals (
          id, cost_id, reason, recorded_at, recorded_by_user_id
        ) values (
          'adf00000-0000-4000-8000-000000000004',
          ${first.id},
          'Duplicate reversal sabotage',
          '2026-09-19T11:05:00.000Z',
          ${actor.userId}
        )
      `,
    ).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'cost_reversals_cost_uq',
    });

    await expect(
      sql`
        update public.cost_reversals
        set reason = 'Rewrite reversal'
        where id = ${correction.reversal.id}
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'cost_reversal_immutable',
    });

    const secondReversal = await reverseCostCommand(
      {
        costRepository,
        idGenerator: ids,
        clock: { now: () => '2026-09-19T11:05:00.000Z' },
      },
      actor,
      second.id,
      'Void second allocation',
    );
    expect(secondReversal.replacementCostId).toBeNull();

    const rogueReplacement = createCost({
      id: asCostId('adf00000-0000-4000-8000-000000000005'),
      source: second.source,
      description: 'Must roll back',
      amount: '250',
      currency: 'CHF',
      incurredOn: '2026-09-18',
      reportingClass: 'opex',
      supplierPartyId: supplier.id,
      invoiceReference: 'INV-COST-INT-77',
      recordedAt: '2026-09-19T12:00:00.000Z',
      recordedByUserId: actor.userId,
    });
    const duplicateCorrection = createCostReversal({
      id: asCostReversalId('adf00000-0000-4000-8000-000000000006'),
      cost: second,
      replacementCost: rogueReplacement,
      reason: 'Must fail atomically',
      recordedAt: '2026-09-19T12:00:00.000Z',
      recordedByUserId: actor.userId,
    });

    await expect(
      costRepository.insertCorrection(
        rogueReplacement,
        duplicateCorrection,
      ),
    ).rejects.toMatchObject({
      code: 'COST_ALREADY_REVERSED',
    });
    expect(
      await costRepository.getCostById(rogueReplacement.id),
    ).toBeNull();
  });

  it('projects reporting from canonical temporal, legal, operational and financial truth', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });

    const dashboardBaseline = await reportingRepository.getPortfolioDashboard(
      asDateOnly('2026-07-01'),
    );

    const ids = new SequenceIds(
      Array.from(
        { length: 220 },
        (_, index) =>
          `e9000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      ),
    );

    const propertyA = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-REPORT-A',
        name: 'Reporting Property A',
        propertyType: 'apartment_building',
        street: 'Reporting Street',
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
        propertyId: propertyA.id,
        code: 'UNIT-REPORT-A',
        unitNumber: 'A-1',
        unitType: 'apartment',
        areaM2: 80,
        rooms: 3,
      },
    );

    const spaceA = await createSpaceCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        unitId: unitA.id,
        code: 'SPACE-REPORT-A',
        name: 'Reporting room',
        spaceType: 'other',
      },
    );

    const propertyB = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-REPORT-B',
        name: 'Reporting Property B',
        propertyType: 'apartment_building',
        street: 'Reporting Street',
        houseNumber: '2',
        postalCode: '18000',
        city: 'Niš',
        countryCode: 'RS',
      },
    );

    const unitB = await createUnitCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        propertyId: propertyB.id,
        code: 'UNIT-REPORT-B',
        unitNumber: 'B-1',
        unitType: 'apartment',
      },
    );

    const tenant = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-REPORT-TENANT',
        partyType: 'person',
        firstName: 'Reporting',
        lastName: 'Tenant',
      },
    );

    const landlord = await createPartyCommand(
      { partyRepository, idGenerator: ids },
      actor,
      {
        code: 'PTY-REPORT-LANDLORD',
        partyType: 'company',
        legalName: 'Reporting Landlord d.o.o.',
      },
    );

    const tenancyDraft = await createTenancyCommand(
      {
        tenancyRepository,
        portfolioRepository,
        partyRepository,
        idGenerator: ids,
      },
      actor,
      {
        unitId: unitA.id,
        code: 'TEN-REPORT-A',
        parties: [
          {
            partyId: tenant.id,
            role: 'tenant',
            isPrimary: true,
          },
        ],
      },
    );

    const tenancyPlanned = await planTenancyCommand(
      { tenancyRepository },
      actor,
      tenancyDraft.id,
      tenancyDraft.version,
      '2026-01-01',
    );

    const tenancy = await activateTenancyCommand(
      { tenancyRepository },
      actor,
      tenancyPlanned.id,
      tenancyPlanned.version,
      '2026-01-01',
    );

    const leaseDeps = {
      leaseRepository,
      tenancyRepository,
      partyRepository,
      idGenerator: ids,
    };

    const initialDraft = await createLeaseAgreementCommand(
      leaseDeps,
      actor,
      {
        tenancyId: tenancy.id,
        code: 'AGR-REPORT-1',
        agreementType: 'initial',
        effectiveFrom: '2026-01-01',
        parties: [
          { partyId: landlord.id, role: 'landlord' },
          { partyId: tenant.id, role: 'tenant' },
        ],
      },
    );

    const initial = await signLeaseAgreementCommand(
      leaseDeps,
      actor,
      initialDraft.id,
      initialDraft.version,
      '2025-12-20',
      {
        currency: 'CHF',
        baseRent: '1000',
        serviceCharge: '100',
      },
    );

    const supersededFutureAmendmentDraft =
      await createLeaseAmendmentCommand(
        { leaseRepository, idGenerator: ids },
        actor,
        {
          agreementId: initial.id,
          code: 'AMD-REPORT-OLD-FUTURE',
          title: 'Future adjustment on predecessor',
          effectiveFrom: '2026-08-01',
        },
      );

    await signLeaseAmendmentCommand(
      { leaseRepository, tenancyRepository, idGenerator: ids },
      actor,
      supersededFutureAmendmentDraft.id,
      supersededFutureAmendmentDraft.version,
      '2026-05-15',
      {
        currency: 'CHF',
        baseRent: '9000',
        serviceCharge: '100',
      },
    );

    const successorDraft = await createLeaseAgreementCommand(
      leaseDeps,
      actor,
      {
        tenancyId: tenancy.id,
        code: 'AGR-REPORT-2',
        agreementType: 'renewal',
        predecessorAgreementId: initial.id,
        effectiveFrom: '2026-07-01',
        parties: [
          { partyId: landlord.id, role: 'landlord' },
          { partyId: tenant.id, role: 'tenant' },
        ],
      },
    );

    const successor = await signLeaseAgreementCommand(
      leaseDeps,
      actor,
      successorDraft.id,
      successorDraft.version,
      '2026-06-01',
      {
        currency: 'CHF',
        baseRent: '1100',
        serviceCharge: '100',
      },
    );

    const thirdDraft = await createLeaseAgreementCommand(
      leaseDeps,
      actor,
      {
        tenancyId: tenancy.id,
        code: 'AGR-REPORT-3',
        agreementType: 'renewal',
        predecessorAgreementId: successor.id,
        effectiveFrom: '2027-01-01',
        parties: [
          { partyId: landlord.id, role: 'landlord' },
          { partyId: tenant.id, role: 'tenant' },
        ],
      },
    );

    const third = await signLeaseAgreementCommand(
      leaseDeps,
      actor,
      thirdDraft.id,
      thirdDraft.version,
      '2026-11-01',
      {
        currency: 'CHF',
        baseRent: '1200',
        serviceCharge: '100',
      },
    );

    await createLeaseAgreementCommand(
      leaseDeps,
      actor,
      {
        tenancyId: tenancy.id,
        code: 'AGR-REPORT-4-DRAFT',
        agreementType: 'renewal',
        predecessorAgreementId: third.id,
        effectiveFrom: '2027-07-01',
        parties: [
          { partyId: landlord.id, role: 'landlord' },
          { partyId: tenant.id, role: 'tenant' },
        ],
      },
    );

    const currentClock = { now: () => '2026-09-21T08:00:00.000Z' };

    const assetA = await createAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: currentClock,
      },
      actor,
      {
        code: 'ASSET-REPORT-A',
        name: 'Reporting Asset A',
        propertyId: propertyA.id,
        unitId: unitA.id,
      },
    );

    const assetB = await createAssetCommand(
      {
        assetRepository,
        portfolioRepository,
        idGenerator: ids,
        clock: currentClock,
      },
      actor,
      {
        code: 'ASSET-REPORT-B',
        name: 'Reporting Asset B',
        propertyId: propertyB.id,
        unitId: unitB.id,
      },
    );

    const assetServiceDeps = {
      assetRepository,
      assetServiceRepository,
      partyRepository,
      idGenerator: ids,
      clock: currentClock,
    };

    await createServicePlanCommand(
      assetServiceDeps,
      actor,
      assetA.id,
      {
        name: 'Reporting annual service',
        scheduleKind: 'recurring',
        firstDueOn: '2026-10-01',
        intervalMonths: 12,
      },
    );

    const warranty = await createWarrantyCommand(
      assetServiceDeps,
      actor,
      assetA.id,
      {
        warrantyType: 'manufacturer',
        validFrom: '2026-01-01',
        validTo: '2027-12-31',
      },
    );

    await createWarrantyClaimCommand(
      {
        assetServiceRepository,
        idGenerator: ids,
        clock: currentClock,
      },
      actor,
      warranty.id,
      {
        incidentOn: '2026-09-10',
        description: 'Reporting open warranty claim',
      },
    );

    const maintenanceDeps = {
      maintenanceRepository,
      portfolioRepository,
      assetRepository,
      assetServiceRepository,
      inspectionRepository,
      partyRepository,
      staffDirectoryRepository: accessRepository,
      idGenerator: ids,
      clock: currentClock,
    };

    const issue = await createMaintenanceIssueCommand(
      maintenanceDeps,
      actor,
      {
        code: 'MI-REPORT-A',
        propertyId: propertyA.id,
        unitId: unitA.id,
        assetId: assetA.id,
        title: 'Reporting urgent issue',
        priority: 'urgent',
        reportedAt: '2026-09-21T08:00:00.000Z',
      },
    );

    await createMaintenanceWorkOrderCommand(
      {
        maintenanceRepository,
        idGenerator: ids,
        clock: currentClock,
      },
      actor,
      issue.id,
      {
        code: 'WO-REPORT-A',
        title: 'Reporting work order',
      },
    );

    await createMeterCommand(
      {
        meterRepository,
        portfolioRepository,
        tenancyRepository,
        idGenerator: ids,
        clock: currentClock,
      },
      actor,
      {
        code: 'MTR-REPORT-A',
        serialNumber: 'SER-REPORT-A',
        utilityType: 'electricity',
        measurementUnit: 'kwh',
        unitId: unitA.id,
        label: 'Reporting Meter A',
        installedAt: '2026-09-01T00:00:00.000Z',
      },
    );

    const costDeps = {
      costRepository,
      portfolioRepository,
      partyRepository,
      assetRepository,
      assetServiceRepository,
      improvementRepository,
      maintenanceRepository,
      idGenerator: ids,
      clock: currentClock,
    };

    await createCostCommand(
      costDeps,
      actor,
      {
        source: { kind: 'unit', unitId: unitA.id },
        description: 'Unit CAPEX',
        amount: '100',
        currency: 'CHF',
        incurredOn: '2026-06-15',
        reportingClass: 'capex',
      },
    );

    await createCostCommand(
      costDeps,
      actor,
      {
        source: { kind: 'space', spaceId: spaceA.id },
        description: 'Space OPEX',
        amount: '25.50',
        currency: 'CHF',
        incurredOn: '2026-06-16',
        reportingClass: 'opex',
      },
    );

    await createCostCommand(
      costDeps,
      actor,
      {
        source: { kind: 'unit', unitId: unitA.id },
        description: 'Unit EUR unclassified',
        amount: '10',
        currency: 'EUR',
        incurredOn: '2026-06-17',
        reportingClass: 'unclassified',
      },
    );

    await createCostCommand(
      costDeps,
      actor,
      {
        source: { kind: 'property', propertyId: propertyA.id },
        description: 'Property EUR OPEX',
        amount: '40',
        currency: 'EUR',
        incurredOn: '2026-06-18',
        reportingClass: 'opex',
      },
    );

    const correctedOriginal = await createCostCommand(
      costDeps,
      actor,
      {
        source: { kind: 'unit', unitId: unitA.id },
        description: 'Original incorrect Unit OPEX',
        amount: '5',
        currency: 'CHF',
        incurredOn: '2026-06-19',
        reportingClass: 'opex',
      },
    );

    await correctCostCommand(
      costDeps,
      actor,
      correctedOriginal.id,
      'Correct reporting amount',
      {
        source: { kind: 'unit', unitId: unitA.id },
        description: 'Corrected Unit OPEX',
        amount: '7',
        currency: 'CHF',
        incurredOn: '2026-06-19',
        reportingClass: 'opex',
      },
    );

    await createCostCommand(
      costDeps,
      actor,
      {
        source: { kind: 'unit', unitId: unitA.id },
        description: 'Post-asOf Unit cost',
        amount: '999',
        currency: 'CHF',
        incurredOn: '2026-09-01',
        reportingClass: 'opex',
      },
    );

    await createCostCommand(
      costDeps,
      actor,
      {
        source: { kind: 'unit', unitId: unitB.id },
        description: 'Property B Unit cost',
        amount: '33',
        currency: 'CHF',
        incurredOn: '2026-06-20',
        reportingClass: 'opex',
      },
    );

    const beforeSuccessor = await reportingRepository.getUnitOverview(
      unitA.id,
      asDateOnly('2026-06-30'),
    );
    expect(beforeSuccessor).toMatchObject({
      occupancyStatus: 'occupied',
      tenancy: {
        id: tenancy.id,
      },
      contract: {
        coverageStatus: 'effective',
        currentDraftAgreementCount: 1,
        agreementId: initial.id,
        agreementCurrentStatus: 'superseded',
        effectiveTerms: {
          baseRent: '1000.00',
          recurringTotal: '1100.00',
        },
      },
      currentOperations: {
        openMaintenanceIssueCount: 1,
        urgentMaintenanceIssueCount: 1,
        openMaintenanceWorkOrderCount: 1,
        locatedAssetCount: 1,
        activeAssetCount: 1,
        activeServicePlanCount: 1,
        openWarrantyClaimCount: 1,
        activeMeterCount: 1,
      },
    });

    const onSuccessorBoundary = await reportingRepository.getUnitOverview(
      unitA.id,
      asDateOnly('2026-07-01'),
    );
    expect(onSuccessorBoundary).toMatchObject({
      contract: {
        coverageStatus: 'effective',
        currentDraftAgreementCount: 1,
        agreementId: successor.id,
        agreementCurrentStatus: 'superseded',
        effectiveTerms: {
          baseRent: '1100.00',
          recurringTotal: '1200.00',
        },
      },
      unitAttributedCostsByCurrency: [
        {
          currency: 'CHF',
          capex: '100.00',
          opex: '32.50',
          unclassified: '0.00',
          total: '132.50',
        },
        {
          currency: 'EUR',
          capex: '0.00',
          opex: '0.00',
          unclassified: '10.00',
          total: '10.00',
        },
      ],
    });

    const afterSupersededFutureAmendment =
      await reportingRepository.getUnitOverview(
        unitA.id,
        asDateOnly('2026-08-01'),
      );
    expect(afterSupersededFutureAmendment).toMatchObject({
      contract: {
        coverageStatus: 'effective',
        agreementId: successor.id,
        effectiveTerms: {
          baseRent: '1100.00',
          recurringTotal: '1200.00',
        },
      },
    });

    const futureInitial = await reportingRepository.getUnitOverview(
      unitA.id,
      asDateOnly('2025-12-31'),
    );
    expect(futureInitial).toMatchObject({
      occupancyStatus: 'vacant',
      tenancy: null,
      contract: {
        coverageStatus: 'missing',
        currentDraftAgreementCount: 0,
      },
    });

    const thirdBoundary = await reportingRepository.getUnitOverview(
      unitA.id,
      asDateOnly('2027-01-01'),
    );
    expect(thirdBoundary).toMatchObject({
      contract: {
        coverageStatus: 'effective',
        currentDraftAgreementCount: 1,
        agreementId: third.id,
        agreementCurrentStatus: 'signed',
        effectiveTerms: {
          baseRent: '1200.00',
          recurringTotal: '1300.00',
        },
      },
    });

    const dashboard = await reportingRepository.getPortfolioDashboard(
      asDateOnly('2026-07-01'),
    );

    expect(dashboard).toMatchObject({
      propertyCount: dashboardBaseline.propertyCount + 2,
      unitCount: dashboardBaseline.unitCount + 2,
      occupiedUnitCount: dashboardBaseline.occupiedUnitCount + 1,
      plannedUnitCount: dashboardBaseline.plannedUnitCount,
      vacantUnitCount: dashboardBaseline.vacantUnitCount + 1,
      currentOperations: {
        openMaintenanceIssueCount:
          dashboardBaseline.currentOperations.openMaintenanceIssueCount + 1,
        urgentMaintenanceIssueCount:
          dashboardBaseline.currentOperations.urgentMaintenanceIssueCount + 1,
        openMaintenanceWorkOrderCount:
          dashboardBaseline.currentOperations.openMaintenanceWorkOrderCount + 1,
        locatedAssetCount:
          dashboardBaseline.currentOperations.locatedAssetCount + 2,
        activeAssetCount:
          dashboardBaseline.currentOperations.activeAssetCount + 2,
        inactiveAssetCount:
          dashboardBaseline.currentOperations.inactiveAssetCount,
        activeServicePlanCount:
          dashboardBaseline.currentOperations.activeServicePlanCount + 1,
        openWarrantyClaimCount:
          dashboardBaseline.currentOperations.openWarrantyClaimCount + 1,
        activeMeterCount:
          dashboardBaseline.currentOperations.activeMeterCount + 1,
      },
    });

    function cents(value: string): bigint {
      return BigInt(value.replace('.', ''));
    }

    function costByCurrency(
      rows: readonly { currency: string; capex: string; opex: string; unclassified: string; total: string }[],
      currency: string,
    ) {
      return (
        rows.find((row) => row.currency === currency) ?? {
          currency,
          capex: '0.00',
          opex: '0.00',
          unclassified: '0.00',
          total: '0.00',
        }
      );
    }

    const baselineChf = costByCurrency(
      dashboardBaseline.portfolioCostsByCurrency,
      'CHF',
    );
    const dashboardChf = costByCurrency(
      dashboard.portfolioCostsByCurrency,
      'CHF',
    );
    expect(cents(dashboardChf.capex) - cents(baselineChf.capex)).toBe(10000n);
    expect(cents(dashboardChf.opex) - cents(baselineChf.opex)).toBe(6550n);
    expect(
      cents(dashboardChf.unclassified) - cents(baselineChf.unclassified),
    ).toBe(0n);
    expect(cents(dashboardChf.total) - cents(baselineChf.total)).toBe(16550n);

    const baselineEur = costByCurrency(
      dashboardBaseline.portfolioCostsByCurrency,
      'EUR',
    );
    const dashboardEur = costByCurrency(
      dashboard.portfolioCostsByCurrency,
      'EUR',
    );
    expect(cents(dashboardEur.capex) - cents(baselineEur.capex)).toBe(0n);
    expect(cents(dashboardEur.opex) - cents(baselineEur.opex)).toBe(4000n);
    expect(
      cents(dashboardEur.unclassified) - cents(baselineEur.unclassified),
    ).toBe(1000n);
    expect(cents(dashboardEur.total) - cents(baselineEur.total)).toBe(5000n);

    const reportingPropertyA = dashboard.properties.find(
      (property) => property.propertyId === propertyA.id,
    );
    const reportingPropertyB = dashboard.properties.find(
      (property) => property.propertyId === propertyB.id,
    );

    expect(reportingPropertyA).toMatchObject({
      propertyId: propertyA.id,
      unitCount: 1,
      occupiedUnitCount: 1,
      plannedUnitCount: 0,
      vacantUnitCount: 0,
      currentOpenMaintenanceIssueCount: 1,
      currentUrgentMaintenanceIssueCount: 1,
      currentLocatedAssetCount: 1,
      currentActiveAssetCount: 1,
      currentActiveMeterCount: 1,
    });
    expect(reportingPropertyB).toMatchObject({
      propertyId: propertyB.id,
      unitCount: 1,
      occupiedUnitCount: 0,
      plannedUnitCount: 0,
      vacantUnitCount: 1,
      currentOpenMaintenanceIssueCount: 0,
      currentUrgentMaintenanceIssueCount: 0,
      currentLocatedAssetCount: 1,
      currentActiveAssetCount: 1,
      currentActiveMeterCount: 0,
    });

    const relationCheck = await sql<{
      reporting_table_count: number;
    }[]>`
      select count(*)::int as reporting_table_count
      from information_schema.tables
      where table_schema = 'public'
        and table_name like 'reporting_%'
    `;
    expect(relationCheck[0]?.reporting_table_count).toBe(0);

    // Reporting is a read model; nothing in this query path mutates source rows.
    expect(assetB.unitId).toBe(unitB.id);
  });


  it('accepts exact Portfolio money aggregates beyond the scalar MoneyAmount range', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });
    const [propertyRow] = await sql<{ id: string }[]>`
      select id
      from public.properties
      order by id
      limit 1
    `;
    if (!propertyRow) throw new Error('Expected a Property for reporting aggregate test.');

    const asOf = asDateOnly('2026-09-21');
    const before = await reportingRepository.getPortfolioDashboard(asOf);
    const ids = new SequenceIds([
      'f2400000-0000-4000-8000-000000000001',
      'f2400000-0000-4000-8000-000000000002',
    ]);
    const deps = {
      costRepository,
      portfolioRepository,
      partyRepository,
      assetRepository,
      assetServiceRepository,
      improvementRepository,
      maintenanceRepository,
      idGenerator: ids,
      clock: { now: () => '2026-09-21T12:00:00.000Z' },
    };
    const propertyId = asPropertyId(propertyRow.id);

    for (const description of ['Wide aggregate A', 'Wide aggregate B']) {
      await createCostCommand(
        deps,
        actor,
        {
          source: { kind: 'property', propertyId },
          description,
          amount: '9999999999999999.99',
          currency: 'CHF',
          incurredOn: '2026-09-21',
          reportingClass: 'capex',
        },
      );
    }

    const after = await reportingRepository.getPortfolioDashboard(asOf);
    const beforeChf = before.portfolioCostsByCurrency.find(
      (item) => item.currency === 'CHF',
    );
    const afterChf = after.portfolioCostsByCurrency.find(
      (item) => item.currency === 'CHF',
    );
    if (!afterChf) throw new Error('Expected CHF Portfolio aggregate.');

    const cents = (value: string): bigint => BigInt(value.replace('.', ''));
    expect(
      cents(afterChf.total) - cents(beforeChf?.total ?? '0.00'),
    ).toBe(1999999999999999998n);
    expect(
      cents(afterChf.capex) - cents(beforeChf?.capex ?? '0.00'),
    ).toBe(1999999999999999998n);
  });

  it('keeps one reporting response on one repeatable-read database snapshot', async () => {
    const reportingSql = postgres(connectionString, { max: 1 });
    const writerSql = postgres(connectionString, { max: 1 });
    let releaseSnapshot!: () => void;
    const snapshotEstablished = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    let releaseReporting!: () => void;
    const writerCommitted = new Promise<void>((resolve) => {
      releaseReporting = resolve;
    });

    try {
      const [propertyRow] = await writerSql<{ id: string }[]>`
        select id
        from public.properties
        order by id
        limit 1
      `;
      if (!propertyRow) throw new Error('Expected a Property for reporting snapshot test.');

      const writerAccessRepository = new PostgresUserAccessRepository(writerSql);
      const writerActor = await resolveActor(writerAccessRepository, {
        provider: 'supabase',
        subject: 'external-admin-subject',
      });
      const writerPortfolioRepository = new PostgresPortfolioRepository(writerSql);
      const writerMaintenanceRepository = new PostgresMaintenanceRepository(writerSql);
      const writerAssetRepository = new PostgresAssetRepository(writerSql);
      const writerAssetServiceRepository = new PostgresAssetServiceRepository(writerSql);
      const writerInspectionRepository = new PostgresInspectionRepository(writerSql);
      const writerPartyRepository = new PostgresPartyRepository(writerSql);
      const asOf = asDateOnly('2026-09-21');

      const reportingRead = reportingSql.begin(
        'isolation level repeatable read read only',
        async (tx) => {
          const [mode] = await tx<{
            isolation_level: string;
            read_only: string;
          }[]>`
            select
              current_setting('transaction_isolation') as isolation_level,
              current_setting('transaction_read_only') as read_only
          `;
          expect(mode).toEqual({
            isolation_level: 'repeatable read',
            read_only: 'on',
          });

          const propertyRows = await tx<{
            current_open_maintenance_issue_count: string | number | bigint;
          }[]>`
            select current_open_maintenance_issue_count
            from public.reporting_property_summaries(${asOf}::date)
          `;
          const propertyOpenIssues = propertyRows.reduce(
            (sum, row) =>
              sum + Number(row.current_open_maintenance_issue_count),
            0,
          );

          releaseSnapshot();
          await writerCommitted;

          const [operations] = await tx<{
            open_maintenance_issue_count: string | number | bigint;
          }[]>`
            select count(*)::bigint as open_maintenance_issue_count
            from public.maintenance_issues
            where status = 'open'
          `;
          if (!operations) {
            throw new Error('Expected Portfolio operations row.');
          }

          expect(Number(operations.open_maintenance_issue_count)).toBe(
            propertyOpenIssues,
          );
          return propertyOpenIssues;
        },
      );

      await snapshotEstablished;

      let writerFailure: unknown;
      try {
        await createMaintenanceIssueCommand(
          {
            maintenanceRepository: writerMaintenanceRepository,
            portfolioRepository: writerPortfolioRepository,
            assetRepository: writerAssetRepository,
            assetServiceRepository: writerAssetServiceRepository,
            inspectionRepository: writerInspectionRepository,
            partyRepository: writerPartyRepository,
            staffDirectoryRepository: writerAccessRepository,
            idGenerator: new SequenceIds([
              'f2400000-0000-4000-8000-000000000010',
            ]),
            clock: { now: () => '2026-09-21T12:30:00.000Z' },
          },
          writerActor,
          {
            code: 'MI-REPORT-SNAPSHOT-RACE',
            propertyId: asPropertyId(propertyRow.id),
            title: 'Concurrent reporting snapshot proof',
            priority: 'normal',
            reportedAt: '2026-09-21T12:30:00.000Z',
          },
        );
      } catch (error) {
        writerFailure = error;
      } finally {
        releaseReporting();
      }

      const preWriteOpenIssues = await reportingRead;
      if (writerFailure !== undefined) throw writerFailure;

      const fresh = await new PostgresReportingRepository(
        reportingSql,
      ).getPortfolioDashboard(asOf);
      expect(fresh.currentOperations.openMaintenanceIssueCount).toBe(
        preWriteOpenIssues + 1,
      );
      expect(
        fresh.properties.reduce(
          (sum, property) =>
            sum + property.currentOpenMaintenanceIssueCount,
          0,
        ),
      ).toBe(preWriteOpenIssues + 1);
    } finally {
      await reportingSql.end();
      await writerSql.end();
    }
  });

  it('reads Unit document links at link grain with exact optional versions', async () => {
    const actor = await resolveActor(accessRepository, {
      provider: 'supabase',
      subject: 'external-admin-subject',
    });
    const ids = new SequenceIds([
      'c9f70000-0000-4000-8000-000000000001',
      'c9f70000-0000-4000-8000-000000000002',
      'c9f70000-0000-4000-8000-000000000003',
      'c9f70000-0000-4000-8000-000000000004',
      'c9f70000-0000-4000-8000-000000000005',
      'c9f70000-0000-4000-8000-000000000006',
      'c9f70000-0000-4000-8000-000000000007',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator: ids },
      actor,
      {
        code: 'PROP-UNIT-DOC-INT',
        name: 'Unit document integration',
        propertyType: 'apartment_building',
        street: 'Document Street',
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
        code: 'UNIT-DOC-READ-INT',
        unitNumber: 'D-1',
        unitType: 'apartment',
      },
    );

    const document = await createDocumentCommand(
      { documentRepository, idGenerator: ids },
      actor,
      {
        code: 'DOC-UNIT-INT',
        title: 'Unit technical evidence',
        category: 'technical',
      },
    );

    const fileStorage = {
      async put(input: { objectKey: string; content: Uint8Array }) {
        return {
          provider: 'integration-test',
          objectId: 'unit-document-object',
          objectKey: input.objectKey,
          byteSize: input.content.byteLength,
          sha256: 'f'.repeat(64),
          disposition: 'created' as const,
        };
      },
      async stat(
        reference: import('@portfolio/application').StorageObjectReference,
      ) {
        return {
          ...reference,
          byteSize: 4,
          sha256: 'f'.repeat(64),
        };
      },
      async remove() {},
    };

    const version = await uploadDocumentVersionCommand(
      { documentRepository, fileStorage, idGenerator: ids },
      actor,
      {
        documentId: document.id,
        fileName: 'unit-evidence.pdf',
        mimeType: 'application/pdf',
        content: new Uint8Array([1, 2, 3, 4]),
      },
    );

    await linkDocumentCommand(
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
        documentVersionId: version.id,
        relation: 'supporting',
        targetType: 'unit',
        targetId: unit.id,
      },
    );

    await linkDocumentCommand(
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
        relation: 'other',
        targetType: 'unit',
        targetId: unit.id,
      },
    );

    await linkDocumentCommand(
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
        relation: 'attachment',
        targetType: 'property',
        targetId: property.id,
      },
    );

    const references = await listUnitDocumentsQuery(
      documentRepository,
      portfolioRepository,
      actor,
      unit.id,
    );

    expect(references).toHaveLength(2);
    expect(
      references.every(
        (reference) =>
          reference.link.targetType === 'unit' &&
          reference.link.targetId === unit.id &&
          reference.document.id === document.id,
      ),
    ).toBe(true);

    const supporting = references.find(
      (reference) => reference.link.relation === 'supporting',
    );
    const documentLevel = references.find(
      (reference) => reference.link.relation === 'other',
    );

    expect(supporting?.linkedVersion).toMatchObject({
      id: version.id,
      documentId: document.id,
      versionNumber: 1,
      fileName: 'unit-evidence.pdf',
    });
    expect(documentLevel?.link.documentVersionId).toBeNull();
    expect(documentLevel?.linkedVersion).toBeNull();
  });


});
