import { DomainError } from '../shared/domain-error.js';
import type {
  AssetConditionAssessmentId,
  AssetId,
  AssetLocationHistoryId,
  PropertyId,
  SpaceId,
  TenancyAssetAssignmentId,
  TenancyId,
  UnitId,
  UserId,
} from '../shared/entity-id.js';
import type { Asset } from './asset.js';

export const ASSET_LOCATION_CHANGE_TYPES = [
  'registry_bootstrap',
  'asset_created',
  'replacement_created',
  'moved',
] as const;

export const ASSET_CONDITIONS = [
  'excellent',
  'good',
  'fair',
  'poor',
  'damaged',
  'not_working',
] as const;

export const TENANCY_ASSET_PRESENCE = ['present', 'missing'] as const;
export const TENANCY_ASSET_PHASES = ['move_in', 'move_out'] as const;

export type AssetLocationChangeType =
  (typeof ASSET_LOCATION_CHANGE_TYPES)[number];
export type AssetCondition = (typeof ASSET_CONDITIONS)[number];
export type TenancyAssetPresence = (typeof TENANCY_ASSET_PRESENCE)[number];
export type TenancyAssetPhase = (typeof TENANCY_ASSET_PHASES)[number];

export interface AssetLocationHistory {
  readonly id: AssetLocationHistoryId;
  readonly assetId: AssetId;
  readonly propertyId: PropertyId;
  readonly unitId: UnitId | null;
  readonly spaceId: SpaceId | null;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly changeType: AssetLocationChangeType;
  readonly changedByUserId: UserId | null;
  readonly reason: string | null;
}

export interface AssetConditionAssessment {
  readonly id: AssetConditionAssessmentId;
  readonly assetId: AssetId;
  readonly condition: AssetCondition;
  readonly assessedAt: string;
  readonly assessedByUserId: UserId;
  readonly notes: string | null;
}

export interface TenancyAssetInventorySnapshot {
  readonly phase: TenancyAssetPhase;
  readonly presence: TenancyAssetPresence;
  readonly conditionAssessmentId: AssetConditionAssessmentId | null;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
  readonly notes: string | null;
}

export interface TenancyAssetAssignment {
  readonly id: TenancyAssetAssignmentId;
  readonly tenancyId: TenancyId;
  readonly assetId: AssetId;
  readonly assignedAt: string;
  readonly assignedByUserId: UserId;
  readonly version: number;
  readonly moveIn: TenancyAssetInventorySnapshot | null;
  readonly moveOut: TenancyAssetInventorySnapshot | null;
}

function instant(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'ASSET_HISTORY_INVALID_TIMESTAMP',
      `${field} must be a valid ISO timestamp.`,
    );
  }
  return value;
}

function optionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value.trim() || null;
}

function assertPlacementShape(
  unitId: UnitId | null,
  spaceId: SpaceId | null,
): void {
  if (spaceId !== null && unitId === null) {
    throw new DomainError(
      'ASSET_SPACE_REQUIRES_UNIT',
      'Asset Space placement requires a Unit placement.',
    );
  }
}

export function createAssetLocationHistory(input: {
  readonly id: AssetLocationHistoryId;
  readonly asset: Asset;
  readonly validFrom: string;
  readonly changeType: Exclude<AssetLocationChangeType, 'registry_bootstrap'>;
  readonly changedByUserId: UserId;
  readonly reason?: string | null;
}): AssetLocationHistory {
  assertPlacementShape(input.asset.unitId, input.asset.spaceId);
  return {
    id: input.id,
    assetId: input.asset.id,
    propertyId: input.asset.propertyId,
    unitId: input.asset.unitId,
    spaceId: input.asset.spaceId,
    validFrom: instant(input.validFrom, 'validFrom'),
    validTo: null,
    changeType: input.changeType,
    changedByUserId: input.changedByUserId,
    reason: optionalText(input.reason),
  };
}

export function closeAssetLocationHistory(
  current: AssetLocationHistory,
  validToValue: string,
): AssetLocationHistory {
  if (current.validTo !== null) {
    throw new DomainError(
      'ASSET_LOCATION_ALREADY_CLOSED',
      'Asset location interval is already closed.',
    );
  }
  const validTo = instant(validToValue, 'validTo');
  if (Date.parse(validTo) <= Date.parse(current.validFrom)) {
    throw new DomainError(
      'ASSET_LOCATION_INVALID_INTERVAL',
      'Asset location validTo must be later than validFrom.',
    );
  }
  return { ...current, validTo };
}

export function moveAssetPlacement(
  asset: Asset,
  target: {
    readonly propertyId: PropertyId;
    readonly unitId: UnitId | null;
    readonly spaceId: SpaceId | null;
  },
): Asset {
  assertPlacementShape(target.unitId, target.spaceId);

  if (
    asset.propertyId === target.propertyId &&
    asset.unitId === target.unitId &&
    asset.spaceId === target.spaceId
  ) {
    throw new DomainError(
      'ASSET_LOCATION_UNCHANGED',
      'Asset is already at the requested placement.',
    );
  }

  return {
    ...asset,
    propertyId: target.propertyId,
    unitId: target.unitId,
    spaceId: target.spaceId,
    version: asset.version + 1,
  };
}

export function createAssetConditionAssessment(input: {
  readonly id: AssetConditionAssessmentId;
  readonly assetId: AssetId;
  readonly condition: AssetCondition;
  readonly assessedAt: string;
  readonly assessedByUserId: UserId;
  readonly notes?: string | null;
}): AssetConditionAssessment {
  return {
    id: input.id,
    assetId: input.assetId,
    condition: input.condition,
    assessedAt: instant(input.assessedAt, 'assessedAt'),
    assessedByUserId: input.assessedByUserId,
    notes: optionalText(input.notes),
  };
}

export function createTenancyAssetAssignment(input: {
  readonly id: TenancyAssetAssignmentId;
  readonly tenancyId: TenancyId;
  readonly assetId: AssetId;
  readonly assignedAt: string;
  readonly assignedByUserId: UserId;
}): TenancyAssetAssignment {
  return {
    id: input.id,
    tenancyId: input.tenancyId,
    assetId: input.assetId,
    assignedAt: instant(input.assignedAt, 'assignedAt'),
    assignedByUserId: input.assignedByUserId,
    version: 1,
    moveIn: null,
    moveOut: null,
  };
}

export function recordTenancyAssetInventorySnapshot(
  assignment: TenancyAssetAssignment,
  input: {
    readonly phase: TenancyAssetPhase;
    readonly presence: TenancyAssetPresence;
    readonly conditionAssessmentId?: AssetConditionAssessmentId | null;
    readonly recordedAt: string;
    readonly recordedByUserId: UserId;
    readonly notes?: string | null;
  },
): TenancyAssetAssignment {
  const existing = input.phase === 'move_in' ? assignment.moveIn : assignment.moveOut;
  if (existing !== null) {
    throw new DomainError(
      'TENANCY_ASSET_PHASE_ALREADY_RECORDED',
      `${input.phase} inventory snapshot is already recorded.`,
    );
  }
  if (input.phase === 'move_out' && assignment.moveIn === null) {
    throw new DomainError(
      'TENANCY_ASSET_MOVE_IN_REQUIRED',
      'Move-out inventory cannot be recorded before move-in inventory.',
    );
  }
  if (input.presence === 'missing' && input.conditionAssessmentId != null) {
    throw new DomainError(
      'TENANCY_ASSET_MISSING_HAS_CONDITION',
      'A missing Asset cannot reference a condition assessment.',
    );
  }

  const snapshot: TenancyAssetInventorySnapshot = {
    phase: input.phase,
    presence: input.presence,
    conditionAssessmentId: input.conditionAssessmentId ?? null,
    recordedAt: instant(input.recordedAt, 'recordedAt'),
    recordedByUserId: input.recordedByUserId,
    notes: optionalText(input.notes),
  };

  if (
    assignment.moveIn !== null &&
    input.phase === 'move_out' &&
    Date.parse(snapshot.recordedAt) < Date.parse(assignment.moveIn.recordedAt)
  ) {
    throw new DomainError(
      'TENANCY_ASSET_SNAPSHOT_ORDER_INVALID',
      'Move-out inventory cannot be recorded before move-in inventory.',
    );
  }

  return {
    ...assignment,
    version: assignment.version + 1,
    ...(input.phase === 'move_in'
      ? { moveIn: snapshot }
      : { moveOut: snapshot }),
  };
}
