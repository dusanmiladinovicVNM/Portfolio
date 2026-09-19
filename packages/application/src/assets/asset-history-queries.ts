import {
  DomainError,
  type AssetConditionAssessment,
  type AssetId,
  type AssetLocationHistory,
  type TenancyAssetAssignment,
  type TenancyAssetAssignmentId,
  type TenancyId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { AssetInventoryRepository } from './asset-inventory-repository.js';
import type { AssetRepository } from './asset-repository.js';

export async function listAssetLocationHistoryQuery(
  repository: AssetRepository,
  actor: Actor,
  assetId: AssetId,
): Promise<readonly AssetLocationHistory[]> {
  requireCapability(actor, 'assets:read');
  if (!(await repository.getById(assetId))) {
    throw new DomainError('ASSET_NOT_FOUND', 'Asset not found.');
  }
  return repository.listLocationHistory(assetId);
}

export async function listAssetConditionAssessmentsQuery(
  repository: AssetInventoryRepository,
  assetRepository: AssetRepository,
  actor: Actor,
  assetId: AssetId,
): Promise<readonly AssetConditionAssessment[]> {
  requireCapability(actor, 'assets:read');
  if (!(await assetRepository.getById(assetId))) {
    throw new DomainError('ASSET_NOT_FOUND', 'Asset not found.');
  }
  return repository.listConditionAssessments(assetId);
}

export async function getTenancyAssetAssignmentQuery(
  repository: AssetInventoryRepository,
  actor: Actor,
  id: TenancyAssetAssignmentId,
): Promise<TenancyAssetAssignment> {
  requireCapability(actor, 'assets:read');
  const assignment = await repository.getTenancyAssetAssignment(id);
  if (!assignment) {
    throw new DomainError(
      'TENANCY_ASSET_ASSIGNMENT_NOT_FOUND',
      'Tenancy Asset assignment not found.',
    );
  }
  return assignment;
}

export function listTenancyAssetAssignmentsQuery(
  repository: AssetInventoryRepository,
  actor: Actor,
  tenancyId: TenancyId,
): Promise<readonly TenancyAssetAssignment[]> {
  requireCapability(actor, 'assets:read');
  return repository.listTenancyAssetAssignments(tenancyId);
}
