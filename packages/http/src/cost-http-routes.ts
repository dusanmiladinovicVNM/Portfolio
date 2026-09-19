import {
  correctCostCommand,
  createCostCommand,
  getCostQuery,
  listCostsByInvoiceReferenceQuery,
  listCostsBySourceQuery,
  listCostsBySupplierQuery,
  reverseCostCommand,
  type Actor,
  type AssetRepository,
  type AssetServiceRepository,
  type ClockPort,
  type CostRepository,
  type IdGenerator,
  type ImprovementRepository,
  type MaintenanceRepository,
  type PartyRepository,
  type PortfolioRepository,
} from '@portfolio/application';
import {
  correctCostRequestSchema,
  costSourceSchema,
  createCostRequestSchema,
  entityIdSchema,
  reverseCostRequestSchema,
  type CostSourceDto,
} from '@portfolio/contracts';
import {
  asAssetId,
  asCostId,
  asImprovementProjectId,
  asMaintenanceIssueId,
  asMaintenanceWorkOrderId,
  asPartyId,
  asPropertyId,
  asServiceEventId,
  asSpaceId,
  asUnitId,
  asWarrantyClaimId,
  asWorkItemId,
  asWorkMaterialId,
  asWorkRecordId,
  type CostSource,
} from '@portfolio/domain';
import { json, requestJson, validationFailure } from './http-utils.js';
import {
  toCostResponse,
  toCostReversalResponse,
} from './response-mappers.js';

export interface CostRoutesDependencies {
  readonly costRepository: CostRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly partyRepository: PartyRepository;
  readonly assetRepository: AssetRepository;
  readonly assetServiceRepository: AssetServiceRepository;
  readonly improvementRepository: ImprovementRepository;
  readonly maintenanceRepository: MaintenanceRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

function sourceFromDto(source: CostSourceDto): CostSource {
  switch (source.kind) {
    case 'property':
      return { kind: 'property', propertyId: asPropertyId(source.propertyId) };
    case 'unit':
      return { kind: 'unit', unitId: asUnitId(source.unitId) };
    case 'space':
      return { kind: 'space', spaceId: asSpaceId(source.spaceId) };
    case 'asset':
      return { kind: 'asset', assetId: asAssetId(source.assetId) };
    case 'warranty_claim':
      return {
        kind: 'warranty_claim',
        warrantyClaimId: asWarrantyClaimId(source.warrantyClaimId),
      };
    case 'service_event':
      return {
        kind: 'service_event',
        serviceEventId: asServiceEventId(source.serviceEventId),
      };
    case 'improvement_project':
      return {
        kind: 'improvement_project',
        improvementProjectId: asImprovementProjectId(
          source.improvementProjectId,
        ),
      };
    case 'work_item':
      return { kind: 'work_item', workItemId: asWorkItemId(source.workItemId) };
    case 'work_record':
      return {
        kind: 'work_record',
        workRecordId: asWorkRecordId(source.workRecordId),
      };
    case 'work_material':
      return {
        kind: 'work_material',
        workMaterialId: asWorkMaterialId(source.workMaterialId),
      };
    case 'maintenance_issue':
      return {
        kind: 'maintenance_issue',
        maintenanceIssueId: asMaintenanceIssueId(source.maintenanceIssueId),
      };
    case 'maintenance_work_order':
      return {
        kind: 'maintenance_work_order',
        maintenanceWorkOrderId: asMaintenanceWorkOrderId(
          source.maintenanceWorkOrderId,
        ),
      };
  }
}

function sourceFromQuery(
  kind: string | null,
  id: string | null,
): CostSource | null {
  if (kind === null || id === null) return null;
  const parsedId = entityIdSchema.safeParse(id);
  if (!parsedId.success) return null;

  const candidate =
    kind === 'property'
      ? { kind, propertyId: parsedId.data }
      : kind === 'unit'
        ? { kind, unitId: parsedId.data }
        : kind === 'space'
          ? { kind, spaceId: parsedId.data }
          : kind === 'asset'
            ? { kind, assetId: parsedId.data }
            : kind === 'warranty_claim'
              ? { kind, warrantyClaimId: parsedId.data }
              : kind === 'service_event'
                ? { kind, serviceEventId: parsedId.data }
                : kind === 'improvement_project'
                  ? { kind, improvementProjectId: parsedId.data }
                  : kind === 'work_item'
                    ? { kind, workItemId: parsedId.data }
                    : kind === 'work_record'
                      ? { kind, workRecordId: parsedId.data }
                      : kind === 'work_material'
                        ? { kind, workMaterialId: parsedId.data }
                        : kind === 'maintenance_issue'
                          ? { kind, maintenanceIssueId: parsedId.data }
                          : kind === 'maintenance_work_order'
                            ? { kind, maintenanceWorkOrderId: parsedId.data }
                            : null;

  if (candidate === null) return null;
  const parsed = costSourceSchema.safeParse(candidate);
  return parsed.success ? sourceFromDto(parsed.data) : null;
}

function ledgerEntry(value: {
  readonly cost: Parameters<typeof toCostResponse>[0];
  readonly reversal: Parameters<typeof toCostReversalResponse>[0] | null;
  readonly incomingCorrection:
    | Parameters<typeof toCostReversalResponse>[0]
    | null;
}) {
  return {
    cost: toCostResponse(value.cost),
    reversal:
      value.reversal === null
        ? null
        : toCostReversalResponse(value.reversal),
    incomingCorrection:
      value.incomingCorrection === null
        ? null
        : toCostReversalResponse(value.incomingCorrection),
  };
}

export async function handleCostHttp(
  deps: CostRoutesDependencies,
  actor: Actor,
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (path === '/costs' && method === 'POST') {
    const parsed = createCostRequestSchema.safeParse(await requestJson(request));
    if (!parsed.success) return validationFailure();

    const cost = await createCostCommand(deps, actor, {
      source: sourceFromDto(parsed.data.source),
      description: parsed.data.description,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      incurredOn: parsed.data.incurredOn,
      reportingClass: parsed.data.reportingClass,
      ...(parsed.data.supplierPartyId !== undefined
        ? {
            supplierPartyId:
              parsed.data.supplierPartyId === null
                ? null
                : asPartyId(parsed.data.supplierPartyId),
          }
        : {}),
      ...(parsed.data.invoiceReference !== undefined
        ? { invoiceReference: parsed.data.invoiceReference }
        : {}),
    });

    return json({ data: toCostResponse(cost) }, 201);
  }

  if (path === '/costs' && method === 'GET') {
    const url = new URL(request.url);
    const sourceKind = url.searchParams.get('sourceKind');
    const sourceId = url.searchParams.get('sourceId');
    const supplierPartyId = url.searchParams.get('supplierPartyId');
    const invoiceReference = url.searchParams.get('invoiceReference');

    const sourceMode = sourceKind !== null || sourceId !== null;
    const supplierMode = supplierPartyId !== null;
    const invoiceMode = invoiceReference !== null;
    const selectedModes = [sourceMode, supplierMode, invoiceMode].filter(
      Boolean,
    ).length;

    if (selectedModes !== 1) return validationFailure();

    if (sourceMode) {
      const source = sourceFromQuery(sourceKind, sourceId);
      if (source === null) return validationFailure();
      const entries = await listCostsBySourceQuery(
        deps.costRepository,
        actor,
        source,
      );
      return json({ data: { items: entries.map(ledgerEntry) } });
    }

    if (supplierMode) {
      const parsedId = entityIdSchema.safeParse(supplierPartyId);
      if (!parsedId.success) return validationFailure();
      const entries = await listCostsBySupplierQuery(
        deps.costRepository,
        actor,
        asPartyId(parsedId.data),
      );
      return json({ data: { items: entries.map(ledgerEntry) } });
    }

    if (invoiceReference === null || invoiceReference.trim() === '') {
      return validationFailure();
    }
    const entries = await listCostsByInvoiceReferenceQuery(
      deps.costRepository,
      actor,
      invoiceReference,
    );
    return json({ data: { items: entries.map(ledgerEntry) } });
  }

  const reverseMatch = /^\/costs\/([^/]+)\/reverse$/.exec(path);
  if (method === 'POST' && reverseMatch) {
    const parsedId = entityIdSchema.safeParse(reverseMatch[1]);
    const parsed = reverseCostRequestSchema.safeParse(await requestJson(request));
    if (!parsedId.success || !parsed.success) return validationFailure();

    const reversal = await reverseCostCommand(
      deps,
      actor,
      asCostId(parsedId.data),
      parsed.data.reason,
    );
    return json({ data: toCostReversalResponse(reversal) }, 201);
  }

  const correctMatch = /^\/costs\/([^/]+)\/correct$/.exec(path);
  if (method === 'POST' && correctMatch) {
    const parsedId = entityIdSchema.safeParse(correctMatch[1]);
    const parsed = correctCostRequestSchema.safeParse(await requestJson(request));
    if (!parsedId.success || !parsed.success) return validationFailure();

    const result = await correctCostCommand(
      deps,
      actor,
      asCostId(parsedId.data),
      parsed.data.reason,
      {
        source: sourceFromDto(parsed.data.replacement.source),
        description: parsed.data.replacement.description,
        amount: parsed.data.replacement.amount,
        currency: parsed.data.replacement.currency,
        incurredOn: parsed.data.replacement.incurredOn,
        reportingClass: parsed.data.replacement.reportingClass,
        ...(parsed.data.replacement.supplierPartyId !== undefined
          ? {
              supplierPartyId:
                parsed.data.replacement.supplierPartyId === null
                  ? null
                  : asPartyId(parsed.data.replacement.supplierPartyId),
            }
          : {}),
        ...(parsed.data.replacement.invoiceReference !== undefined
          ? {
              invoiceReference:
                parsed.data.replacement.invoiceReference,
            }
          : {}),
      },
    );

    return json(
      {
        data: {
          replacement: toCostResponse(result.replacement),
          reversal: toCostReversalResponse(result.reversal),
        },
      },
      201,
    );
  }

  const costMatch = /^\/costs\/([^/]+)$/.exec(path);
  if (method === 'GET' && costMatch) {
    const parsedId = entityIdSchema.safeParse(costMatch[1]);
    if (!parsedId.success) return validationFailure();

    const entry = await getCostQuery(
      deps.costRepository,
      actor,
      asCostId(parsedId.data),
    );
    return json({ data: ledgerEntry(entry) });
  }

  return null;
}
