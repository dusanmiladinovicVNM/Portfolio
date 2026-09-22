import type {
  AssetLocationHistoryResponse,
  AssetReplacementLinksResponse,
  AssetResponse,
  ReplaceAssetResponse,
} from '@portfolio/contracts';

function sameIdentifiers(
  left: AssetResponse['identifiers'],
  right: AssetResponse['identifiers'],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      item.id === other.id &&
      item.assetId === other.assetId &&
      item.identifierType === other.identifierType &&
      item.value === other.value &&
      item.label === other.label
    );
  });
}

function sameNonPlacementIdentity(
  current: AssetResponse,
  response: AssetResponse,
): boolean {
  return (
    response.id === current.id &&
    response.code === current.code &&
    response.name === current.name &&
    response.manufacturer === current.manufacturer &&
    response.model === current.model &&
    response.status === current.status &&
    sameIdentifiers(current.identifiers, response.identifiers)
  );
}

export function assertUnitAssetsOwner(
  unitId: string,
  assets: readonly AssetResponse[],
): void {
  if (assets.some((asset) => asset.unitId !== unitId)) {
    throw new Error('Unit Asset list contains an Asset owned by another Unit location.');
  }
}

export function assertCreatedAsset(
  expected: {
    readonly code: string;
    readonly name: string;
    readonly propertyId: string;
    readonly unitId: string;
    readonly spaceId: string | null;
    readonly manufacturer: string | null;
    readonly model: string | null;
    readonly identifiers: readonly {
      readonly identifierType: string;
      readonly value: string;
      readonly label: string | null;
    }[];
  },
  asset: AssetResponse,
): void {
  if (
    asset.code !== expected.code ||
    asset.name !== expected.name ||
    asset.propertyId !== expected.propertyId ||
    asset.unitId !== expected.unitId ||
    asset.spaceId !== expected.spaceId ||
    asset.manufacturer !== expected.manufacturer ||
    asset.model !== expected.model ||
    asset.status !== 'active' ||
    asset.version !== 1
  ) {
    throw new Error('Created Asset response does not match the submitted Asset.');
  }

  if (asset.identifiers.length !== expected.identifiers.length) {
    throw new Error('Created Asset response does not match submitted identifiers.');
  }
  for (const expectedIdentifier of expected.identifiers) {
    const match = asset.identifiers.find(
      (identifier) =>
        identifier.identifierType === expectedIdentifier.identifierType &&
        identifier.value === expectedIdentifier.value &&
        identifier.label === expectedIdentifier.label,
    );
    if (!match || match.assetId !== asset.id) {
      throw new Error('Created Asset response does not match submitted identifiers.');
    }
  }
}

export function assertAssetMetadataMutationOwner(
  current: AssetResponse,
  expected: {
    readonly name: string;
    readonly manufacturer: string | null;
    readonly model: string | null;
  },
  response: AssetResponse,
): void {
  if (
    response.id !== current.id ||
    response.code !== current.code ||
    response.propertyId !== current.propertyId ||
    response.unitId !== current.unitId ||
    response.spaceId !== current.spaceId ||
    response.status !== current.status ||
    !sameIdentifiers(current.identifiers, response.identifiers)
  ) {
    throw new Error('Asset metadata response changed another canonical Asset fact.');
  }
  if (
    response.name !== expected.name ||
    response.manufacturer !== expected.manufacturer ||
    response.model !== expected.model
  ) {
    throw new Error('Asset metadata response does not match the submitted correction.');
  }
  if (response.version !== current.version + 1) {
    throw new Error('Asset metadata response does not match the expected version step.');
  }
}

export function assertAssetMoveMutationOwner(
  current: AssetResponse,
  target: {
    readonly propertyId: string;
    readonly unitId: string;
    readonly spaceId: string | null;
  },
  response: AssetResponse,
): void {
  if (!sameNonPlacementIdentity(current, response)) {
    throw new Error('Asset move response changed non-placement Asset facts.');
  }
  if (
    response.propertyId !== target.propertyId ||
    response.unitId !== target.unitId ||
    response.spaceId !== target.spaceId
  ) {
    throw new Error('Asset move response does not match the requested placement.');
  }
  if (response.version !== current.version + 1) {
    throw new Error('Asset move response does not match the expected version step.');
  }
}

export function assertAssetStatusMutationOwner(
  current: AssetResponse,
  status: 'active' | 'inactive' | 'retired',
  response: AssetResponse,
): void {
  if (
    response.id !== current.id ||
    response.code !== current.code ||
    response.name !== current.name ||
    response.propertyId !== current.propertyId ||
    response.unitId !== current.unitId ||
    response.spaceId !== current.spaceId ||
    response.manufacturer !== current.manufacturer ||
    response.model !== current.model ||
    !sameIdentifiers(current.identifiers, response.identifiers)
  ) {
    throw new Error('Asset status response changed another canonical Asset fact.');
  }
  if (response.status !== status) {
    throw new Error('Asset status response does not match the requested lifecycle state.');
  }
  if (response.version !== current.version + 1) {
    throw new Error('Asset status response does not match the expected version step.');
  }
}

export function assertAssetLocationHistoryOwner(
  asset: AssetResponse,
  history: readonly AssetLocationHistoryResponse[],
): void {
  if (history.some((item) => item.assetId !== asset.id)) {
    throw new Error('Asset location history contains an interval owned by another Asset.');
  }
  const open = history.filter((item) => item.validTo === null);
  if (asset.propertyId === null) {
    if (open.length !== 0) {
      throw new Error('Unlocated Asset unexpectedly has an open location interval.');
    }
    return;
  }
  if (open.length !== 1) {
    throw new Error('Located Asset must have exactly one open location interval.');
  }
  const current = open[0]!;
  if (
    current.propertyId !== asset.propertyId ||
    current.unitId !== asset.unitId ||
    current.spaceId !== asset.spaceId
  ) {
    throw new Error('Asset current projection diverges from location history.');
  }
}

export function assertAssetReplacementLinksOwner(
  assetId: string,
  links: AssetReplacementLinksResponse,
): void {
  if (links.predecessor && links.predecessor.replacementAssetId !== assetId) {
    throw new Error('Asset predecessor link belongs to another successor Asset.');
  }
  if (links.successor && links.successor.replacedAssetId !== assetId) {
    throw new Error('Asset successor link belongs to another predecessor Asset.');
  }
}

export function assertAssetReplacementMutationOwner(
  current: AssetResponse,
  expected: {
    readonly code: string;
    readonly name: string;
    readonly manufacturer: string | null;
    readonly model: string | null;
    readonly identifiers: readonly {
      readonly identifierType: string;
      readonly value: string;
      readonly label: string | null;
    }[];
  },
  result: ReplaceAssetResponse,
): void {
  const predecessor = result.replacedAsset;
  const successor = result.replacementAsset;

  if (
    predecessor.id !== current.id ||
    predecessor.code !== current.code ||
    predecessor.name !== current.name ||
    predecessor.manufacturer !== current.manufacturer ||
    predecessor.model !== current.model ||
    predecessor.status !== 'replaced' ||
    predecessor.version !== current.version + 1 ||
    predecessor.propertyId !== null ||
    predecessor.unitId !== null ||
    predecessor.spaceId !== null ||
    !sameIdentifiers(current.identifiers, predecessor.identifiers)
  ) {
    throw new Error('Asset replacement response does not contain the exact replaced predecessor.');
  }

  if (
    successor.id === current.id ||
    successor.code !== expected.code ||
    successor.name !== expected.name ||
    successor.manufacturer !== expected.manufacturer ||
    successor.model !== expected.model ||
    successor.propertyId !== current.propertyId ||
    successor.unitId !== current.unitId ||
    successor.spaceId !== current.spaceId ||
    successor.status !== 'active' ||
    successor.version !== 1
  ) {
    throw new Error('Asset replacement response does not contain the expected successor.');
  }

  if (successor.identifiers.length !== expected.identifiers.length) {
    throw new Error('Replacement Asset identifiers do not match the submitted successor.');
  }
  for (const expectedIdentifier of expected.identifiers) {
    const match = successor.identifiers.find(
      (identifier) =>
        identifier.identifierType === expectedIdentifier.identifierType &&
        identifier.value === expectedIdentifier.value &&
        identifier.label === expectedIdentifier.label,
    );
    if (!match || match.assetId !== successor.id) {
      throw new Error('Replacement Asset identifiers do not match the submitted successor.');
    }
  }

  if (
    result.replacement.replacedAssetId !== current.id ||
    result.replacement.replacementAssetId !== successor.id
  ) {
    throw new Error('Asset replacement relation does not bind predecessor and successor.');
  }
}
