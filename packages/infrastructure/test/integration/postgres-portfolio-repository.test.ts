import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPropertyCommand,
  createSpaceCommand,
  createUnitCommand,
  listPropertiesQuery,
  listSpacesByUnitQuery,
  listUnitsByPropertyQuery,
  resolveActor,
  type IdGenerator,
  type VerifiedIdentity,
} from '@portfolio/application';
import {
  PostgresPortfolioRepository,
  PostgresUserAccessRepository,
} from '../../src/index.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
}

const sql = postgres(connectionString, { max: 1 });
const portfolioRepository = new PostgresPortfolioRepository(sql);
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
    'drop table if exists public.auth_identities, public.app_users, public.spaces, public.units, public.properties cascade',
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
    'drop table if exists public.auth_identities, public.app_users, public.spaces, public.units, public.properties cascade',
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
