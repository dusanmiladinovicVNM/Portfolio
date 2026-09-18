import {
  changeAssetStatusCommand,
  createAssetCommand,
  getAssetQuery,
  getAssetReplacementLinksQuery,
  listAssetsByPropertyQuery,
  listAssetsByUnitQuery,
  replaceAssetCommand,
  updateAssetMetadataCommand,
  type Actor,
  type AssetRepository,
  type ClockPort,
  type IdGenerator,
  type PortfolioRepository,
} from '@portfolio/application';
import {
  changeAssetStatusRequestSchema,
  createAssetRequestSchema,
  entityIdSchema,
  replaceAssetRequestSchema,
  updateAssetMetadataRequestSchema,
} from '@portfolio/contracts';
import {
  asAssetId,
  asPropertyId,
  asSpaceId,
  asUnitId,
} from '@portfolio/domain';
import { json, requestJson, validationFailure } from './http-utils.js';
import {
  toAssetReplacementResponse,
  toAssetResponse,
} from './response-mappers.js';

export interface AssetRoutesDependencies {
  readonly assetRepository: AssetRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

export async function handleAssetHttp(
  deps: AssetRoutesDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (method === 'POST' && path === '/assets') {
    const parsed = createAssetRequestSchema.safeParse(await requestJson(request));
    if (!parsed.success) return validationFailure();

    const asset = await createAssetCommand(
      deps,
      actor,
      {
        code: parsed.data.code,
        name: parsed.data.name,
        propertyId: asPropertyId(parsed.data.propertyId),
        ...(parsed.data.unitId !== undefined
          ? {
              unitId:
                parsed.data.unitId === null
                  ? null
                  : asUnitId(parsed.data.unitId),
            }
          : {}),
        ...(parsed.data.manufacturer !== undefined
          ? { manufacturer: parsed.data.manufacturer }
          : {}),
        ...(parsed.data.model !== undefined
          ? { model: parsed.data.model }
          : {}),
        ...(parsed.data.identifiers !== undefined
          ? {
              identifiers: parsed.data.identifiers.map((identifier) => ({
                identifierType: identifier.identifierType,
                value: identifier.value,
                ...(identifier.label !== undefined
                  ? { label: identifier.label }
                  : {}),
              })),
            }
          : {}),
      },
    );

    return json({ data: toAssetResponse(asset) }, 201);
  }

  const propertyAssetsMatch = /^\/properties\/([^/]+)\/assets$/.exec(path);
  if (method === 'GET' && propertyAssetsMatch) {
    const parsedId = entityIdSchema.safeParse(propertyAssetsMatch[1]);
    if (!parsedId.success) return validationFailure();

    const assets = await listAssetsByPropertyQuery(
      deps.assetRepository,
      deps.portfolioRepository,
      actor,
      asPropertyId(parsedId.data),
    );

    return json({ data: { items: assets.map(toAssetResponse) } });
  }

  const unitAssetsMatch = /^\/units\/([^/]+)\/assets$/.exec(path);
  if (method === 'GET' && unitAssetsMatch) {
    const parsedId = entityIdSchema.safeParse(unitAssetsMatch[1]);
    if (!parsedId.success) return validationFailure();

    const assets = await listAssetsByUnitQuery(
      deps.assetRepository,
      deps.portfolioRepository,
      actor,
      asUnitId(parsedId.data),
    );

    return json({ data: { items: assets.map(toAssetResponse) } });
  }

  const metadataMatch = /^\/assets\/([^/]+)\/metadata$/.exec(path);
  if (method === 'PATCH' && metadataMatch) {
    const parsedId = entityIdSchema.safeParse(metadataMatch[1]);
    const parsed = updateAssetMetadataRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const asset = await updateAssetMetadataCommand(
      deps.assetRepository,
      actor,
      asAssetId(parsedId.data),
      {
        expectedVersion: parsed.data.expectedVersion,
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.manufacturer !== undefined
          ? { manufacturer: parsed.data.manufacturer }
          : {}),
        ...(parsed.data.model !== undefined ? { model: parsed.data.model } : {}),
      },
    );

    return json({ data: toAssetResponse(asset) });
  }

  const statusMatch = /^\/assets\/([^/]+)\/status$/.exec(path);
  if (method === 'POST' && statusMatch) {
    const parsedId = entityIdSchema.safeParse(statusMatch[1]);
    const parsed = changeAssetStatusRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const asset = await changeAssetStatusCommand(
      deps.assetRepository,
      actor,
      asAssetId(parsedId.data),
      parsed.data.expectedVersion,
      parsed.data.status,
    );

    return json({ data: toAssetResponse(asset) });
  }

  const replacementMatch = /^\/assets\/([^/]+)\/replacement$/.exec(path);
  if (method === 'POST' && replacementMatch) {
    const parsedId = entityIdSchema.safeParse(replacementMatch[1]);
    const parsed = replaceAssetRequestSchema.safeParse(await requestJson(request));
    if (!parsedId.success || !parsed.success) return validationFailure();

    const result = await replaceAssetCommand(
      deps,
      actor,
      asAssetId(parsedId.data),
      {
        expectedVersion: parsed.data.expectedVersion,
        code: parsed.data.code,
        name: parsed.data.name,
        ...(parsed.data.spaceId !== undefined
          ? {
              spaceId:
                parsed.data.spaceId === null
                  ? null
                  : asSpaceId(parsed.data.spaceId),
            }
          : {}),
        ...(parsed.data.manufacturer !== undefined
          ? { manufacturer: parsed.data.manufacturer }
          : {}),
        ...(parsed.data.model !== undefined
          ? { model: parsed.data.model }
          : {}),
        ...(parsed.data.identifiers !== undefined
          ? {
              identifiers: parsed.data.identifiers.map((identifier) => ({
                identifierType: identifier.identifierType,
                value: identifier.value,
                ...(identifier.label !== undefined
                  ? { label: identifier.label }
                  : {}),
              })),
            }
          : {}),
      },
    );

    return json({
      data: {
        replacedAsset: toAssetResponse(result.replacedAsset),
        replacementAsset: toAssetResponse(result.replacementAsset),
        replacement: toAssetReplacementResponse(result.replacement),
      },
    }, 201);
  }

  const replacementLinksMatch = /^\/assets\/([^/]+)\/replacements$/.exec(path);
  if (method === 'GET' && replacementLinksMatch) {
    const parsedId = entityIdSchema.safeParse(replacementLinksMatch[1]);
    if (!parsedId.success) return validationFailure();

    const links = await getAssetReplacementLinksQuery(
      deps.assetRepository,
      actor,
      asAssetId(parsedId.data),
    );

    return json({
      data: {
        predecessor:
          links.predecessor === null
            ? null
            : toAssetReplacementResponse(links.predecessor),
        successor:
          links.successor === null
            ? null
            : toAssetReplacementResponse(links.successor),
      },
    });
  }

  const assetMatch = /^\/assets\/([^/]+)$/.exec(path);
  if (method === 'GET' && assetMatch) {
    const parsedId = entityIdSchema.safeParse(assetMatch[1]);
    if (!parsedId.success) return validationFailure();

    const asset = await getAssetQuery(
      deps.assetRepository,
      actor,
      asAssetId(parsedId.data),
    );

    if (!asset) {
      return json(
        { error: { code: 'ASSET_NOT_FOUND', message: 'Asset not found.' } },
        404,
      );
    }

    return json({ data: toAssetResponse(asset) });
  }

  return null;
}
