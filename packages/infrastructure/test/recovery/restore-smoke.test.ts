import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { asDocumentVersionId, asPropertyId } from '@portfolio/domain';
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
});
