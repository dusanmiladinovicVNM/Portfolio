import {
  DomainError,
  GLOBALLY_UNIQUE_ASSET_IDENTIFIER_TYPES,
  asAssetId,
  asAssetIdentifierId,
  asAssetReplacementId,
  changeAssetStatus,
  createAsset,
  createAssetReplacement,
  markAssetReplaced,
  updateAssetMetadata,
  type Asset,
  type AssetId,
  type AssetIdentifierType,
  type AssetReplacement,
  type GloballyUniqueAssetIdentifierType,
  type MutableAssetStatus,
  type PropertyId,
  type SpaceId,
  type UnitId,
} from '@portfolio/domain';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import { requireCapability, type Actor } from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { AssetRepository } from './asset-repository.js';

export interface AssetIdentifierCommandInput {
  readonly identifierType: AssetIdentifierType;
  readonly value: string;
  readonly label?: string | null;
}

export interface CreateAssetCommandInput {
  readonly code: string;
  readonly name: string;
  readonly propertyId: PropertyId;
  readonly unitId?: UnitId | null;
  readonly spaceId?: SpaceId | null;
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly identifiers?: readonly AssetIdentifierCommandInput[];
}

export interface UpdateAssetMetadataCommandInput {
  readonly expectedVersion: number;
  readonly name?: string;
  readonly manufacturer?: string | null;
  readonly model?: string | null;
}

export interface ReplaceAssetCommandInput {
  readonly expectedVersion: number;
  readonly code: string;
  readonly name: string;
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly identifiers?: readonly AssetIdentifierCommandInput[];
}

export interface AssetDependencies {
  readonly assetRepository: AssetRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly idGenerator: IdGenerator;
}

async function requireAsset(
  repository: AssetRepository,
  id: AssetId,
): Promise<Asset> {
  const asset = await repository.getById(id);
  if (!asset) throw new DomainError('ASSET_NOT_FOUND', 'Asset not found.');
  return asset;
}

function assertExpectedVersion(asset: Asset, expectedVersion: number): void {
  if (asset.version !== expectedVersion) {
    throw new DomainError(
      'ASSET_VERSION_CONFLICT',
      'Asset has changed since the caller last read it.',
    );
  }
}

async function assertPlacement(
  repository: PortfolioRepository,
  propertyId: PropertyId,
  unitId: UnitId | null | undefined,
  spaceId: SpaceId | null | undefined,
): Promise<void> {
  if (!(await repository.getPropertyById(propertyId))) {
    throw new DomainError('PROPERTY_NOT_FOUND', 'Property not found.');
  }

  if (unitId === undefined || unitId === null) {
    if (spaceId !== undefined && spaceId !== null) {
      throw new DomainError(
        'ASSET_SPACE_REQUIRES_UNIT',
        'Asset Space placement requires a Unit placement.',
      );
    }
    return;
  }

  const unit = await repository.getUnitById(unitId);
  if (!unit) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }
  if (unit.propertyId !== propertyId) {
    throw new DomainError(
      'ASSET_UNIT_PROPERTY_MISMATCH',
      'Asset Unit must belong to the Asset Property.',
    );
  }

  if (spaceId === undefined || spaceId === null) return;

  const space = await repository.getSpaceById(spaceId);
  if (!space) {
    throw new DomainError('SPACE_NOT_FOUND', 'Space not found.');
  }
  if (space.unitId !== unitId) {
    throw new DomainError(
      'ASSET_SPACE_UNIT_MISMATCH',
      'Asset Space must belong to the Asset Unit.',
    );
  }
}

function identifierInputs(
  idGenerator: IdGenerator,
  values: readonly AssetIdentifierCommandInput[],
) {
  return values.map((identifier) => ({
    id: asAssetIdentifierId(idGenerator.next()),
    identifierType: identifier.identifierType,
    value: identifier.value,
    ...(identifier.label !== undefined ? { label: identifier.label } : {}),
  }));
}

function isGloballyUniqueIdentifierType(
  value: AssetIdentifierType,
): value is GloballyUniqueAssetIdentifierType {
  return (GLOBALLY_UNIQUE_ASSET_IDENTIFIER_TYPES as readonly string[]).includes(
    value,
  );
}

async function assertGlobalIdentifiersAvailable(
  repository: AssetRepository,
  identifiers: readonly AssetIdentifierCommandInput[],
): Promise<void> {
  for (const identifier of identifiers) {
    if (!isGloballyUniqueIdentifierType(identifier.identifierType)) continue;
    if (
      await repository.globallyUniqueIdentifierExists(
        identifier.identifierType,
        identifier.value.trim(),
      )
    ) {
      throw new DomainError(
        'ASSET_IDENTIFIER_GLOBAL_CONFLICT',
        `${identifier.identifierType} '${identifier.value.trim()}' is already assigned to another Asset.`,
      );
    }
  }
}

export async function createAssetCommand(
  deps: AssetDependencies,
  actor: Actor,
  input: CreateAssetCommandInput,
): Promise<Asset> {
  requireCapability(actor, 'assets:write');
  await assertPlacement(
    deps.portfolioRepository,
    input.propertyId,
    input.unitId,
    input.spaceId,
  );
  await assertGlobalIdentifiersAvailable(
    deps.assetRepository,
    input.identifiers ?? [],
  );

  const asset = createAsset({
    id: asAssetId(deps.idGenerator.next()),
    code: input.code,
    name: input.name,
    propertyId: input.propertyId,
    ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
    ...(input.spaceId !== undefined ? { spaceId: input.spaceId } : {}),
    ...(input.manufacturer !== undefined
      ? { manufacturer: input.manufacturer }
      : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    identifiers: identifierInputs(
      deps.idGenerator,
      input.identifiers ?? [],
    ),
  });

  if (await deps.assetRepository.codeExists(asset.code)) {
    throw new DomainError(
      'ASSET_CODE_ALREADY_EXISTS',
      `Asset code '${asset.code}' already exists.`,
    );
  }

  await deps.assetRepository.insert(asset);
  return asset;
}

export async function updateAssetMetadataCommand(
  repository: AssetRepository,
  actor: Actor,
  assetId: AssetId,
  input: UpdateAssetMetadataCommandInput,
): Promise<Asset> {
  requireCapability(actor, 'assets:write');
  const current = await requireAsset(repository, assetId);
  assertExpectedVersion(current, input.expectedVersion);

  const updated = updateAssetMetadata(current, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.manufacturer !== undefined
      ? { manufacturer: input.manufacturer }
      : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
  });
  if (updated === current) return current;

  await repository.updateMetadata(updated, current.version);
  return updated;
}

export async function changeAssetStatusCommand(
  repository: AssetRepository,
  actor: Actor,
  assetId: AssetId,
  expectedVersion: number,
  status: MutableAssetStatus,
): Promise<Asset> {
  requireCapability(actor, 'assets:write');
  const current = await requireAsset(repository, assetId);
  assertExpectedVersion(current, expectedVersion);

  const updated = changeAssetStatus(current, status);
  if (updated === current) return current;

  await repository.updateStatus(updated, current.version);
  return updated;
}

export async function replaceAssetCommand(
  deps: AssetDependencies & { readonly clock: ClockPort },
  actor: Actor,
  assetId: AssetId,
  input: ReplaceAssetCommandInput,
): Promise<{
  readonly replacedAsset: Asset;
  readonly replacementAsset: Asset;
  readonly replacement: AssetReplacement;
}> {
  requireCapability(actor, 'assets:write');

  const current = await requireAsset(deps.assetRepository, assetId);
  assertExpectedVersion(current, input.expectedVersion);
  await assertGlobalIdentifiersAvailable(
    deps.assetRepository,
    input.identifiers ?? [],
  );

  const replacementAsset = createAsset({
    id: asAssetId(deps.idGenerator.next()),
    code: input.code,
    name: input.name,
    propertyId: current.propertyId,
    unitId: current.unitId,
    spaceId: current.spaceId,
    ...(input.manufacturer !== undefined
      ? { manufacturer: input.manufacturer }
      : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    identifiers: identifierInputs(
      deps.idGenerator,
      input.identifiers ?? [],
    ),
  });

  if (await deps.assetRepository.codeExists(replacementAsset.code)) {
    throw new DomainError(
      'ASSET_CODE_ALREADY_EXISTS',
      `Asset code '${replacementAsset.code}' already exists.`,
    );
  }

  const replacedAsset = markAssetReplaced(current);
  const replacement = createAssetReplacement({
    id: asAssetReplacementId(deps.idGenerator.next()),
    replacedAsset: current,
    replacementAsset,
    replacedByUserId: actor.userId,
    replacedAt: deps.clock.now(),
  });

  await deps.assetRepository.replaceAsset(
    current,
    replacedAsset,
    replacementAsset,
    replacement,
  );

  return { replacedAsset, replacementAsset, replacement };
}
