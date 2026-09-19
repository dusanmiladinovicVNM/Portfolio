import type {
  AssetInventoryRepository,
  AssetRepository,
} from '@portfolio/application';
import type {
  Asset,
  AssetConditionAssessment,
  AssetId,
  AssetLocationHistory,
  AssetReplacement,
  GloballyUniqueAssetIdentifierType,
  PropertyId,
  TenancyAssetAssignment,
  TenancyAssetAssignmentId,
  TenancyAssetPhase,
  TenancyId,
  UnitId,
} from '@portfolio/domain';

export class InMemoryAssetRepository implements AssetRepository {
  readonly assets = new Map<AssetId, Asset>();
  readonly replacements = new Map<AssetId, AssetReplacement>();
  readonly locations = new Map<AssetId, AssetLocationHistory[]>();

  async getById(id: AssetId): Promise<Asset | null> {
    return this.assets.get(id) ?? null;
  }
  async listByProperty(propertyId: PropertyId): Promise<readonly Asset[]> {
    return [...this.assets.values()]
      .filter((asset) => asset.propertyId === propertyId)
      .sort((a, b) => a.code.localeCompare(b.code));
  }
  async listByUnit(unitId: UnitId): Promise<readonly Asset[]> {
    return [...this.assets.values()]
      .filter((asset) => asset.unitId === unitId)
      .sort((a, b) => a.code.localeCompare(b.code));
  }
  async codeExists(code: string): Promise<boolean> {
    const normalized = code.trim().toLowerCase();
    return [...this.assets.values()].some(
      (asset) => asset.code.trim().toLowerCase() === normalized,
    );
  }
  async globallyUniqueIdentifierExists(
    identifierType: GloballyUniqueAssetIdentifierType,
    value: string,
  ): Promise<boolean> {
    const normalized = value.trim().toLowerCase();
    return [...this.assets.values()].some((asset) =>
      asset.identifiers.some(
        (identifier) =>
          identifier.identifierType === identifierType &&
          identifier.value.trim().toLowerCase() === normalized,
      ),
    );
  }
  async insert(asset: Asset, initialLocation: AssetLocationHistory): Promise<void> {
    this.assets.set(asset.id, asset);
    this.locations.set(asset.id, [initialLocation]);
  }
  async updateMetadata(asset: Asset, expectedVersion: number): Promise<void> {
    const current = this.assets.get(asset.id);
    if (!current || current.version !== expectedVersion) throw new Error('asset version conflict');
    this.assets.set(asset.id, asset);
  }
  async updateStatus(asset: Asset, expectedVersion: number): Promise<void> {
    const current = this.assets.get(asset.id);
    if (!current || current.version !== expectedVersion) throw new Error('asset version conflict');
    this.assets.set(asset.id, asset);
  }
  async getCurrentLocation(assetId: AssetId): Promise<AssetLocationHistory | null> {
    return this.locations.get(assetId)?.find((item) => item.validTo === null) ?? null;
  }
  async listLocationHistory(assetId: AssetId): Promise<readonly AssetLocationHistory[]> {
    return this.locations.get(assetId) ?? [];
  }
  async moveAsset(
    current: Asset,
    moved: Asset,
    currentLocation: AssetLocationHistory,
    nextLocation: AssetLocationHistory,
  ): Promise<void> {
    const persisted = this.assets.get(current.id);
    if (!persisted || persisted.version !== current.version) throw new Error('asset version conflict');
    const history = this.locations.get(current.id) ?? [];
    this.locations.set(
      current.id,
      history.map((item) =>
        item.id === currentLocation.id
          ? { ...item, validTo: nextLocation.validFrom }
          : item,
      ).concat(nextLocation),
    );
    this.assets.set(current.id, moved);
  }
  async replaceAsset(
    current: Asset,
    replaced: Asset,
    replacement: Asset,
    relation: AssetReplacement,
    replacementLocation: AssetLocationHistory,
  ): Promise<void> {
    const persisted = this.assets.get(current.id);
    if (!persisted || persisted.version !== current.version) throw new Error('asset version conflict');
    this.assets.set(replacement.id, replacement);
    this.locations.set(replacement.id, [replacementLocation]);
    this.replacements.set(current.id, relation);
    this.assets.set(current.id, replaced);
  }
  async getReplacementByReplacedAssetId(assetId: AssetId): Promise<AssetReplacement | null> {
    return this.replacements.get(assetId) ?? null;
  }
  async getReplacementByReplacementAssetId(assetId: AssetId): Promise<AssetReplacement | null> {
    return [...this.replacements.values()].find((r) => r.replacementAssetId === assetId) ?? null;
  }
}

export class InMemoryAssetInventoryRepository
  implements AssetInventoryRepository
{
  readonly conditions: AssetConditionAssessment[] = [];
  readonly assignments = new Map<TenancyAssetAssignmentId, TenancyAssetAssignment>();

  async insertConditionAssessment(assessment: AssetConditionAssessment): Promise<void> {
    this.conditions.push(assessment);
  }
  async listConditionAssessments(assetId: AssetId): Promise<readonly AssetConditionAssessment[]> {
    return this.conditions.filter((item) => item.assetId === assetId);
  }
  async getTenancyAssetAssignment(id: TenancyAssetAssignmentId): Promise<TenancyAssetAssignment | null> {
    return this.assignments.get(id) ?? null;
  }
  async listTenancyAssetAssignments(tenancyId: TenancyId): Promise<readonly TenancyAssetAssignment[]> {
    return [...this.assignments.values()].filter((item) => item.tenancyId === tenancyId);
  }
  async insertTenancyAssetAssignment(assignment: TenancyAssetAssignment): Promise<void> {
    this.assignments.set(assignment.id, assignment);
  }
  async updateTenancyAssetInventory(
    assignment: TenancyAssetAssignment,
    expectedVersion: number,
    _phase: TenancyAssetPhase,
    assessment: AssetConditionAssessment | null,
  ): Promise<void> {
    const current = this.assignments.get(assignment.id);
    if (!current || current.version !== expectedVersion) throw new Error('assignment version conflict');
    if (assessment) this.conditions.push(assessment);
    this.assignments.set(assignment.id, assignment);
  }
}
