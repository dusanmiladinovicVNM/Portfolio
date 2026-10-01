import type {
  AssetResponse,
  MaintenanceIssueResponse,
  SpaceResponse,
} from '@portfolio/contracts';

export function maintenanceIssueSpaceScopeLabel(
  issue: MaintenanceIssueResponse,
  spaces: readonly SpaceResponse[],
): string {
  if (issue.spaceId !== null) {
    return (
      spaces.find((space) => space.id === issue.spaceId)?.code ??
      'Assigned space'
    );
  }

  if (issue.assetId !== null) {
    return 'Asset-only scope';
  }

  return issue.unitId === null ? '—' : 'Unit level';
}

export function maintenanceAssetCurrentPlacementLabel(
  issue: MaintenanceIssueResponse,
  asset: AssetResponse | null,
  spaces: readonly SpaceResponse[],
): string | null {
  if (issue.assetId === null) return null;
  if (asset === null) return 'Current placement unavailable';

  if (asset.propertyId === null) return 'No current placement';

  if (issue.unitId === null) {
    if (asset.propertyId !== issue.propertyId) {
      return 'Outside historical Property';
    }
    if (asset.unitId === null) return 'Property level';
    return asset.spaceId === null ? 'Unit placement' : 'Unit Space';
  }

  if (asset.unitId === null) return 'Property level';
  if (asset.unitId !== issue.unitId) return 'Outside this Unit';
  if (asset.spaceId === null) return 'Unit level';

  const space = spaces.find((candidate) => candidate.id === asset.spaceId);
  return space ? `${space.code} · ${space.name}` : 'Current Space';
}
