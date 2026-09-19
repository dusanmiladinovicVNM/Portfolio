import {
  DomainError,
  GLOBALLY_UNIQUE_ASSET_IDENTIFIER_TYPES,
  asAssetId,
  asAssetIdentifierId,
  asAssetLocationHistoryId,
  asAssetReplacementId,
  changeAssetStatus,
  createAsset,
  createAssetLocationHistory,
  createAssetReplacement,
  markAssetReplaced,
  moveAssetPlacement,
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

export interface MoveAssetCommandInput {
  readonly expectedVersion: number;
  readonly propertyId: PropertyId;
  readonly unitId?: UnitId | null;
  readonly spaceId?: SpaceId | null;
  readonly reason?: string | null;
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
  readonly clock: ClockPort;
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

async function requireCurrentLocation(
  repository: AssetRepository,
  asset: Asset,
) {
  const currentLocation = await repository.getCurrentLocation(asset.id);
  if (!currentLocation) {
    throw new DomainError(
      'ASSET_CURRENT_LOCATION_MISSING',
      'Asset has no open authoritative location interval.',
    );
  }
  if (
    asset.propertyId === null ||
    currentLocation.propertyId !== asset.propertyId ||
    currentLocation.unitId !== asset.unitId ||
    currentLocation.spaceId !== asset.spaceId
  ) {
    throw new DomainError(
      'ASSET_LOCATION_PROJECTION_DIVERGED',
      'Asset current placement does not match its authoritative open location interval.',
    );
  }
  return currentLocation;
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
    identifiers: identifierInputs(deps.idGenerator, input.identifiers ?? []),
  });

  if (await deps.assetRepository.codeExists(asset.code)) {
    throw new DomainError(
      'ASSET_CODE_ALREADY_EXISTS',
      `Asset code '${asset.code}' already exists.`,
    );
  }

  const initialLocation = createAssetLocationHistory({
    id: asAssetLocationHistoryId(deps.idGenerator.next()),
    asset,
    validFrom: deps.clock.now(),
    changeType: 'asset_created',
    changedByUserId: actor.userId,
  });

  await deps.assetRepository.insert(asset, initialLocation);
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

export async function moveAssetCommand(
  deps: AssetDependencies,
  actor: Actor,
  assetId: AssetId,
  input: MoveAssetCommandInput,
): Promise<Asset> {
  requireCapability(actor, 'assets:write');
  const current = await requireAsset(deps.assetRepository, assetId);
  assertExpectedVersion(current, input.expectedVersion);

  const targetUnitId = input.unitId ?? null;
  const targetSpaceId = input.spaceId ?? null;
  await assertPlacement(
    deps.portfolioRepository,
    input.propertyId,
    targetUnitId,
    targetSpaceId,
  );

  const currentLocation = await requireCurrentLocation(
    deps.assetRepository,
    current,
  );

  const moved = moveAssetPlacement(current, {
    propertyId: input.propertyId,
    unitId: targetUnitId,
    spaceId: targetSpaceId,
  });

  const movedAt = deps.clock.now();
  if (Date.parse(movedAt) <= Date.parse(currentLocation.validFrom)) {
    throw new DomainError(
      'ASSET_LOCATION_INVALID_INTERVAL',
      'A move must occur after the current location interval began.',
    );
  }

  const nextLocation = createAssetLocationHistory({
    id: asAssetLocationHistoryId(deps.idGenerator.next()),
    asset: moved,
    validFrom: movedAt,
    changeType: 'moved',
    changedByUserId: actor.userId,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
  });

  await deps.assetRepository.moveAsset(
    current,
    moved,
    currentLocation,
    nextLocation,
  );
  return moved;
}

export async function replaceAssetCommand(
  deps: AssetDependencies,
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

  const currentLocation = await requireCurrentLocation(
    deps.assetRepository,
    current,
  );

  const replacementAsset = createAsset({
    id: asAssetId(deps.idGenerator.next()),
    code: input.code,
    name: input.name,
    propertyId: currentLocation.propertyId,
    unitId: currentLocation.unitId,
    spaceId: currentLocation.spaceId,
    ...(input.manufacturer !== undefined
      ? { manufacturer: input.manufacturer }
      : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    identifiers: identifierInputs(deps.idGenerator, input.identifiers ?? []),
  });

  if (await deps.assetRepository.codeExists(replacementAsset.code)) {
    throw new DomainError(
      'ASSET_CODE_ALREADY_EXISTS',
      `Asset code '${replacementAsset.code}' already exists.`,
    );
  }

  const replacedAt = deps.clock.now();
  if (Date.parse(replacedAt) <= Date.parse(currentLocation.validFrom)) {
    throw new DomainError(
      'ASSET_LOCATION_INVALID_INTERVAL',
      'Replacement must occur after the predecessor location interval began.',
    );
  }
  const replacedAsset = markAssetReplaced(current);
  const replacement = createAssetReplacement({
    id: asAssetReplacementId(deps.idGenerator.next()),
    replacedAsset: current,
    replacementAsset,
    replacedByUserId: actor.userId,
    replacedAt,
  });
  const replacementLocation = createAssetLocationHistory({
    id: asAssetLocationHistoryId(deps.idGenerator.next()),
    asset: replacementAsset,
    validFrom: replacedAt,
    changeType: 'replacement_created',
    changedByUserId: actor.userId,
    reason: `Replacement for ${current.code}`,
  });

  await deps.assetRepository.replaceAsset(
    current,
    replacedAsset,
    replacementAsset,
    replacement,
    currentLocation,
    replacementLocation,
  );

  return { replacedAsset, replacementAsset, replacement };
}
