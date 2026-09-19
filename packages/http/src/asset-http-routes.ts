import {
  assessAssetConditionCommand,
  assignAssetToTenancyCommand,
  changeAssetStatusCommand,
  createAssetCommand,
  getAssetQuery,
  getAssetReplacementLinksQuery,
  getTenancyAssetAssignmentQuery,
  listAssetConditionAssessmentsQuery,
  listAssetLocationHistoryQuery,
  listAssetsByPropertyQuery,
  listAssetsByUnitQuery,
  listTenancyAssetAssignmentsQuery,
  moveAssetCommand,
  recordTenancyAssetInventoryCommand,
  replaceAssetCommand,
  updateAssetMetadataCommand,
  type Actor,
  type AssetInventoryRepository,
  type AssetRepository,
  type ClockPort,
  type IdGenerator,
  type PortfolioRepository,
  type TenancyRepository,
} from '@portfolio/application';
import {
  assessAssetConditionRequestSchema,
  assignTenancyAssetRequestSchema,
  changeAssetStatusRequestSchema,
  createAssetRequestSchema,
  entityIdSchema,
  moveAssetRequestSchema,
  recordTenancyAssetInventoryRequestSchema,
  replaceAssetRequestSchema,
  updateAssetMetadataRequestSchema,
} from '@portfolio/contracts';
import {
  asAssetId,
  asPropertyId,
  asSpaceId,
  asTenancyAssetAssignmentId,
  asTenancyId,
  asUnitId,
} from '@portfolio/domain';
import { json, requestJson, validationFailure } from './http-utils.js';
import {
  toAssetConditionAssessmentResponse,
  toAssetLocationHistoryResponse,
  toAssetReplacementResponse,
  toAssetResponse,
  toTenancyAssetAssignmentResponse,
} from './response-mappers.js';

export interface AssetRoutesDependencies {
  readonly assetRepository: AssetRepository;
  readonly assetInventoryRepository: AssetInventoryRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly tenancyRepository: TenancyRepository;
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

    const asset = await createAssetCommand(deps, actor, {
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
      ...(parsed.data.model !== undefined ? { model: parsed.data.model } : {}),
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
    });

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

  const tenancyAssetsMatch = /^\/tenancies\/([^/]+)\/assets$/.exec(path);
  if (tenancyAssetsMatch) {
    const parsedId = entityIdSchema.safeParse(tenancyAssetsMatch[1]);
    if (!parsedId.success) return validationFailure();
    const tenancyId = asTenancyId(parsedId.data);

    if (method === 'POST') {
      const parsed = assignTenancyAssetRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();

      const assignment = await assignAssetToTenancyCommand(
        deps,
        actor,
        tenancyId,
        asAssetId(parsed.data.assetId),
      );
      return json({ data: toTenancyAssetAssignmentResponse(assignment) }, 201);
    }

    if (method === 'GET') {
      const assignments = await listTenancyAssetAssignmentsQuery(
        deps.assetInventoryRepository,
        deps.tenancyRepository,
        actor,
        tenancyId,
      );
      return json({
        data: { items: assignments.map(toTenancyAssetAssignmentResponse) },
      });
    }
  }

  const tenancyAssetMatch = /^\/tenancy-assets\/([^/]+)$/.exec(path);
  if (method === 'GET' && tenancyAssetMatch) {
    const parsedId = entityIdSchema.safeParse(tenancyAssetMatch[1]);
    if (!parsedId.success) return validationFailure();

    const assignment = await getTenancyAssetAssignmentQuery(
      deps.assetInventoryRepository,
      actor,
      asTenancyAssetAssignmentId(parsedId.data),
    );
    return json({ data: toTenancyAssetAssignmentResponse(assignment) });
  }

  const inventoryMatch = /^\/tenancy-assets\/([^/]+)\/inventory$/.exec(path);
  if (method === 'POST' && inventoryMatch) {
    const parsedId = entityIdSchema.safeParse(inventoryMatch[1]);
    const parsed = recordTenancyAssetInventoryRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const assignment = await recordTenancyAssetInventoryCommand(
      deps,
      actor,
      asTenancyAssetAssignmentId(parsedId.data),
      {
        expectedVersion: parsed.data.expectedVersion,
        phase: parsed.data.phase,
        presence: parsed.data.presence,
        ...(parsed.data.condition !== undefined
          ? { condition: parsed.data.condition }
          : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      },
    );

    return json({ data: toTenancyAssetAssignmentResponse(assignment) });
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

  const moveMatch = /^\/assets\/([^/]+)\/move$/.exec(path);
  if (method === 'POST' && moveMatch) {
    const parsedId = entityIdSchema.safeParse(moveMatch[1]);
    const parsed = moveAssetRequestSchema.safeParse(await requestJson(request));
    if (!parsedId.success || !parsed.success) return validationFailure();

    const asset = await moveAssetCommand(
      deps,
      actor,
      asAssetId(parsedId.data),
      {
        expectedVersion: parsed.data.expectedVersion,
        propertyId: asPropertyId(parsed.data.propertyId),
        ...(parsed.data.unitId !== undefined
          ? {
              unitId:
                parsed.data.unitId === null
                  ? null
                  : asUnitId(parsed.data.unitId),
            }
          : {}),
        ...(parsed.data.spaceId !== undefined
          ? {
              spaceId:
                parsed.data.spaceId === null
                  ? null
                  : asSpaceId(parsed.data.spaceId),
            }
          : {}),
        ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
      },
    );
    return json({ data: toAssetResponse(asset) });
  }

  const locationHistoryMatch = /^\/assets\/([^/]+)\/location-history$/.exec(path);
  if (method === 'GET' && locationHistoryMatch) {
    const parsedId = entityIdSchema.safeParse(locationHistoryMatch[1]);
    if (!parsedId.success) return validationFailure();

    const history = await listAssetLocationHistoryQuery(
      deps.assetRepository,
      actor,
      asAssetId(parsedId.data),
    );
    return json({
      data: { items: history.map(toAssetLocationHistoryResponse) },
    });
  }

  const conditionsMatch =
    /^\/assets\/([^/]+)\/condition-assessments$/.exec(path);
  if (conditionsMatch) {
    const parsedId = entityIdSchema.safeParse(conditionsMatch[1]);
    if (!parsedId.success) return validationFailure();
    const assetId = asAssetId(parsedId.data);

    if (method === 'POST') {
      const parsed = assessAssetConditionRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();

      const assessment = await assessAssetConditionCommand(
        deps,
        actor,
        assetId,
        {
          condition: parsed.data.condition,
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        },
      );
      return json(
        { data: toAssetConditionAssessmentResponse(assessment) },
        201,
      );
    }

    if (method === 'GET') {
      const assessments = await listAssetConditionAssessmentsQuery(
        deps.assetInventoryRepository,
        deps.assetRepository,
        actor,
        assetId,
      );
      return json({
        data: { items: assessments.map(toAssetConditionAssessmentResponse) },
      });
    }
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
