import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createOwnershipPeriodCommand,
  createPartyCommand,
  createPropertyCommand,
  createSpaceCommand,
  createUnitCommand,
  listOwnershipPeriodsByUnitQuery,
  listPropertiesQuery,
  listSpacesByUnitQuery,
  listUnitsByPropertyQuery,
  resolveActor,
  type IdGenerator,
  type VerifiedIdentity,
} from '@portfolio/application';
import {
  asOwnershipPeriodId,
  asPartyAddressId,
  asPartyId,
  createOwnershipPeriod,
  type Party,
} from '@portfolio/domain';
import {
  PostgresOwnershipRepository,
  PostgresPartyRepository,
  PostgresPortfolioRepository,
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
          'vacant'
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
