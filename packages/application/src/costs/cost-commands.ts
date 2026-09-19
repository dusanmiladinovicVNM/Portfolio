import {
  DomainError,
  asCostId,
  asCostReversalId,
  createCost,
  createCostReversal,
  type CostId,
  type CostReportingClass,
  type CostSource,
  type PartyId,
} from '@portfolio/domain';
import type { AssetRepository } from '../assets/asset-repository.js';
import type { AssetServiceRepository } from '../assets/asset-service-repository.js';
import type { ImprovementRepository } from '../improvements/improvement-repository.js';
import type { MaintenanceRepository } from '../maintenance/maintenance-repository.js';
import type { PartyRepository } from '../parties/party-repository.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import {
  requireCapability,
  type Actor,
} from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { CostRepository } from './cost-repository.js';

export interface CostDependencies {
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

async function requireCost(
  repository: CostRepository,
  costId: CostId,
) {
  const cost = await repository.getCostById(costId);
  if (!cost) {
    throw new DomainError('COST_NOT_FOUND', 'Cost not found.');
  }
  return cost;
}

async function requireSupplier(
  repository: PartyRepository,
  supplierPartyId: PartyId | null | undefined,
): Promise<void> {
  if (supplierPartyId == null) return;
  if (!(await repository.getById(supplierPartyId))) {
    throw new DomainError('PARTY_NOT_FOUND', 'Supplier Party not found.');
  }
}

async function requireCostSource(
  deps: Pick<
    CostDependencies,
    | 'portfolioRepository'
    | 'assetRepository'
    | 'assetServiceRepository'
    | 'improvementRepository'
    | 'maintenanceRepository'
  >,
  source: CostSource,
): Promise<void> {
  let exists = false;

  switch (source.kind) {
    case 'property':
      exists =
        (await deps.portfolioRepository.getPropertyById(source.propertyId)) !==
        null;
      break;
    case 'unit':
      exists =
        (await deps.portfolioRepository.getUnitById(source.unitId)) !== null;
      break;
    case 'space':
      exists =
        (await deps.portfolioRepository.getSpaceById(source.spaceId)) !== null;
      break;
    case 'asset':
      exists = (await deps.assetRepository.getById(source.assetId)) !== null;
      break;
    case 'warranty_claim':
      exists =
        (await deps.assetServiceRepository.getWarrantyClaimById(
          source.warrantyClaimId,
        )) !== null;
      break;
    case 'service_event':
      exists =
        (await deps.assetServiceRepository.getServiceEventById(
          source.serviceEventId,
        )) !== null;
      break;
    case 'improvement_project':
      exists =
        (await deps.improvementRepository.getProjectById(
          source.improvementProjectId,
        )) !== null;
      break;
    case 'work_item':
      exists =
        (await deps.improvementRepository.getWorkItemById(
          source.workItemId,
        )) !== null;
      break;
    case 'work_record':
      exists =
        (await deps.improvementRepository.getWorkRecordById(
          source.workRecordId,
        )) !== null;
      break;
    case 'work_material':
      exists =
        (await deps.improvementRepository.getWorkMaterialById(
          source.workMaterialId,
        )) !== null;
      break;
    case 'maintenance_issue':
      exists =
        (await deps.maintenanceRepository.getIssueById(
          source.maintenanceIssueId,
        )) !== null;
      break;
    case 'maintenance_work_order':
      exists =
        (await deps.maintenanceRepository.getWorkOrderById(
          source.maintenanceWorkOrderId,
        )) !== null;
      break;
  }

  if (!exists) {
    throw new DomainError(
      'COST_SOURCE_NOT_FOUND',
      `Cost source ${source.kind} not found.`,
    );
  }
}

export async function createCostCommand(
  deps: CostDependencies,
  actor: Actor,
  input: {
    readonly source: CostSource;
    readonly description: string;
    readonly amount: string;
    readonly currency: string;
    readonly incurredOn: string;
    readonly reportingClass: CostReportingClass;
    readonly supplierPartyId?: PartyId | null;
    readonly invoiceReference?: string | null;
  },
) {
  requireCapability(actor, 'costs:write');
  await Promise.all([
    requireCostSource(deps, input.source),
    requireSupplier(deps.partyRepository, input.supplierPartyId),
  ]);

  const cost = createCost({
    id: asCostId(deps.idGenerator.next()),
    source: input.source,
    description: input.description,
    amount: input.amount,
    currency: input.currency,
    incurredOn: input.incurredOn,
    reportingClass: input.reportingClass,
    ...(input.supplierPartyId !== undefined
      ? { supplierPartyId: input.supplierPartyId }
      : {}),
    ...(input.invoiceReference !== undefined
      ? { invoiceReference: input.invoiceReference }
      : {}),
    recordedAt: deps.clock.now(),
    recordedByUserId: actor.userId,
  });

  await deps.costRepository.insertCost(cost);
  return cost;
}

export async function reverseCostCommand(
  deps: Pick<CostDependencies, 'costRepository' | 'idGenerator' | 'clock'>,
  actor: Actor,
  costId: CostId,
  reason: string,
) {
  requireCapability(actor, 'costs:write');
  const cost = await requireCost(deps.costRepository, costId);
  if ((await deps.costRepository.getReversalByCostId(cost.id)) !== null) {
    throw new DomainError(
      'COST_ALREADY_REVERSED',
      'Cost has already been reversed.',
    );
  }

  const reversal = createCostReversal({
    id: asCostReversalId(deps.idGenerator.next()),
    cost,
    reason,
    recordedAt: deps.clock.now(),
    recordedByUserId: actor.userId,
  });
  await deps.costRepository.insertReversal(reversal);
  return reversal;
}

export async function correctCostCommand(
  deps: CostDependencies,
  actor: Actor,
  costId: CostId,
  reason: string,
  replacementInput: {
    readonly source: CostSource;
    readonly description: string;
    readonly amount: string;
    readonly currency: string;
    readonly incurredOn: string;
    readonly reportingClass: CostReportingClass;
    readonly supplierPartyId?: PartyId | null;
    readonly invoiceReference?: string | null;
  },
) {
  requireCapability(actor, 'costs:write');
  const original = await requireCost(deps.costRepository, costId);
  if ((await deps.costRepository.getReversalByCostId(original.id)) !== null) {
    throw new DomainError(
      'COST_ALREADY_REVERSED',
      'Cost has already been reversed.',
    );
  }

  await Promise.all([
    requireCostSource(deps, replacementInput.source),
    requireSupplier(deps.partyRepository, replacementInput.supplierPartyId),
  ]);

  const recordedAt = deps.clock.now();
  const replacement = createCost({
    id: asCostId(deps.idGenerator.next()),
    source: replacementInput.source,
    description: replacementInput.description,
    amount: replacementInput.amount,
    currency: replacementInput.currency,
    incurredOn: replacementInput.incurredOn,
    reportingClass: replacementInput.reportingClass,
    ...(replacementInput.supplierPartyId !== undefined
      ? { supplierPartyId: replacementInput.supplierPartyId }
      : {}),
    ...(replacementInput.invoiceReference !== undefined
      ? { invoiceReference: replacementInput.invoiceReference }
      : {}),
    recordedAt,
    recordedByUserId: actor.userId,
  });

  const reversal = createCostReversal({
    id: asCostReversalId(deps.idGenerator.next()),
    cost: original,
    replacementCost: replacement,
    reason,
    recordedAt,
    recordedByUserId: actor.userId,
  });

  await deps.costRepository.insertCorrection(replacement, reversal);
  return { replacement, reversal };
}
