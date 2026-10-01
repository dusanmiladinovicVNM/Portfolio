import { describe, expect, it } from 'vitest';
import type {
  AssetResponse,
  MaintenanceIssueResponse,
  SpaceResponse,
} from '@portfolio/contracts';
import {
  maintenanceAssetCurrentPlacementLabel,
  maintenanceIssueSpaceScopeLabel,
} from '../src/dossier/maintenance-scope-presentation.js';

const propertyId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const otherUnitId = '33333333-3333-4333-8333-333333333333';
const otherPropertyId = '99999999-9999-4999-8999-999999999999';
const assetId = '44444444-4444-4444-8444-444444444444';
const officeSpaceId = '55555555-5555-4555-8555-555555555555';
const technicalSpaceId = '66666666-6666-4666-8666-666666666666';

const spaces: readonly SpaceResponse[] = [
  {
    id: officeSpaceId,
    unitId,
    code: 'SP-OFFICE',
    name: 'Open Office',
    spaceType: 'other',
    areaM2: null,
    sortOrder: 1,
    active: true,
  },
  {
    id: technicalSpaceId,
    unitId,
    code: 'SP-TECH',
    name: 'Technical Room',
    spaceType: 'storage',
    areaM2: null,
    sortOrder: 2,
    active: true,
  },
];

function issue(
  overrides: Partial<MaintenanceIssueResponse> = {},
): MaintenanceIssueResponse {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    code: 'ISS-FCU-1',
    propertyId,
    unitId,
    spaceId: null,
    assetId,
    inspectionFindingId: null,
    title: 'Cooling performance reduced',
    description: null,
    priority: 'normal',
    status: 'open',
    reportedAt: '2026-10-01T08:00:00.000Z',
    resolvedAt: null,
    cancelledAt: null,
    version: 1,
    recordedAt: '2026-10-01T08:00:00.000Z',
    recordedByUserId: '88888888-8888-4888-8888-888888888888',
    ...overrides,
  };
}

function asset(
  overrides: Partial<AssetResponse> = {},
): AssetResponse {
  return {
    id: assetId,
    code: 'AST-FCU-1',
    name: 'Fan-coil unit',
    propertyId,
    unitId,
    spaceId: officeSpaceId,
    manufacturer: null,
    model: null,
    status: 'active',
    version: 1,
    identifiers: [],
    ...overrides,
  };
}

describe('Maintenance scope presentation', () => {
  it('keeps an Asset-only Issue scope separate from current Asset Space', () => {
    const currentIssue = issue();

    expect(maintenanceIssueSpaceScopeLabel(currentIssue, spaces)).toBe(
      'Asset-only scope',
    );
    expect(
      maintenanceAssetCurrentPlacementLabel(
        currentIssue,
        asset(),
        spaces,
      ),
    ).toBe('SP-OFFICE · Open Office');
  });

  it('preserves historical Issue Space while current Asset placement moves', () => {
    const historicalIssue = issue({ spaceId: officeSpaceId });

    expect(maintenanceIssueSpaceScopeLabel(historicalIssue, spaces)).toBe(
      'SP-OFFICE',
    );
    expect(
      maintenanceAssetCurrentPlacementLabel(
        historicalIssue,
        asset({ spaceId: technicalSpaceId, version: 2 }),
        spaces,
      ),
    ).toBe('SP-TECH · Technical Room');
  });

  it('does not invent current placement after replacement or cross-Unit move', () => {
    const currentIssue = issue();

    expect(
      maintenanceAssetCurrentPlacementLabel(
        currentIssue,
        asset({
          propertyId: null,
          unitId: null,
          spaceId: null,
          status: 'replaced',
          version: 2,
        }),
        spaces,
      ),
    ).toBe('No current placement');

    expect(
      maintenanceAssetCurrentPlacementLabel(
        currentIssue,
        asset({
          unitId: otherUnitId,
          spaceId: null,
          version: 2,
        }),
        spaces,
      ),
    ).toBe('Outside this Unit');
  });

  it('keeps a property-level historical Issue readable after legitimate Asset moves', () => {
    const propertyIssue = issue({
      unitId: null,
      spaceId: null,
    });

    expect(maintenanceIssueSpaceScopeLabel(propertyIssue, [])).toBe(
      'Asset-only scope',
    );
    expect(
      maintenanceAssetCurrentPlacementLabel(
        propertyIssue,
        asset({ unitId, spaceId: null, version: 2 }),
        [],
      ),
    ).toBe('Unit placement');

    expect(
      maintenanceAssetCurrentPlacementLabel(
        propertyIssue,
        asset({
          propertyId: otherPropertyId,
          unitId: otherUnitId,
          spaceId: null,
          version: 3,
        }),
        [],
      ),
    ).toBe('Outside historical Property');
  });

  it('surfaces unavailable current placement without hiding the historical Issue', () => {
    const currentIssue = issue();

    expect(
      maintenanceAssetCurrentPlacementLabel(currentIssue, null, spaces),
    ).toBe('Current placement unavailable');
  });

  it('keeps non-Asset Unit scope unchanged', () => {
    const unitIssue = issue({ assetId: null, spaceId: null });

    expect(maintenanceIssueSpaceScopeLabel(unitIssue, spaces)).toBe(
      'Unit level',
    );
    expect(
      maintenanceAssetCurrentPlacementLabel(unitIssue, null, spaces),
    ).toBeNull();
  });
});
