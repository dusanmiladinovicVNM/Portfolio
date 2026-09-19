import { DomainError, type AssetId, type WarrantyId } from '@portfolio/domain';
import type { AssetRepository } from './asset-repository.js';
import type { AssetServiceRepository } from './asset-service-repository.js';
import { requireCapability, type Actor } from '../security/access.js';

async function assertAssetExists(
  assetRepository: AssetRepository,
  assetId: AssetId,
): Promise<void> {
  if (!(await assetRepository.getById(assetId))) {
    throw new DomainError('ASSET_NOT_FOUND', 'Asset not found.');
  }
}

export async function listWarrantiesByAssetQuery(
  assetRepository: AssetRepository,
  serviceRepository: AssetServiceRepository,
  actor: Actor,
  assetId: AssetId,
) {
  requireCapability(actor, 'service:read');
  await assertAssetExists(assetRepository, assetId);
  return serviceRepository.listWarrantiesByAsset(assetId);
}

export async function listWarrantyClaimsQuery(
  serviceRepository: AssetServiceRepository,
  actor: Actor,
  warrantyId: WarrantyId,
) {
  requireCapability(actor, 'service:read');
  if (!(await serviceRepository.getWarrantyById(warrantyId))) {
    throw new DomainError('WARRANTY_NOT_FOUND', 'Warranty not found.');
  }
  return serviceRepository.listWarrantyClaimsByWarranty(warrantyId);
}

export async function listServicePlansByAssetQuery(
  assetRepository: AssetRepository,
  serviceRepository: AssetServiceRepository,
  actor: Actor,
  assetId: AssetId,
) {
  requireCapability(actor, 'service:read');
  await assertAssetExists(assetRepository, assetId);
  return serviceRepository.listServicePlansByAsset(assetId);
}

export async function listServiceEventsByAssetQuery(
  assetRepository: AssetRepository,
  serviceRepository: AssetServiceRepository,
  actor: Actor,
  assetId: AssetId,
) {
  requireCapability(actor, 'service:read');
  await assertAssetExists(assetRepository, assetId);
  return serviceRepository.listServiceEventsByAsset(assetId);
}
