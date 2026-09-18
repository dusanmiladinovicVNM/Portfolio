import type {
  Asset,
  AssetId,
  AssetReplacement,
  UnitId,
} from '@portfolio/domain';

export interface AssetRepository {
  getById(id: AssetId): Promise<Asset | null>;
  listByUnit(unitId: UnitId): Promise<readonly Asset[]>;
  codeExists(code: string): Promise<boolean>;

  insert(asset: Asset): Promise<void>;
  updateStatus(asset: Asset, expectedVersion: number): Promise<void>;
  replaceAsset(
    current: Asset,
    replaced: Asset,
    replacement: Asset,
    relation: AssetReplacement,
  ): Promise<void>;

  getReplacementByReplacedAssetId(
    assetId: AssetId,
  ): Promise<AssetReplacement | null>;
  getReplacementByReplacementAssetId(
    assetId: AssetId,
  ): Promise<AssetReplacement | null>;
}
