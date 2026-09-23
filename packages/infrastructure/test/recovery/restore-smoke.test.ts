import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createPropertyCommand,
  type Actor,
  type IdGenerator,
} from '@portfolio/application';
import {
  asDocumentVersionId,
  asPropertyId,
  asUserId,
} from '@portfolio/domain';
import {
  PostgresDocumentRepository,
  PostgresPortfolioRepository,
} from '../../src/index.js';

const connectionString = process.env.RECOVERY_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'RECOVERY_DATABASE_URL is required for the restore smoke test.',
  );
}

const sql = postgres(connectionString, { max: 1 });
const portfolioRepository = new PostgresPortfolioRepository(sql);
const documentRepository = new PostgresDocumentRepository(sql);

afterAll(async () => {
  await sql.end();
});

describe('restored Portfolio database', () => {
  it('is readable through canonical repositories with binary identity intact', async () => {
    const property = await portfolioRepository.getPropertyById(
      asPropertyId('11111111-1111-4111-8111-111111111111'),
    );
    expect(property).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      code: 'RECOVERY-PROP-1',
      name: 'Recovery Rehearsal Property',
      countryCode: 'CH',
      status: 'active',
    });

    const versionId = asDocumentVersionId(
      '44444444-4444-4444-8444-444444444444',
    );
    const version = await documentRepository.getVersionById(versionId);
    expect(version).toMatchObject({
      id: versionId,
      documentId: '33333333-3333-4333-8333-333333333333',
      versionNumber: 1,
      byteSize: 4096,
      sha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      status: 'final',
    });

    await expect(
      documentRepository.getStorageReference(versionId),
    ).resolves.toEqual({
      provider: 'google-drive',
      objectId: 'drive-recovery-object-1',
      objectKey:
        'document-version:44444444-4444-4444-8444-444444444444',
    });
  });

  it('can continue the canonical application write path after restore', async () => {
    const actor: Actor = {
      userId: asUserId('66666666-6666-4666-8666-666666666666'),
      role: 'admin',
    };
    const idGenerator: IdGenerator = {
      next: () => '55555555-5555-4555-8555-555555555555',
    };

    const continuedProperty = await createPropertyCommand(
      {
        portfolioRepository,
        idGenerator,
      },
      actor,
      {
        code: 'RECOVERY-CONTINUE-1',
        name: 'Post-restore continuation property',
        propertyType: 'apartment_building',
        street: 'Recoverystrasse',
        houseNumber: '2',
        postalCode: '8000',
        city: 'Zürich',
        countryCode: 'CH',
        yearBuilt: 2024,
      },
    );

    await expect(
      portfolioRepository.getPropertyById(continuedProperty.id),
    ).resolves.toEqual(continuedProperty);
  });
});
