import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activateTenancyCommand,
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
  lockInspectionCommand,
  planTenancyCommand,
  publishInspectionSchemaVersionCommand,
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
  PostgresDocumentRepository,
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
const partyRepository = new PostgresPartyRepository(sql);
const ownershipRepository = new PostgresOwnershipRepository(sql);
const leaseRepository = new PostgresLeaseRepository(sql);
const tenancyRepository = new PostgresTenancyRepository(sql);
const accessRepository = new PostgresUserAccessRepository(sql);
const documentRepository = new PostgresDocumentRepository(sql);
const inspectionRepository = new PostgresInspectionRepository(sql);

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
        ('a2000000-0000-4000-8000-000000000002', 'DOC-EVIDENCE-LANDLORD-1', 'Landlord signature 1', 'inspection', 'active', 1, 2),
        ('a2000000-0000-4000-8000-000000000003', 'DOC-EVIDENCE-LANDLORD-2', 'Landlord signature 2', 'inspection', 'active', 1, 2),
        ('a2000000-0000-4000-8000-000000000004', 'DOC-EVIDENCE-TENANT', 'Tenant signature', 'inspection', 'active', 1, 2)
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

    const evidence = await attachInspectionEvidenceCommand(
      {
        inspectionRepository,
        documentRepository,
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
        idGenerator: ids,
        clock: { now: () => '2026-09-21T08:50:00.000Z' },
      },
      actor,
      inspection.id,
      beforeFinalize.version,
    );
    expect(finalized.inspection.status).toBe('finalized');
    expect(finalized.snapshot.payload.evidence).toHaveLength(1);
    expect(
      finalized.snapshot.payload.signatures.map((signature) => signature.signerRole),
    ).toEqual(['landlord', 'tenant']);

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

    let renderCalls = 0;
    const pdfPort = {
      async renderInspectionFinalReport(
        snapshot: import('@portfolio/domain').InspectionFinalSnapshot,
      ) {
        renderCalls += 1;
        expect(snapshot.inspectionId).toBe(inspection.id);
        return {
          fileName: 'inspection-final.pdf',
          content: new Uint8Array([37, 80, 68, 70, 45, 49]),
        };
      },
    };
    const fileStorage = {
      async put(input: {
        objectKey: string;
        content: Uint8Array;
      }) {
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
        return {
          ...reference,
          byteSize: 6,
          sha256: 'f'.repeat(64),
        };
      },
      async remove() {},
    };

    const reportVersion = await generateInspectionFinalReportCommand(
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
    );
    expect(reportVersion).toMatchObject({
      status: 'final',
      mimeType: 'application/pdf',
    });

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
    expect(renderCalls).toBe(1);

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

    const final = await finalizeDocumentVersionCommand(
      {
        documentRepository,
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

});
