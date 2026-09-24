import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createPropertyCommand,
  type Actor,
  type IdGenerator,
} from '@portfolio/application';
import { asDocumentVersionId, asUserId } from '@portfolio/domain';
import {
  PostgresDocumentRepository,
  PostgresPortfolioRepository,
} from '../../src/index.js';

const connectionString = process.env.RECOVERY_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'RECOVERY_DATABASE_URL is required for production restore smoke.',
  );
}

const sql = postgres(connectionString, { max: 1 });
const portfolioRepository = new PostgresPortfolioRepository(sql);
const documentRepository = new PostgresDocumentRepository(sql);

afterAll(async () => {
  await sql.end();
});

describe('production backup restore smoke', () => {
  it('preserves canonical identity and binary storage references', async () => {
    const users = await sql<{ id: string; role: string }[]>`
      select id::text, role
      from public.app_users
      where status = 'active'
      order by created_at
      limit 1
    `;

    expect(users.length).toBe(1);

    const versions = await sql<{ id: string }[]>`
      select id::text
      from public.document_versions
      order by created_at
      limit 1
    `;

    const versionRow = versions[0];
    if (versionRow) {
      const version = await documentRepository.getVersionById(
        asDocumentVersionId(versionRow.id),
      );
      if (!version) {
        throw new Error('Restored DocumentVersion disappeared during smoke.');
      }
      expect(version.byteSize).toBeGreaterThan(0);
      await expect(
        documentRepository.getStorageReference(version.id),
      ).resolves.toMatchObject({
        provider: expect.any(String),
        objectId: expect.any(String),
        objectKey: expect.any(String),
      });
    }
  });

  it('continues the canonical application write path after restore', async () => {
    const admins = await sql<{ id: string }[]>`
      select id::text
      from public.app_users
      where status = 'active'
        and role = 'admin'
      order by created_at
      limit 1
    `;

    const admin = admins[0];
    if (!admin) {
      throw new Error('Restored production DB has no active admin.');
    }

    const actor: Actor = {
      userId: asUserId(admin.id),
      role: 'admin',
    };

    const propertyId = randomUUID();
    const idGenerator: IdGenerator = { next: () => propertyId };

    const property = await createPropertyCommand(
      { portfolioRepository, idGenerator },
      actor,
      {
        code: 'RECOVERY-' + propertyId.slice(0, 8),
        name: 'Production restore continuation smoke',
        propertyType: 'apartment_building',
        street: 'Recoverystrasse',
        houseNumber: '1',
        postalCode: '8000',
        city: 'Zürich',
        countryCode: 'CH',
        yearBuilt: 2024,
      },
    );

    await expect(
      portfolioRepository.getPropertyById(property.id),
    ).resolves.toEqual(property);
  });
});
