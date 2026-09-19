import type {
  AssetConditionAssessment,
  AssetId,
  TenancyAssetAssignment,
  TenancyAssetAssignmentId,
  TenancyId,
  TenancyAssetPhase,
} from '@portfolio/domain';

export interface AssetInventoryRepository {
  insertConditionAssessment(
    assessment: AssetConditionAssessment,
  ): Promise<void>;
  listConditionAssessments(
    assetId: AssetId,
  ): Promise<readonly AssetConditionAssessment[]>;

  getTenancyAssetAssignment(
    id: TenancyAssetAssignmentId,
  ): Promise<TenancyAssetAssignment | null>;
  listTenancyAssetAssignments(
    tenancyId: TenancyId,
  ): Promise<readonly TenancyAssetAssignment[]>;
  insertTenancyAssetAssignment(
    assignment: TenancyAssetAssignment,
  ): Promise<void>;
  updateTenancyAssetInventory(
    assignment: TenancyAssetAssignment,
    expectedVersion: number,
    phase: TenancyAssetPhase,
    assessment: AssetConditionAssessment | null,
  ): Promise<void>;
}
