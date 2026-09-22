import { describe, expect, it } from 'vitest';
import type {
  AssetLocationHistoryResponse,
  AssetReplacementLinksResponse,
  AssetResponse,
  ReplaceAssetResponse,
} from '@portfolio/contracts';
import {
  assertAssetLocationHistoryOwner,
  assertAssetMetadataMutationOwner,
  assertAssetMoveMutationOwner,
  assertAssetReadOwner,
  assertAssetReplacementLinksOwner,
  assertAssetReplacementMutationOwner,
  assertAssetStatusMutationOwner,
  assertCreatedAsset,
  assertAssetDestinationSpacesOwner,
  assertAssetDestinationUnitsOwner,
  assertUnitAssetsOwner,
} from '../src/dossier/asset-owner.js';

const propertyId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const otherUnitId = '33333333-3333-4333-8333-333333333333';
const spaceId = '44444444-4444-4444-8444-444444444444';
const assetId = '55555555-5555-4555-8555-555555555555';
const successorId = '66666666-6666-4666-8666-666666666666';

function asset(overrides: Partial<AssetResponse> = {}): AssetResponse {
  return {
    id: assetId,
    code: 'AST-1',
    name: 'Washer',
    propertyId,
    unitId,
    spaceId: null,
    manufacturer: 'Bosch',
    model: 'W1',
    status: 'active',
    version: 1,
    identifiers: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        assetId,
        identifierType: 'serial_number',
        value: 'SN-1',
        label: null,
      },
    ],
    ...overrides,
  };
}

function history(
  overrides: Partial<AssetLocationHistoryResponse> = {},
): AssetLocationHistoryResponse {
  return {
    id: '88888888-8888-4888-8888-888888888888',
    assetId,
    propertyId,
    unitId,
    spaceId: null,
    validFrom: '2026-09-22T08:00:00.000Z',
    validTo: null,
    changeType: 'asset_created',
    changedByUserId: '99999999-9999-4999-8999-999999999999',
    reason: null,
    ...overrides,
  };
}

describe('Asset browser ownership guards', () => {
  it('fails closed for destination and direct Asset read ownership', () => {
    expect(() =>
      assertAssetDestinationUnitsOwner(propertyId, [
        {
          id: unitId,
          propertyId,
          code: 'UNIT-A',
          unitNumber: '1A',
          unitType: 'apartment',
          floor: null,
          areaM2: null,
          rooms: null,
          status: 'active',
          notes: '',
        },
      ]),
    ).not.toThrow();

    expect(() =>
      assertAssetDestinationUnitsOwner(propertyId, [
        {
          id: otherUnitId,
          propertyId: successorId,
          code: 'UNIT-B',
          unitNumber: '2B',
          unitType: 'apartment',
          floor: null,
          areaM2: null,
          rooms: null,
          status: 'active',
          notes: '',
        },
      ]),
    ).toThrow('another Property');

    expect(() =>
      assertAssetDestinationSpacesOwner(unitId, [
        {
          id: spaceId,
          unitId,
          code: 'BED-1',
          name: 'Bedroom',
          spaceType: 'bedroom',
          areaM2: null,
          sortOrder: 0,
          active: true,
        },
      ]),
    ).not.toThrow();

    expect(() =>
      assertAssetDestinationSpacesOwner(unitId, [
        {
          id: spaceId,
          unitId: otherUnitId,
          code: 'BED-2',
          name: 'Other bedroom',
          spaceType: 'bedroom',
          areaM2: null,
          sortOrder: 0,
          active: true,
        },
      ]),
    ).toThrow('another Unit');

    expect(() => assertAssetReadOwner(assetId, asset())).not.toThrow();
    expect(() =>
      assertAssetReadOwner(assetId, asset({ id: successorId })),
    ).toThrow('another Asset');
  });


  it('rejects Unit Asset lists containing another current Unit owner', () => {
    expect(() => assertUnitAssetsOwner(unitId, [asset()])).not.toThrow();
    expect(() =>
      assertUnitAssetsOwner(unitId, [asset({ unitId: otherUnitId })]),
    ).toThrow('another Unit');
  });

  it('binds create response to submitted identity and placement', () => {
    expect(() =>
      assertCreatedAsset(
        {
          code: 'AST-1',
          name: 'Washer',
          propertyId,
          unitId,
          spaceId: null,
          manufacturer: 'Bosch',
          model: 'W1',
          identifiers: [
            {
              identifierType: 'serial_number',
              value: 'SN-1',
              label: null,
            },
          ],
        },
        asset(),
      ),
    ).not.toThrow();

    expect(() =>
      assertCreatedAsset(
        {
          code: 'AST-1',
          name: 'Washer',
          propertyId,
          unitId,
          spaceId: null,
          manufacturer: 'Bosch',
          model: 'W1',
          identifiers: [],
        },
        asset({ unitId: otherUnitId }),
      ),
    ).toThrow('submitted Asset');
  });

  it('binds metadata, move and status writes to target + version', () => {
    const current = asset();

    expect(() =>
      assertAssetMetadataMutationOwner(
        current,
        { name: 'Washer 8 kg', manufacturer: 'Bosch', model: 'W1' },
        asset({ name: 'Washer 8 kg', version: 2 }),
      ),
    ).not.toThrow();

    expect(() =>
      assertAssetMoveMutationOwner(
        current,
        { propertyId, unitId, spaceId },
        asset({ spaceId, version: 2 }),
      ),
    ).not.toThrow();

    expect(() =>
      assertAssetStatusMutationOwner(
        current,
        'inactive',
        asset({ status: 'inactive', version: 2 }),
      ),
    ).not.toThrow();

    expect(() =>
      assertAssetStatusMutationOwner(
        current,
        'inactive',
        asset({ status: 'inactive', version: 3 }),
      ),
    ).toThrow('expected version');
  });

  it('requires location history to own the Asset and match current projection', () => {
    expect(() =>
      assertAssetLocationHistoryOwner(asset(), [history()]),
    ).not.toThrow();

    expect(() =>
      assertAssetLocationHistoryOwner(asset(), [
        history({ unitId: otherUnitId }),
      ]),
    ).toThrow('diverges');

    expect(() =>
      assertAssetLocationHistoryOwner(asset(), [
        history({ assetId: successorId }),
      ]),
    ).toThrow('another Asset');
  });

  it('binds replacement links and replacement mutation to exact lineage', () => {
    const current = asset({ spaceId });
    const result: ReplaceAssetResponse = {
      replacedAsset: {
        ...current,
        propertyId: null,
        unitId: null,
        spaceId: null,
        status: 'replaced',
        version: 2,
      },
      replacementAsset: {
        id: successorId,
        code: 'AST-2',
        name: 'Washer successor',
        propertyId,
        unitId,
        spaceId,
        manufacturer: 'Bosch',
        model: 'W2',
        status: 'active',
        version: 1,
        identifiers: [],
      },
      replacement: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        replacedAssetId: assetId,
        replacementAssetId: successorId,
        replacedByUserId: '99999999-9999-4999-8999-999999999999',
        replacedAt: '2026-09-22T09:00:00.000Z',
      },
    };

    expect(() =>
      assertAssetReplacementMutationOwner(
        current,
        {
          code: 'AST-2',
          name: 'Washer successor',
          manufacturer: 'Bosch',
          model: 'W2',
          identifiers: [],
        },
        result,
      ),
    ).not.toThrow();

    const links: AssetReplacementLinksResponse = {
      predecessor: {
        ...result.replacement,
        replacedAssetId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        replacementAssetId: assetId,
      },
      successor: null,
    };
    expect(() => assertAssetReplacementLinksOwner(assetId, links)).not.toThrow();

    expect(() =>
      assertAssetReplacementLinksOwner(assetId, {
        predecessor: {
          ...links.predecessor!,
          replacementAssetId: successorId,
        },
        successor: null,
      }),
    ).toThrow('another successor');
  });
});
