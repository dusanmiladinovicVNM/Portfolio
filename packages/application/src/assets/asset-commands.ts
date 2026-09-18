import {
  DomainError,
  asAssetId,
  asAssetIdentifierId,
  asAssetReplacementId,
  changeAssetStatus,
  createAsset,
  createAssetReplacement,
  markAssetReplaced,
  type Asset,
  type AssetId,
  type AssetIdentifierType,
  type AssetReplacement,
  type MutableAssetStatus,
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
  readonly unitId: UnitId;
  readonly spaceId?: SpaceId | null;
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly identifiers?: readonly AssetIdentifierCommandInput[];
}

export interface ReplaceAssetCommandInput {
  readonly expectedVersion: number;
  readonly code: string;
  readonly name: string;
  readonly spaceId?: SpaceId | null;
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
  unitId: UnitId,
  spaceId: SpaceId | null | undefined,
): Promise<void> {
  if (!(await repository.getUnitById(unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  if (spaceId === undefined || spaceId === null) return;

  const space = await repository.getSpaceById(spaceId);
  if (!space) {
    throw new DomainError('SPACE_NOT_FOUND', 'Space not found.');
  }
  if (space.unitId !== unitId) {
    throw new DomainError(
      'ASSET_SPACE_UNIT_MISMATCH',
      'Asset Space must belong to the same Unit as the Asset.',
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

export async function createAssetCommand(
  deps: AssetDependencies,
  actor: Actor,
  input: CreateAssetCommandInput,
): Promise<Asset> {
  requireCapability(actor, 'assets:write');
  await assertPlacement(
    deps.portfolioRepository,
    input.unitId,
    input.spaceId,
  );

  const asset = createAsset({
    id: asAssetId(deps.idGenerator.next()),
    code: input.code,
    name: input.name,
    unitId: input.unitId,
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

  await assertPlacement(
    deps.portfolioRepository,
    current.unitId,
    input.spaceId,
  );

  const replacementAsset = createAsset({
    id: asAssetId(deps.idGenerator.next()),
    code: input.code,
    name: input.name,
    unitId: current.unitId,
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
