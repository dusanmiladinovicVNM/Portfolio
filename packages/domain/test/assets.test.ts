import { describe, expect, it } from 'vitest';
import {
  asAssetId,
  asAssetIdentifierId,
  asAssetReplacementId,
  asSpaceId,
  asUnitId,
  asUserId,
  changeAssetStatus,
  createAsset,
  createAssetReplacement,
  markAssetReplaced,
} from '../src/index.js';

function asset(overrides: Partial<Parameters<typeof createAsset>[0]> = {}) {
  return createAsset({
    id: asAssetId('c1000000-0000-4000-8000-000000000001'),
    code: 'ASSET-1',
    name: 'Heat pump',
    unitId: asUnitId('c1000000-0000-4000-8000-000000000002'),
    spaceId: asSpaceId('c1000000-0000-4000-8000-000000000003'),
    manufacturer: 'Example',
    model: 'HP-1',
    identifiers: [
      {
        id: asAssetIdentifierId('c1000000-0000-4000-8000-000000000004'),
        identifierType: 'serial_number',
        value: 'SN-1',
      },
    ],
    ...overrides,
  });
}

describe('Asset Registry domain', () => {
  it('models one stable physical identity with structured identifiers', () => {
    const created = asset();

    expect(created).toMatchObject({
      code: 'ASSET-1',
      status: 'active',
      version: 1,
      manufacturer: 'Example',
      model: 'HP-1',
    });
    expect(created.identifiers).toEqual([
      expect.objectContaining({
        assetId: created.id,
        identifierType: 'serial_number',
        value: 'SN-1',
      }),
    ]);
  });

  it('rejects duplicate structured identifiers for one Asset', () => {
    expect(() =>
      asset({
        identifiers: [
          {
            id: asAssetIdentifierId('c1000000-0000-4000-8000-000000000005'),
            identifierType: 'serial_number',
            value: 'SN-1',
          },
          {
            id: asAssetIdentifierId('c1000000-0000-4000-8000-000000000006'),
            identifierType: 'serial_number',
            value: 'sn-1',
          },
        ],
      }),
    ).toThrowError(/cannot be registered twice/);
  });

  it('keeps retired and replaced Assets terminal', () => {
    const created = asset();
    const inactive = changeAssetStatus(created, 'inactive');
    const activeAgain = changeAssetStatus(inactive, 'active');
    const retired = changeAssetStatus(activeAgain, 'retired');

    expect(retired).toMatchObject({ status: 'retired', version: 4 });
    expect(() => changeAssetStatus(retired, 'active')).toThrowError(/cannot transition/);

    const replaced = markAssetReplaced(created);
    expect(replaced).toMatchObject({ status: 'replaced', version: 2 });
    expect(() => changeAssetStatus(replaced, 'inactive')).toThrowError(/cannot transition/);
  });

  it('represents replacement as two physical identities in one Unit', () => {
    const predecessor = asset();
    const successor = asset({
      id: asAssetId('c1000000-0000-4000-8000-000000000010'),
      code: 'ASSET-2',
      spaceId: asSpaceId('c1000000-0000-4000-8000-000000000011'),
      identifiers: [],
    });

    const relation = createAssetReplacement({
      id: asAssetReplacementId('c1000000-0000-4000-8000-000000000012'),
      replacedAsset: predecessor,
      replacementAsset: successor,
      replacedByUserId: asUserId('c1000000-0000-4000-8000-000000000013'),
      replacedAt: '2026-09-22T10:00:00.000Z',
    });

    expect(relation).toMatchObject({
      replacedAssetId: predecessor.id,
      replacementAssetId: successor.id,
    });

    expect(() =>
      createAssetReplacement({
        id: asAssetReplacementId('c1000000-0000-4000-8000-000000000014'),
        replacedAsset: predecessor,
        replacementAsset: asset({
          id: asAssetId('c1000000-0000-4000-8000-000000000015'),
          code: 'ASSET-3',
          unitId: asUnitId('c1000000-0000-4000-8000-000000000016'),
          identifiers: [],
        }),
        replacedByUserId: asUserId('c1000000-0000-4000-8000-000000000013'),
        replacedAt: '2026-09-22T10:00:00.000Z',
      }),
    ).toThrowError(/same Unit/);
  });
});
