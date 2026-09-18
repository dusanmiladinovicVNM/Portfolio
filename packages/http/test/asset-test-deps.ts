import type { AssetRepository } from '@portfolio/application';
import type {
  Asset,
  AssetId,
  AssetReplacement,
  UnitId,
} from '@portfolio/domain';

export class InMemoryAssetRepository implements AssetRepository {
  readonly assets = new Map<AssetId, Asset>();
  readonly replacements = new Map<AssetId, AssetReplacement>();

  async getById(id: AssetId): Promise<Asset | null> {
    return this.assets.get(id) ?? null;
  }

  async listByUnit(unitId: UnitId): Promise<readonly Asset[]> {
    return [...this.assets.values()]
      .filter((asset) => asset.unitId === unitId)
      .sort((left, right) => left.code.localeCompare(right.code));
  }

  async codeExists(code: string): Promise<boolean> {
    const normalized = code.toLocaleLowerCase();
    return [...this.assets.values()].some(
      (asset) => asset.code.toLocaleLowerCase() === normalized,
    );
  }

  async insert(asset: Asset): Promise<void> {
    if (await this.codeExists(asset.code)) {
      throw new Error('duplicate asset code');
    }
    this.assets.set(asset.id, asset);
  }

  async updateStatus(asset: Asset, expectedVersion: number): Promise<void> {
    const current = this.assets.get(asset.id);
    if (!current || current.version !== expectedVersion) {
      throw new Error('asset version conflict');
    }
    this.assets.set(asset.id, asset);
  }

  async replaceAsset(
    current: Asset,
    replaced: Asset,
    replacement: Asset,
    relation: AssetReplacement,
  ): Promise<void> {
    const persisted = this.assets.get(current.id);
    if (!persisted || persisted.version !== current.version) {
      throw new Error('asset version conflict');
    }
    this.assets.set(replacement.id, replacement);
    this.replacements.set(current.id, relation);
    this.assets.set(current.id, replaced);
  }

  async getReplacementByReplacedAssetId(
    assetId: AssetId,
  ): Promise<AssetReplacement | null> {
    return this.replacements.get(assetId) ?? null;
  }

  async getReplacementByReplacementAssetId(
    assetId: AssetId,
  ): Promise<AssetReplacement | null> {
    return [...this.replacements.values()].find(
      (replacement) => replacement.replacementAssetId === assetId,
    ) ?? null;
  }
}
