import { DomainError } from '../shared/domain-error.js';
import type {
  AssetId,
  AssetIdentifierId,
  AssetReplacementId,
  SpaceId,
  UnitId,
  UserId,
} from '../shared/entity-id.js';

export const ASSET_STATUSES = [
  'active',
  'inactive',
  'retired',
  'replaced',
] as const;

export const ASSET_IDENTIFIER_TYPES = [
  'serial_number',
  'product_number',
  'inventory_tag',
  'barcode',
  'imei',
  'mac_address',
  'other',
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type AssetIdentifierType = (typeof ASSET_IDENTIFIER_TYPES)[number];
export type MutableAssetStatus = Exclude<AssetStatus, 'replaced'>;

export interface AssetIdentifier {
  readonly id: AssetIdentifierId;
  readonly assetId: AssetId;
  readonly identifierType: AssetIdentifierType;
  readonly value: string;
  readonly label: string | null;
}

export interface Asset {
  readonly id: AssetId;
  readonly code: string;
  readonly name: string;
  readonly unitId: UnitId;
  readonly spaceId: SpaceId | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly status: AssetStatus;
  readonly version: number;
  readonly identifiers: readonly AssetIdentifier[];
}

export interface AssetReplacement {
  readonly id: AssetReplacementId;
  readonly replacedAssetId: AssetId;
  readonly replacementAssetId: AssetId;
  readonly replacedByUserId: UserId;
  readonly replacedAt: string;
}

export interface CreateAssetIdentifierInput {
  readonly id: AssetIdentifierId;
  readonly identifierType: AssetIdentifierType;
  readonly value: string;
  readonly label?: string | null;
}

export interface CreateAssetInput {
  readonly id: AssetId;
  readonly code: string;
  readonly name: string;
  readonly unitId: UnitId;
  readonly spaceId?: SpaceId | null;
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly identifiers?: readonly CreateAssetIdentifierInput[];
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('ASSET_REQUIRED_FIELD', `${field} is required.`);
  }
  return normalized;
}

function optional(value: string | null | undefined, field: string): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('ASSET_INVALID_FIELD', `${field} cannot be blank.`);
  }
  return normalized;
}

function createIdentifiers(
  assetId: AssetId,
  inputs: readonly CreateAssetIdentifierInput[],
): readonly AssetIdentifier[] {
  const seen = new Set<string>();

  return inputs.map((input) => {
    const value = required(input.value, 'identifier.value');
    const key = `${input.identifierType}:${value.toLocaleLowerCase()}`;
    if (seen.has(key)) {
      throw new DomainError(
        'ASSET_IDENTIFIER_ALREADY_EXISTS',
        'The same structured identifier cannot be registered twice for one Asset.',
      );
    }
    seen.add(key);

    return {
      id: input.id,
      assetId,
      identifierType: input.identifierType,
      value,
      label: optional(input.label, 'identifier.label'),
    };
  });
}

export function createAsset(input: CreateAssetInput): Asset {
  return {
    id: input.id,
    code: required(input.code, 'code'),
    name: required(input.name, 'name'),
    unitId: input.unitId,
    spaceId: input.spaceId ?? null,
    manufacturer: optional(input.manufacturer, 'manufacturer'),
    model: optional(input.model, 'model'),
    status: 'active',
    version: 1,
    identifiers: createIdentifiers(input.id, input.identifiers ?? []),
  };
}

function increment(asset: Asset, status: AssetStatus): Asset {
  return {
    ...asset,
    status,
    version: asset.version + 1,
  };
}

export function changeAssetStatus(
  asset: Asset,
  target: MutableAssetStatus,
): Asset {
  if (target === asset.status) return asset;

  if (asset.status === 'retired' || asset.status === 'replaced') {
    throw new DomainError(
      'ASSET_TERMINAL',
      `Asset in status ${asset.status} cannot transition.`,
    );
  }

  if (target === 'active') {
    if (asset.status !== 'inactive') {
      throw new DomainError(
        'ASSET_INVALID_TRANSITION',
        `Cannot transition Asset from ${asset.status} to active.`,
      );
    }
    return increment(asset, 'active');
  }

  if (target === 'inactive') {
    if (asset.status !== 'active') {
      throw new DomainError(
        'ASSET_INVALID_TRANSITION',
        `Cannot transition Asset from ${asset.status} to inactive.`,
      );
    }
    return increment(asset, 'inactive');
  }

  if (target === 'retired') {
    if (asset.status !== 'active' && asset.status !== 'inactive') {
      throw new DomainError(
        'ASSET_INVALID_TRANSITION',
        `Cannot transition Asset from ${asset.status} to retired.`,
      );
    }
    return increment(asset, 'retired');
  }

  throw new DomainError(
    'ASSET_REPLACEMENT_REQUIRED',
    'Asset status replaced may only be established by a replacement relationship.',
  );
}

export function markAssetReplaced(asset: Asset): Asset {
  if (asset.status !== 'active' && asset.status !== 'inactive') {
    throw new DomainError(
      'ASSET_INVALID_TRANSITION',
      `Cannot replace Asset in status ${asset.status}.`,
    );
  }
  return increment(asset, 'replaced');
}

export function createAssetReplacement(input: {
  readonly id: AssetReplacementId;
  readonly replacedAsset: Asset;
  readonly replacementAsset: Asset;
  readonly replacedByUserId: UserId;
  readonly replacedAt: string;
}): AssetReplacement {
  if (input.replacedAsset.id === input.replacementAsset.id) {
    throw new DomainError(
      'ASSET_REPLACEMENT_SELF_REFERENCE',
      'An Asset cannot replace itself.',
    );
  }
  if (
    input.replacedAsset.status !== 'active' &&
    input.replacedAsset.status !== 'inactive'
  ) {
    throw new DomainError(
      'ASSET_REPLACEMENT_INVALID_PREDECESSOR',
      'Only an active or inactive Asset can be replaced.',
    );
  }
  if (input.replacedAsset.unitId !== input.replacementAsset.unitId) {
    throw new DomainError(
      'ASSET_REPLACEMENT_UNIT_MISMATCH',
      'A replacement Asset must belong to the same Unit as the Asset it replaces.',
    );
  }
  if (input.replacementAsset.status !== 'active') {
    throw new DomainError(
      'ASSET_REPLACEMENT_INVALID_SUCCESSOR',
      'A replacement Asset must start active.',
    );
  }

  return {
    id: input.id,
    replacedAssetId: input.replacedAsset.id,
    replacementAssetId: input.replacementAsset.id,
    replacedByUserId: input.replacedByUserId,
    replacedAt: input.replacedAt,
  };
}
