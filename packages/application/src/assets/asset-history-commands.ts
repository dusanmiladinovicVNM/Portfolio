import {
  DomainError,
  asAssetConditionAssessmentId,
  asTenancyAssetAssignmentId,
  createAssetConditionAssessment,
  createTenancyAssetAssignment,
  recordTenancyAssetInventorySnapshot,
  type AssetCondition,
  type AssetId,
  type TenancyAssetAssignment,
  type TenancyAssetAssignmentId,
  type TenancyAssetPhase,
  type TenancyAssetPresence,
  type TenancyId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { TenancyRepository } from '../tenancy/tenancy-repository.js';
import type { AssetInventoryRepository } from './asset-inventory-repository.js';
import type { AssetRepository } from './asset-repository.js';

export interface AssetHistoryDependencies {
  readonly assetRepository: AssetRepository;
  readonly assetInventoryRepository: AssetInventoryRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

export async function assessAssetConditionCommand(
  deps: Pick<
    AssetHistoryDependencies,
    'assetRepository' | 'assetInventoryRepository' | 'idGenerator' | 'clock'
  >,
  actor: Actor,
  assetId: AssetId,
  input: {
    readonly condition: AssetCondition;
    readonly notes?: string | null;
  },
) {
  requireCapability(actor, 'assets:write');
  if (!(await deps.assetRepository.getById(assetId))) {
    throw new DomainError('ASSET_NOT_FOUND', 'Asset not found.');
  }

  const assessment = createAssetConditionAssessment({
    id: asAssetConditionAssessmentId(deps.idGenerator.next()),
    assetId,
    condition: input.condition,
    assessedAt: deps.clock.now(),
    assessedByUserId: actor.userId,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });

  await deps.assetInventoryRepository.insertConditionAssessment(assessment);
  return assessment;
}

export async function assignAssetToTenancyCommand(
  deps: AssetHistoryDependencies,
  actor: Actor,
  tenancyId: TenancyId,
  assetId: AssetId,
): Promise<TenancyAssetAssignment> {
  requireCapability(actor, 'assets:write');

  const [tenancy, asset] = await Promise.all([
    deps.tenancyRepository.getById(tenancyId),
    deps.assetRepository.getById(assetId),
  ]);

  if (!tenancy) {
    throw new DomainError('TENANCY_NOT_FOUND', 'Tenancy not found.');
  }
  if (!asset) {
    throw new DomainError('ASSET_NOT_FOUND', 'Asset not found.');
  }
  if (tenancy.status === 'cancelled') {
    throw new DomainError(
      'TENANCY_ASSET_TENANCY_CANCELLED',
      'A cancelled Tenancy cannot receive inventory assignments.',
    );
  }
  if (asset.unitId !== tenancy.unitId) {
    throw new DomainError(
      'TENANCY_ASSET_UNIT_MISMATCH',
      'Tenancy inventory Asset must currently belong to the Tenancy Unit.',
    );
  }
  if (asset.status === 'retired' || asset.status === 'replaced') {
    throw new DomainError(
      'TENANCY_ASSET_STATUS_INVALID',
      'A retired or replaced Asset cannot be newly assigned to Tenancy inventory.',
    );
  }

  const assignment = createTenancyAssetAssignment({
    id: asTenancyAssetAssignmentId(deps.idGenerator.next()),
    tenancyId,
    assetId,
    assignedAt: deps.clock.now(),
    assignedByUserId: actor.userId,
  });

  await deps.assetInventoryRepository.insertTenancyAssetAssignment(assignment);
  return assignment;
}

export async function recordTenancyAssetInventoryCommand(
  deps: Pick<
    AssetHistoryDependencies,
    'assetRepository' | 'assetInventoryRepository' | 'idGenerator' | 'clock'
  >,
  actor: Actor,
  assignmentId: TenancyAssetAssignmentId,
  input: {
    readonly expectedVersion: number;
    readonly phase: TenancyAssetPhase;
    readonly presence: TenancyAssetPresence;
    readonly condition?: AssetCondition | null;
    readonly notes?: string | null;
  },
): Promise<TenancyAssetAssignment> {
  requireCapability(actor, 'assets:write');

  const assignment =
    await deps.assetInventoryRepository.getTenancyAssetAssignment(assignmentId);
  if (!assignment) {
    throw new DomainError(
      'TENANCY_ASSET_ASSIGNMENT_NOT_FOUND',
      'Tenancy Asset assignment not found.',
    );
  }
  if (assignment.version !== input.expectedVersion) {
    throw new DomainError(
      'TENANCY_ASSET_VERSION_CONFLICT',
      'Tenancy Asset assignment has changed since the caller last read it.',
    );
  }

  if (!(await deps.assetRepository.getById(assignment.assetId))) {
    throw new DomainError('ASSET_NOT_FOUND', 'Assigned Asset not found.');
  }

  const recordedAt = deps.clock.now();
  const assessment =
    input.condition === undefined || input.condition === null
      ? null
      : createAssetConditionAssessment({
          id: asAssetConditionAssessmentId(deps.idGenerator.next()),
          assetId: assignment.assetId,
          condition: input.condition,
          assessedAt: recordedAt,
          assessedByUserId: actor.userId,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        });

  const updated = recordTenancyAssetInventorySnapshot(assignment, {
    phase: input.phase,
    presence: input.presence,
    conditionAssessmentId: assessment?.id ?? null,
    recordedAt,
    recordedByUserId: actor.userId,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });

  await deps.assetInventoryRepository.updateTenancyAssetInventory(
    updated,
    assignment.version,
    input.phase,
    assessment,
  );

  return updated;
}
