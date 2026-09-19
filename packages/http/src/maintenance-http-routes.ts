import {
  assignMaintenanceWorkOrderCommand,
  changeMaintenanceIssueStatusCommand,
  changeMaintenanceWorkOrderStatusCommand,
  createMaintenanceIssueCommand,
  createMaintenanceWorkOrderCommand,
  getMaintenanceIssueQuery,
  getMaintenanceWorkOrderQuery,
  linkServiceEventToMaintenanceWorkOrderCommand,
  listMaintenanceIssuesByAssetQuery,
  listMaintenanceIssuesByPropertyQuery,
  listMaintenanceIssuesByUnitQuery,
  listMaintenanceWorkOrdersQuery,
  updateMaintenanceIssueCommand,
  updateMaintenanceWorkOrderCommand,
  type Actor,
  type AssetRepository,
  type AssetServiceRepository,
  type ClockPort,
  type IdGenerator,
  type InspectionRepository,
  type MaintenanceRepository,
  type PartyRepository,
  type PortfolioRepository,
  type StaffDirectoryRepository,
} from '@portfolio/application';
import {
  assignMaintenanceWorkOrderRequestSchema,
  changeMaintenanceIssueStatusRequestSchema,
  changeMaintenanceWorkOrderStatusRequestSchema,
  createMaintenanceIssueRequestSchema,
  createMaintenanceWorkOrderRequestSchema,
  entityIdSchema,
  linkMaintenanceServiceEventRequestSchema,
  updateMaintenanceIssueRequestSchema,
  updateMaintenanceWorkOrderRequestSchema,
} from '@portfolio/contracts';
import {
  asAssetId,
  asInspectionFindingId,
  asMaintenanceIssueId,
  asMaintenanceWorkOrderId,
  asPartyId,
  asPropertyId,
  asServiceEventId,
  asSpaceId,
  asUnitId,
  asUserId,
} from '@portfolio/domain';
import { json, requestJson, validationFailure } from './http-utils.js';
import {
  toMaintenanceIssueResponse,
  toMaintenanceWorkOrderResponse,
} from './response-mappers.js';

export interface MaintenanceRoutesDependencies {
  readonly maintenanceRepository: MaintenanceRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly assetRepository: AssetRepository;
  readonly assetServiceRepository: AssetServiceRepository;
  readonly inspectionRepository: InspectionRepository;
  readonly partyRepository: PartyRepository;
  readonly staffDirectoryRepository: StaffDirectoryRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

function workOrderEntry(value: Awaited<ReturnType<typeof getMaintenanceWorkOrderQuery>>) {
  return {
    workOrder: toMaintenanceWorkOrderResponse(value.workOrder),
    serviceEventIds: value.serviceEventIds,
  };
}

export async function handleMaintenanceHttp(
  deps: MaintenanceRoutesDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (method === 'POST' && path === '/maintenance-issues') {
    const parsed = createMaintenanceIssueRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsed.success) return validationFailure();

    const issue = await createMaintenanceIssueCommand(deps, actor, {
      code: parsed.data.code,
      propertyId: asPropertyId(parsed.data.propertyId),
      ...(parsed.data.unitId !== undefined
        ? {
            unitId:
              parsed.data.unitId === null ? null : asUnitId(parsed.data.unitId),
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
      ...(parsed.data.assetId !== undefined
        ? {
            assetId:
              parsed.data.assetId === null
                ? null
                : asAssetId(parsed.data.assetId),
          }
        : {}),
      ...(parsed.data.inspectionFindingId !== undefined
        ? {
            inspectionFindingId:
              parsed.data.inspectionFindingId === null
                ? null
                : asInspectionFindingId(parsed.data.inspectionFindingId),
          }
        : {}),
      title: parsed.data.title,
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      priority: parsed.data.priority,
      ...(parsed.data.reportedAt !== undefined
        ? { reportedAt: parsed.data.reportedAt }
        : {}),
    });
    return json({ data: toMaintenanceIssueResponse(issue) }, 201);
  }

  const propertyList = /^\/properties\/([^/]+)\/maintenance-issues$/.exec(path);
  if (method === 'GET' && propertyList) {
    const id = entityIdSchema.safeParse(propertyList[1]);
    if (!id.success) return validationFailure();
    const items = await listMaintenanceIssuesByPropertyQuery(
      deps.maintenanceRepository,
      actor,
      asPropertyId(id.data),
    );
    return json({ data: { items: items.map(toMaintenanceIssueResponse) } });
  }

  const unitList = /^\/units\/([^/]+)\/maintenance-issues$/.exec(path);
  if (method === 'GET' && unitList) {
    const id = entityIdSchema.safeParse(unitList[1]);
    if (!id.success) return validationFailure();
    const items = await listMaintenanceIssuesByUnitQuery(
      deps.maintenanceRepository,
      actor,
      asUnitId(id.data),
    );
    return json({ data: { items: items.map(toMaintenanceIssueResponse) } });
  }

  const assetList = /^\/assets\/([^/]+)\/maintenance-issues$/.exec(path);
  if (method === 'GET' && assetList) {
    const id = entityIdSchema.safeParse(assetList[1]);
    if (!id.success) return validationFailure();
    const items = await listMaintenanceIssuesByAssetQuery(
      deps.maintenanceRepository,
      actor,
      asAssetId(id.data),
    );
    return json({ data: { items: items.map(toMaintenanceIssueResponse) } });
  }

  const issueStatus = /^\/maintenance-issues\/([^/]+)\/status$/.exec(path);
  if (method === 'POST' && issueStatus) {
    const id = entityIdSchema.safeParse(issueStatus[1]);
    const parsed = changeMaintenanceIssueStatusRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!id.success || !parsed.success) return validationFailure();
    const issue = await changeMaintenanceIssueStatusCommand(
      deps,
      actor,
      asMaintenanceIssueId(id.data),
      parsed.data.expectedVersion,
      parsed.data.action,
    );
    return json({ data: toMaintenanceIssueResponse(issue) });
  }

  const issueWorkOrders =
    /^\/maintenance-issues\/([^/]+)\/work-orders$/.exec(path);
  if (issueWorkOrders) {
    const id = entityIdSchema.safeParse(issueWorkOrders[1]);
    if (!id.success) return validationFailure();
    const issueId = asMaintenanceIssueId(id.data);

    if (method === 'POST') {
      const parsed = createMaintenanceWorkOrderRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();
      const workOrder = await createMaintenanceWorkOrderCommand(
        deps,
        actor,
        issueId,
        {
          code: parsed.data.code,
          title: parsed.data.title,
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description }
            : {}),
        },
      );
      return json({ data: toMaintenanceWorkOrderResponse(workOrder) }, 201);
    }

    if (method === 'GET') {
      const items = await listMaintenanceWorkOrdersQuery(
        deps.maintenanceRepository,
        actor,
        issueId,
      );
      return json({ data: { items: items.map(workOrderEntry) } });
    }
  }

  const issueMatch = /^\/maintenance-issues\/([^/]+)$/.exec(path);
  if (issueMatch) {
    const id = entityIdSchema.safeParse(issueMatch[1]);
    if (!id.success) return validationFailure();
    const issueId = asMaintenanceIssueId(id.data);

    if (method === 'GET') {
      const issue = await getMaintenanceIssueQuery(
        deps.maintenanceRepository,
        actor,
        issueId,
      );
      return json({ data: toMaintenanceIssueResponse(issue) });
    }

    if (method === 'PATCH') {
      const parsed = updateMaintenanceIssueRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();
      const issue = await updateMaintenanceIssueCommand(
        deps.maintenanceRepository,
        actor,
        issueId,
        parsed.data.expectedVersion,
        {
          ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description }
            : {}),
          ...(parsed.data.priority !== undefined
            ? { priority: parsed.data.priority }
            : {}),
        },
      );
      return json({ data: toMaintenanceIssueResponse(issue) });
    }
  }

  const assignMatch =
    /^\/maintenance-work-orders\/([^/]+)\/assign$/.exec(path);
  if (method === 'POST' && assignMatch) {
    const id = entityIdSchema.safeParse(assignMatch[1]);
    const parsed = assignMaintenanceWorkOrderRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!id.success || !parsed.success) return validationFailure();
    const assignee =
      parsed.data.assignee.kind === 'user'
        ? { kind: 'user' as const, userId: asUserId(parsed.data.assignee.userId) }
        : {
            kind: 'party' as const,
            partyId: asPartyId(parsed.data.assignee.partyId),
          };
    const workOrder = await assignMaintenanceWorkOrderCommand(
      deps,
      actor,
      asMaintenanceWorkOrderId(id.data),
      parsed.data.expectedVersion,
      assignee,
    );
    return json({ data: toMaintenanceWorkOrderResponse(workOrder) });
  }

  const workOrderStatus =
    /^\/maintenance-work-orders\/([^/]+)\/status$/.exec(path);
  if (method === 'POST' && workOrderStatus) {
    const id = entityIdSchema.safeParse(workOrderStatus[1]);
    const parsed = changeMaintenanceWorkOrderStatusRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!id.success || !parsed.success) return validationFailure();
    const workOrder = await changeMaintenanceWorkOrderStatusCommand(
      deps,
      actor,
      asMaintenanceWorkOrderId(id.data),
      parsed.data.expectedVersion,
      parsed.data.action,
    );
    return json({ data: toMaintenanceWorkOrderResponse(workOrder) });
  }

  const serviceEventMatch =
    /^\/maintenance-work-orders\/([^/]+)\/service-events$/.exec(path);
  if (method === 'POST' && serviceEventMatch) {
    const id = entityIdSchema.safeParse(serviceEventMatch[1]);
    const parsed = linkMaintenanceServiceEventRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!id.success || !parsed.success) return validationFailure();
    const link = await linkServiceEventToMaintenanceWorkOrderCommand(
      deps,
      actor,
      asMaintenanceWorkOrderId(id.data),
      asServiceEventId(parsed.data.serviceEventId),
    );
    return json({ data: link }, 201);
  }

  const workOrderMatch = /^\/maintenance-work-orders\/([^/]+)$/.exec(path);
  if (workOrderMatch) {
    const id = entityIdSchema.safeParse(workOrderMatch[1]);
    if (!id.success) return validationFailure();
    const workOrderId = asMaintenanceWorkOrderId(id.data);

    if (method === 'GET') {
      const entry = await getMaintenanceWorkOrderQuery(
        deps.maintenanceRepository,
        actor,
        workOrderId,
      );
      return json({ data: workOrderEntry(entry) });
    }

    if (method === 'PATCH') {
      const parsed = updateMaintenanceWorkOrderRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();
      const workOrder = await updateMaintenanceWorkOrderCommand(
        deps.maintenanceRepository,
        actor,
        workOrderId,
        parsed.data.expectedVersion,
        {
          ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description }
            : {}),
        },
      );
      return json({ data: toMaintenanceWorkOrderResponse(workOrder) });
    }
  }

  return null;
}
