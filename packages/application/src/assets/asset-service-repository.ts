import type {
  AssetId,
  ServiceEvent,
  ServicePlan,
  ServicePlanId,
  Warranty,
  WarrantyClaim,
  WarrantyClaimId,
  WarrantyId,
} from '@portfolio/domain';

export interface AssetServiceRepository {
  getWarrantyById(id: WarrantyId): Promise<Warranty | null>;
  listWarrantiesByAsset(assetId: AssetId): Promise<readonly Warranty[]>;
  insertWarranty(warranty: Warranty): Promise<void>;

  getWarrantyClaimById(id: WarrantyClaimId): Promise<WarrantyClaim | null>;
  listWarrantyClaimsByWarranty(
    warrantyId: WarrantyId,
  ): Promise<readonly WarrantyClaim[]>;
  insertWarrantyClaim(claim: WarrantyClaim): Promise<void>;
  updateWarrantyClaim(
    claim: WarrantyClaim,
    expectedVersion: number,
  ): Promise<void>;

  getServicePlanById(id: ServicePlanId): Promise<ServicePlan | null>;
  listServicePlansByAsset(assetId: AssetId): Promise<readonly ServicePlan[]>;
  insertServicePlan(plan: ServicePlan): Promise<void>;
  updateServicePlan(plan: ServicePlan, expectedVersion: number): Promise<void>;

  listServiceEventsByAsset(assetId: AssetId): Promise<readonly ServiceEvent[]>;
  insertServiceEvent(event: ServiceEvent): Promise<void>;
}
