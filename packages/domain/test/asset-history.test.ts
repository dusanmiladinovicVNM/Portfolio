import { describe, expect, it } from 'vitest';
import {
  asAssetConditionAssessmentId,
  asAssetId,
  asAssetLocationHistoryId,
  asPropertyId,
  asSpaceId,
  asTenancyAssetAssignmentId,
  asTenancyId,
  asUnitId,
  asUserId,
  closeAssetLocationHistory,
  createAsset,
  createAssetConditionAssessment,
  createAssetLocationHistory,
  createTenancyAssetAssignment,
  moveAssetPlacement,
  recordTenancyAssetInventorySnapshot,
} from '../src/index.js';

const userId = asUserId('ee000000-0000-4000-8000-000000000001');
const propertyId = asPropertyId('ee000000-0000-4000-8000-000000000002');
const unitId = asUnitId('ee000000-0000-4000-8000-000000000003');
const spaceId = asSpaceId('ee000000-0000-4000-8000-000000000004');

function asset() {
  return createAsset({
    id: asAssetId('ee000000-0000-4000-8000-000000000005'),
    code: 'ASSET-HISTORY',
    name: 'Boiler',
    propertyId,
    unitId,
    spaceId,
  });
}

describe('Asset history domain', () => {
  it('moves placement without changing physical identity', () => {
    const current = asset();
    const moved = moveAssetPlacement(current, {
      propertyId,
      unitId,
      spaceId: null,
    });

    expect(moved).toMatchObject({
      id: current.id,
      code: current.code,
      propertyId,
      unitId,
      spaceId: null,
      version: 2,
    });
  });

  it('rejects a no-op move and impossible Space-without-Unit placement', () => {
    const current = asset();

    expect(() =>
      moveAssetPlacement(current, {
        propertyId,
        unitId,
        spaceId,
      }),
    ).toThrowError(/already at the requested placement/);

    expect(() =>
      moveAssetPlacement(current, {
        propertyId,
        unitId: null,
        spaceId,
      }),
    ).toThrowError(/requires a Unit placement/);
  });

  it('closes one open location interval exactly once', () => {
    const location = createAssetLocationHistory({
      id: asAssetLocationHistoryId(
        'ee000000-0000-4000-8000-000000000006',
      ),
      asset: asset(),
      validFrom: '2026-09-19T08:00:00.000Z',
      changeType: 'asset_created',
      changedByUserId: userId,
    });

    const closed = closeAssetLocationHistory(
      location,
      '2026-09-19T09:00:00.000Z',
    );
    expect(closed.validTo).toBe('2026-09-19T09:00:00.000Z');
    expect(() =>
      closeAssetLocationHistory(closed, '2026-09-19T10:00:00.000Z'),
    ).toThrowError(/already closed/);
  });

  it('creates append-only condition facts independently from current Asset state', () => {
    const assessment = createAssetConditionAssessment({
      id: asAssetConditionAssessmentId(
        'ee000000-0000-4000-8000-000000000007',
      ),
      assetId: asset().id,
      condition: 'good',
      assessedAt: '2026-09-19T09:00:00.000Z',
      assessedByUserId: userId,
      notes: 'Minor cosmetic wear',
    });

    expect(assessment).toMatchObject({
      condition: 'good',
      notes: 'Minor cosmetic wear',
    });
  });

  it('records move-in then move-out inventory truth exactly once', () => {
    const assignment = createTenancyAssetAssignment({
      id: asTenancyAssetAssignmentId(
        'ee000000-0000-4000-8000-000000000008',
      ),
      tenancyId: asTenancyId(
        'ee000000-0000-4000-8000-000000000009',
      ),
      assetId: asset().id,
      assignedAt: '2026-09-19T09:00:00.000Z',
      assignedByUserId: userId,
    });

    const moveIn = recordTenancyAssetInventorySnapshot(assignment, {
      phase: 'move_in',
      presence: 'present',
      conditionAssessmentId: asAssetConditionAssessmentId(
        'ee000000-0000-4000-8000-000000000010',
      ),
      recordedAt: '2026-09-19T10:00:00.000Z',
      recordedByUserId: userId,
    });

    const moveOut = recordTenancyAssetInventorySnapshot(moveIn, {
      phase: 'move_out',
      presence: 'missing',
      recordedAt: '2026-10-19T10:00:00.000Z',
      recordedByUserId: userId,
      notes: 'Not returned at handover',
    });

    expect(moveIn).toMatchObject({ version: 2, moveIn: { presence: 'present' } });
    expect(moveOut).toMatchObject({
      version: 3,
      moveOut: { presence: 'missing' },
    });
    expect(() =>
      recordTenancyAssetInventorySnapshot(moveOut, {
        phase: 'move_out',
        presence: 'present',
        recordedAt: '2026-10-19T11:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/already recorded/);
  });

  it('does not allow move-out before move-in', () => {
    const assignment = createTenancyAssetAssignment({
      id: asTenancyAssetAssignmentId(
        'ee000000-0000-4000-8000-000000000011',
      ),
      tenancyId: asTenancyId(
        'ee000000-0000-4000-8000-000000000012',
      ),
      assetId: asset().id,
      assignedAt: '2026-09-19T09:00:00.000Z',
      assignedByUserId: userId,
    });

    expect(() =>
      recordTenancyAssetInventorySnapshot(assignment, {
        phase: 'move_out',
        presence: 'present',
        recordedAt: '2026-09-19T10:00:00.000Z',
        recordedByUserId: userId,
      }),
    ).toThrowError(/before move-in/);
  });
});
