import type {
  Asset,
  AssetId,
  AssetIdentifierType,
  AssetReplacement,
  GloballyUniqueAssetIdentifierType,
  PropertyId,
  UnitId,
} from '@portfolio/domain';

export interface AssetRepository {
  getById(id: AssetId): Promise<Asset | null>;
  listByProperty(propertyId: PropertyId): Promise<readonly Asset[]>;
  listByUnit(unitId: UnitId): Promise<readonly Asset[]>;
  codeExists(code: string): Promise<boolean>;
  globallyUniqueIdentifierExists(
    identifierType: GloballyUniqueAssetIdentifierType,
    value: string,
  ): Promise<boolean>;

  insert(asset: Asset): Promise<void>;
  updateMetadata(asset: Asset, expectedVersion: number): Promise<void>;
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
