import {
  changeImprovementProjectStatusCommand,
  changeWorkItemStatusCommand,
  createImprovementProjectCommand,
  createWorkItemCommand,
  getImprovementProjectQuery,
  listImprovementProjectsByPropertyQuery,
  listImprovementProjectsByUnitQuery,
  listWorkItemsQuery,
  listWorkRecordsByItemQuery,
  listWorkRecordsByProjectQuery,
  recordWorkCommand,
  updateImprovementProjectPlanCommand,
  updateWorkItemPlanCommand,
  type Actor,
  type AssetRepository,
  type ClockPort,
  type IdGenerator,
  type ImprovementRepository,
  type PartyRepository,
  type PortfolioRepository,
} from '@portfolio/application';
import {
  changeImprovementProjectStatusRequestSchema,
  changeWorkItemStatusRequestSchema,
  createImprovementProjectRequestSchema,
  createWorkItemRequestSchema,
  entityIdSchema,
  recordWorkRequestSchema,
  updateImprovementProjectPlanRequestSchema,
  updateWorkItemPlanRequestSchema,
} from '@portfolio/contracts';
import {
  asAssetId,
  asImprovementProjectId,
  asPartyId,
  asPropertyId,
  asSpaceId,
  asUnitId,
  asWorkItemId,
} from '@portfolio/domain';
import { json, requestJson, validationFailure } from './http-utils.js';
import {
  toImprovementProjectResponse,
  toWorkItemResponse,
  toWorkRecordResponse,
} from './response-mappers.js';

export interface ImprovementRoutesDependencies {
  readonly improvementRepository: ImprovementRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly partyRepository: PartyRepository;
  readonly assetRepository: AssetRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

export async function handleImprovementHttp(
  deps: ImprovementRoutesDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (method === 'POST' && path === '/improvement-projects') {
    const parsed = createImprovementProjectRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsed.success) return validationFailure();

    const project = await createImprovementProjectCommand(deps, actor, {
      code: parsed.data.code,
      name: parsed.data.name,
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
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
      ...(parsed.data.plannedStartOn !== undefined
        ? { plannedStartOn: parsed.data.plannedStartOn }
        : {}),
      ...(parsed.data.plannedEndOn !== undefined
        ? { plannedEndOn: parsed.data.plannedEndOn }
        : {}),
    });
    return json({ data: toImprovementProjectResponse(project) }, 201);
  }

  const propertyListMatch =
    /^\/properties\/([^/]+)\/improvement-projects$/.exec(path);
  if (method === 'GET' && propertyListMatch) {
    const parsedId = entityIdSchema.safeParse(propertyListMatch[1]);
    if (!parsedId.success) return validationFailure();
    const projects = await listImprovementProjectsByPropertyQuery(
      deps.improvementRepository,
      deps.portfolioRepository,
      actor,
      asPropertyId(parsedId.data),
    );
    return json({
      data: { items: projects.map(toImprovementProjectResponse) },
    });
  }

  const unitListMatch =
    /^\/units\/([^/]+)\/improvement-projects$/.exec(path);
  if (method === 'GET' && unitListMatch) {
    const parsedId = entityIdSchema.safeParse(unitListMatch[1]);
    if (!parsedId.success) return validationFailure();
    const projects = await listImprovementProjectsByUnitQuery(
      deps.improvementRepository,
      deps.portfolioRepository,
      actor,
      asUnitId(parsedId.data),
    );
    return json({
      data: { items: projects.map(toImprovementProjectResponse) },
    });
  }

  const planMatch = /^\/improvement-projects\/([^/]+)\/plan$/.exec(path);
  if (method === 'PATCH' && planMatch) {
    const parsedId = entityIdSchema.safeParse(planMatch[1]);
    const parsed = updateImprovementProjectPlanRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const project = await updateImprovementProjectPlanCommand(
      deps.improvementRepository,
      actor,
      asImprovementProjectId(parsedId.data),
      parsed.data.expectedVersion,
      {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.plannedStartOn !== undefined
          ? { plannedStartOn: parsed.data.plannedStartOn }
          : {}),
        ...(parsed.data.plannedEndOn !== undefined
          ? { plannedEndOn: parsed.data.plannedEndOn }
          : {}),
      },
    );
    return json({ data: toImprovementProjectResponse(project) });
  }

  const projectStatusMatch =
    /^\/improvement-projects\/([^/]+)\/status$/.exec(path);
  if (method === 'POST' && projectStatusMatch) {
    const parsedId = entityIdSchema.safeParse(projectStatusMatch[1]);
    const parsed = changeImprovementProjectStatusRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const project = await changeImprovementProjectStatusCommand(
      deps,
      actor,
      asImprovementProjectId(parsedId.data),
      parsed.data.expectedVersion,
      parsed.data.action,
    );
    return json({ data: toImprovementProjectResponse(project) });
  }

  const workItemsMatch =
    /^\/improvement-projects\/([^/]+)\/work-items$/.exec(path);
  if (workItemsMatch) {
    const parsedId = entityIdSchema.safeParse(workItemsMatch[1]);
    if (!parsedId.success) return validationFailure();
    const projectId = asImprovementProjectId(parsedId.data);

    if (method === 'POST') {
      const parsed = createWorkItemRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();
      const item = await createWorkItemCommand(
        deps,
        actor,
        projectId,
        {
          code: parsed.data.code,
          title: parsed.data.title,
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description }
            : {}),
        },
      );
      return json({ data: toWorkItemResponse(item) }, 201);
    }

    if (method === 'GET') {
      const items = await listWorkItemsQuery(
        deps.improvementRepository,
        actor,
        projectId,
      );
      return json({ data: { items: items.map(toWorkItemResponse) } });
    }
  }

  const projectRecordsMatch =
    /^\/improvement-projects\/([^/]+)\/work-records$/.exec(path);
  if (method === 'GET' && projectRecordsMatch) {
    const parsedId = entityIdSchema.safeParse(projectRecordsMatch[1]);
    if (!parsedId.success) return validationFailure();
    const records = await listWorkRecordsByProjectQuery(
      deps.improvementRepository,
      actor,
      asImprovementProjectId(parsedId.data),
    );
    return json({ data: { items: records.map(toWorkRecordResponse) } });
  }

  const workItemPlanMatch = /^\/work-items\/([^/]+)\/plan$/.exec(path);
  if (method === 'PATCH' && workItemPlanMatch) {
    const parsedId = entityIdSchema.safeParse(workItemPlanMatch[1]);
    const parsed = updateWorkItemPlanRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const item = await updateWorkItemPlanCommand(
      deps.improvementRepository,
      actor,
      asWorkItemId(parsedId.data),
      parsed.data.expectedVersion,
      {
        ...(parsed.data.title !== undefined
          ? { title: parsed.data.title }
          : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
      },
    );
    return json({ data: toWorkItemResponse(item) });
  }

  const workItemStatusMatch = /^\/work-items\/([^/]+)\/status$/.exec(path);
  if (method === 'POST' && workItemStatusMatch) {
    const parsedId = entityIdSchema.safeParse(workItemStatusMatch[1]);
    const parsed = changeWorkItemStatusRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsedId.success || !parsed.success) return validationFailure();

    const item = await changeWorkItemStatusCommand(
      deps,
      actor,
      asWorkItemId(parsedId.data),
      parsed.data.expectedVersion,
      parsed.data.action,
    );
    return json({ data: toWorkItemResponse(item) });
  }

  const workRecordsMatch = /^\/work-items\/([^/]+)\/work-records$/.exec(path);
  if (workRecordsMatch) {
    const parsedId = entityIdSchema.safeParse(workRecordsMatch[1]);
    if (!parsedId.success) return validationFailure();
    const workItemId = asWorkItemId(parsedId.data);

    if (method === 'POST') {
      const parsed = recordWorkRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();

      const record = await recordWorkCommand(deps, actor, workItemId, {
        performedAt: parsed.data.performedAt,
        ...(parsed.data.contractorPartyId !== undefined
          ? {
              contractorPartyId:
                parsed.data.contractorPartyId === null
                  ? null
                  : asPartyId(parsed.data.contractorPartyId),
            }
          : {}),
        description: parsed.data.description,
        ...(parsed.data.reference !== undefined
          ? { reference: parsed.data.reference }
          : {}),
        ...(parsed.data.materials !== undefined
          ? {
              materials: parsed.data.materials.map((material) => ({
                name: material.name,
                ...(material.reference !== undefined
                  ? { reference: material.reference }
                  : {}),
                quantity: material.quantity,
                unit: material.unit,
                ...(material.notes !== undefined
                  ? { notes: material.notes }
                  : {}),
              })),
            }
          : {}),
        ...(parsed.data.assets !== undefined
          ? {
              assets: parsed.data.assets.map((asset) => ({
                assetId: asAssetId(asset.assetId),
                action: asset.action,
                ...(asset.notes !== undefined ? { notes: asset.notes } : {}),
              })),
            }
          : {}),
      });
      return json({ data: toWorkRecordResponse(record) }, 201);
    }

    if (method === 'GET') {
      const records = await listWorkRecordsByItemQuery(
        deps.improvementRepository,
        actor,
        workItemId,
      );
      return json({ data: { items: records.map(toWorkRecordResponse) } });
    }
  }

  const projectMatch = /^\/improvement-projects\/([^/]+)$/.exec(path);
  if (method === 'GET' && projectMatch) {
    const parsedId = entityIdSchema.safeParse(projectMatch[1]);
    if (!parsedId.success) return validationFailure();
    const project = await getImprovementProjectQuery(
      deps.improvementRepository,
      actor,
      asImprovementProjectId(parsedId.data),
    );
    return json({ data: toImprovementProjectResponse(project) });
  }

  return null;
}
