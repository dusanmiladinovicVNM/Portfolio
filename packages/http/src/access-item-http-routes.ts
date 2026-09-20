import {
  createAccessItemCommand,
  getAccessItemQuery,
  issueAccessItemCommand,
  listAccessItemsByPropertyQuery,
  listAccessItemsByUnitQuery,
  listCurrentAccessItemsByTenancyQuery,
  reportAccessItemLostCommand,
  retireAccessItemCommand,
  returnAccessItemCommand,
  updateAccessItemLabelCommand,
  type AccessItemDependencies,
  type Actor,
} from '@portfolio/application';
import {
  accessItemCustodyEventRequestSchema,
  createAccessItemRequestSchema,
  entityIdSchema,
  issueAccessItemRequestSchema,
  retireAccessItemRequestSchema,
  updateAccessItemRequestSchema,
} from '@portfolio/contracts';
import {
  asAccessItemId,
  asPropertyId,
  asSpaceId,
  asTenancyId,
  asUnitId,
} from '@portfolio/domain';
import { json, requestJson, validationFailure } from './http-utils.js';
import {
  toAccessItemResponse,
  toAccessItemTransactionResponse,
} from './response-mappers.js';

export type AccessItemRoutesDependencies = AccessItemDependencies;

function entry(value: {
  readonly item: Awaited<ReturnType<typeof getAccessItemQuery>>['item'];
  readonly state: Awaited<ReturnType<typeof getAccessItemQuery>>['state'];
}) {
  return {
    item: toAccessItemResponse(value.item),
    state: {
      kind: value.state.kind,
      tenancyId: value.state.tenancyId,
      lastTransaction:
        value.state.lastTransaction === null
          ? null
          : toAccessItemTransactionResponse(value.state.lastTransaction),
    },
  };
}

export async function handleAccessItemHttp(
  deps: AccessItemRoutesDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (method === 'POST' && path === '/access-items') {
    const parsed = createAccessItemRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!parsed.success) return validationFailure();

    const item = await createAccessItemCommand(deps, actor, {
      code: parsed.data.code,
      kind: parsed.data.kind,
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
      label: parsed.data.label,
    });

    return json({ data: toAccessItemResponse(item) }, 201);
  }

  const propertyList = /^\/properties\/([^/]+)\/access-items$/.exec(path);
  if (method === 'GET' && propertyList) {
    const id = entityIdSchema.safeParse(propertyList[1]);
    if (!id.success) return validationFailure();
    const items = await listAccessItemsByPropertyQuery(
      deps.accessItemRepository,
      actor,
      asPropertyId(id.data),
    );
    return json({ data: { items: items.map(entry) } });
  }

  const unitList = /^\/units\/([^/]+)\/access-items$/.exec(path);
  if (method === 'GET' && unitList) {
    const id = entityIdSchema.safeParse(unitList[1]);
    if (!id.success) return validationFailure();
    const items = await listAccessItemsByUnitQuery(
      deps.accessItemRepository,
      actor,
      asUnitId(id.data),
    );
    return json({ data: { items: items.map(entry) } });
  }

  const tenancyList = /^\/tenancies\/([^/]+)\/access-items$/.exec(path);
  if (method === 'GET' && tenancyList) {
    const id = entityIdSchema.safeParse(tenancyList[1]);
    if (!id.success) return validationFailure();
    const items = await listCurrentAccessItemsByTenancyQuery(
      deps.accessItemRepository,
      actor,
      asTenancyId(id.data),
    );
    return json({ data: { items: items.map(entry) } });
  }

  const issueMatch = /^\/access-items\/([^/]+)\/issue$/.exec(path);
  if (method === 'POST' && issueMatch) {
    const id = entityIdSchema.safeParse(issueMatch[1]);
    const parsed = issueAccessItemRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!id.success || !parsed.success) return validationFailure();

    const transaction = await issueAccessItemCommand(
      deps,
      actor,
      asAccessItemId(id.data),
      {
        tenancyId: asTenancyId(parsed.data.tenancyId),
        occurredAt: parsed.data.occurredAt,
        ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
      },
    );

    return json({ data: toAccessItemTransactionResponse(transaction) }, 201);
  }

  const returnMatch = /^\/access-items\/([^/]+)\/return$/.exec(path);
  if (method === 'POST' && returnMatch) {
    const id = entityIdSchema.safeParse(returnMatch[1]);
    const parsed = accessItemCustodyEventRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!id.success || !parsed.success) return validationFailure();

    const transaction = await returnAccessItemCommand(
      deps,
      actor,
      asAccessItemId(id.data),
      {
        occurredAt: parsed.data.occurredAt,
        ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
      },
    );

    return json({ data: toAccessItemTransactionResponse(transaction) }, 201);
  }

  const lossMatch = /^\/access-items\/([^/]+)\/loss$/.exec(path);
  if (method === 'POST' && lossMatch) {
    const id = entityIdSchema.safeParse(lossMatch[1]);
    const parsed = accessItemCustodyEventRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!id.success || !parsed.success) return validationFailure();

    const transaction = await reportAccessItemLostCommand(
      deps,
      actor,
      asAccessItemId(id.data),
      {
        occurredAt: parsed.data.occurredAt,
        ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
      },
    );

    return json({ data: toAccessItemTransactionResponse(transaction) }, 201);
  }

  const retireMatch = /^\/access-items\/([^/]+)\/retire$/.exec(path);
  if (method === 'POST' && retireMatch) {
    const id = entityIdSchema.safeParse(retireMatch[1]);
    const parsed = retireAccessItemRequestSchema.safeParse(
      await requestJson(request),
    );
    if (!id.success || !parsed.success) return validationFailure();

    const item = await retireAccessItemCommand(
      deps,
      actor,
      asAccessItemId(id.data),
      parsed.data.expectedVersion,
      parsed.data.retirementReason,
    );

    return json({ data: toAccessItemResponse(item) });
  }

  const itemMatch = /^\/access-items\/([^/]+)$/.exec(path);
  if (itemMatch) {
    const id = entityIdSchema.safeParse(itemMatch[1]);
    if (!id.success) return validationFailure();
    const accessItemId = asAccessItemId(id.data);

    if (method === 'GET') {
      const result = await getAccessItemQuery(
        deps.accessItemRepository,
        actor,
        accessItemId,
      );

      return json({
        data: {
          ...entry(result),
          transactions: result.transactions.map(toAccessItemTransactionResponse),
        },
      });
    }

    if (method === 'PATCH') {
      const parsed = updateAccessItemRequestSchema.safeParse(
        await requestJson(request),
      );
      if (!parsed.success) return validationFailure();

      const item = await updateAccessItemLabelCommand(
        deps,
        actor,
        accessItemId,
        parsed.data.expectedVersion,
        parsed.data.label,
      );

      return json({ data: toAccessItemResponse(item) });
    }
  }

  return null;
}
