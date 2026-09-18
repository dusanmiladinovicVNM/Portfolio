import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activateTenancyCommand,
  cancelLeaseAgreementCommand,
  createLeaseAgreementCommand,
  createLeaseAmendmentCommand,
  createOwnershipPeriodCommand,
  createPartyCommand,
  createTenancyCommand,
  createPropertyCommand,
  createSpaceCommand,
  createUnitCommand,
  getEffectiveTenancyTermsQuery,
  giveTenancyNoticeCommand,
  listOwnershipPeriodsByUnitQuery,
  listPropertiesQuery,
  listSpacesByUnitQuery,
  listTenanciesByUnitQuery,
  listUnitsByPropertyQuery,
  planTenancyCommand,
  resolveActor,
  signLeaseAgreementCommand,
  signLeaseAmendmentCommand,
  type IdGenerator,
  type VerifiedIdentity,
} from '@portfolio/application';
import {
  asOwnershipPeriodId,
  asPartyAddressId,
  asPartyId,
  asTenancyId,
  createOwnershipPeriod,
  createTenancy,
  planTenancy,
  type Party,
} from '@portfolio/domain';
import {
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
});
