import {
  DomainError,
  type Asset,
  type AssetId,
  type AssetReplacement,
  type UnitId,
} from '@portfolio/domain';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import { requireCapability, type Actor } from '../security/access.js';
import type { AssetRepository } from './asset-repository.js';

export function getAssetQuery(
  repository: AssetRepository,
  actor: Actor,
  id: AssetId,
): Promise<Asset | null> {
  requireCapability(actor, 'assets:read');
  return repository.getById(id);
}

export async function listAssetsByUnitQuery(
  assetRepository: AssetRepository,
  portfolioRepository: PortfolioRepository,
  actor: Actor,
  unitId: UnitId,
): Promise<readonly Asset[]> {
  requireCapability(actor, 'assets:read');

  if (!(await portfolioRepository.getUnitById(unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  return assetRepository.listByUnit(unitId);
}

export async function getAssetReplacementLinksQuery(
  repository: AssetRepository,
  actor: Actor,
  assetId: AssetId,
): Promise<{
  readonly predecessor: AssetReplacement | null;
  readonly successor: AssetReplacement | null;
}> {
  requireCapability(actor, 'assets:read');

  if (!(await repository.getById(assetId))) {
    throw new DomainError('ASSET_NOT_FOUND', 'Asset not found.');
  }

  const [predecessor, successor] = await Promise.all([
    repository.getReplacementByReplacementAssetId(assetId),
    repository.getReplacementByReplacedAssetId(assetId),
  ]);

  return { predecessor, successor };
}
