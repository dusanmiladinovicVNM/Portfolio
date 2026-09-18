import { describe, expect, it } from 'vitest';
import {
  asAssetId,
  asAssetIdentifierId,
  asAssetReplacementId,
  asPropertyId,
  asSpaceId,
  asUnitId,
  asUserId,
  changeAssetStatus,
  createAsset,
  createAssetReplacement,
  markAssetReplaced,
  updateAssetMetadata,
} from '../src/index.js';

function asset(overrides: Partial<Parameters<typeof createAsset>[0]> = {}) {
  return createAsset({
    id: asAssetId('c1000000-0000-4000-8000-000000000001'),
    code: 'ASSET-1',
    name: 'Heat pump',
    propertyId: asPropertyId('c1000000-0000-4000-8000-000000000020'),
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

  it('allows correctable metadata without changing physical identity or placement', () => {
    const created = asset();
    const corrected = updateAssetMetadata(created, {
      manufacturer: 'Bosch',
      model: 'HP-2',
      name: 'Corrected heat pump',
    });

    expect(corrected).toMatchObject({
      id: created.id,
      code: created.code,
      propertyId: created.propertyId,
      unitId: created.unitId,
      spaceId: created.spaceId,
      manufacturer: 'Bosch',
      model: 'HP-2',
      name: 'Corrected heat pump',
      version: 2,
    });
  });

  it('supports Property-only placement without a synthetic Unit', () => {
    const buildingAsset = asset({
      id: asAssetId('c1000000-0000-4000-8000-000000000030'),
      code: 'ASSET-BUILDING',
      unitId: null,
      spaceId: null,
      identifiers: [],
    });

    expect(buildingAsset).toMatchObject({
      propertyId: asPropertyId('c1000000-0000-4000-8000-000000000020'),
      unitId: null,
      spaceId: null,
    });
  });

  it('represents replacement as two physical identities in one Unit', () => {
    const predecessor = asset();
    const successor = asset({
      id: asAssetId('c1000000-0000-4000-8000-000000000010'),
      code: 'ASSET-2',
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
          spaceId: null,
          identifiers: [],
        }),
        replacedByUserId: asUserId('c1000000-0000-4000-8000-000000000013'),
        replacedAt: '2026-09-22T10:00:00.000Z',
      }),
    ).toThrowError(/exact current placement/);
  });
});
