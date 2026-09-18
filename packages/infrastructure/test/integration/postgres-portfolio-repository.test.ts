import { readFile } from 'node:fs/promises';
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
  type IdGenerator,
} from '@portfolio/application';
import { PostgresPortfolioRepository } from '../../src/index.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
}

const sql = postgres(connectionString, { max: 1 });
const repository = new PostgresPortfolioRepository(sql);

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

beforeAll(async () => {
  await sql.unsafe('drop table if exists public.spaces, public.units, public.properties cascade');

  const migrationUrl = new URL(
    '../../../../supabase/migrations/20260918160000_create_portfolio_core.sql',
    import.meta.url,
  );
  const migration = await readFile(fileURLToPath(migrationUrl), 'utf8');
  await sql.unsafe(migration);
});

afterAll(async () => {
  await sql.unsafe('drop table if exists public.spaces, public.units, public.properties cascade');
  await sql.end();
});

describe('PostgresPortfolioRepository', () => {
  it('persists the first full application slice in PostgreSQL', async () => {
    const ids = new SequenceIds([
      '6a644eaa-dae0-4c4a-9ae4-6e5a93ceef3f',
      'f05296da-8e3c-45e5-8357-957745830c86',
      'f5d0ee31-0f36-41cf-8660-6de2ed95bd2b',
    ]);

    const property = await createPropertyCommand(
      { portfolioRepository: repository, idGenerator: ids },
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
      { portfolioRepository: repository, idGenerator: ids },
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
      { portfolioRepository: repository, idGenerator: ids },
      {
        unitId: unit.id,
        code: 'KITCHEN',
        name: 'Kitchen',
        spaceType: 'kitchen',
        sortOrder: 10,
      },
    );

    expect((await listPropertiesQuery(repository))[0]?.code).toBe('PROP-0001');
    expect((await listUnitsByPropertyQuery(repository, property.id))[0]?.unitNumber).toBe('4B');
    expect((await listSpacesByUnitQuery(repository, unit.id))[0]?.name).toBe('Kitchen');
  });

  it('enforces relational ownership in PostgreSQL independently of application code', async () => {
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

  it('enforces case-insensitive business uniqueness in PostgreSQL', async () => {
    await expect(
      sql`
        insert into public.properties (
          id, code, name, property_type, street, house_number,
          postal_code, city, country_code, status
        ) values (
          'a1e4962e-7023-47f4-85d2-c10071397dbf',
          'prop-0001',
          'Duplicate',
          'house',
          'Other Street',
          '1',
          '18000',
          'Niš',
          'RS',
          'active'
        )
      `,
    ).rejects.toMatchObject({ code: '23505' });
  });
});
