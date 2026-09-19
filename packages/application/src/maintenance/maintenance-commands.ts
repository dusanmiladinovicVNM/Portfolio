import {
  DomainError,
  asMaintenanceIssueId,
  asMaintenanceWorkOrderId,
  cancelMaintenanceIssue,
  cancelMaintenanceWorkOrder,
  completeMaintenanceWorkOrder,
  createMaintenanceIssue,
  createMaintenanceWorkOrder,
  createMaintenanceWorkOrderServiceEventLink,
  resolveMaintenanceIssue,
  startMaintenanceWorkOrder,
  assignMaintenanceWorkOrder,
  updateMaintenanceIssue,
  updateMaintenanceWorkOrder,
  type AssetId,
  type InspectionFindingId,
  type MaintenanceAssignee,
  type MaintenanceIssueId,
  type MaintenanceIssuePriority,
  type MaintenanceWorkOrderId,
  type PartyId,
  type PropertyId,
  type ServiceEventId,
  type SpaceId,
  type UnitId,
} from '@portfolio/domain';
import type { AssetRepository } from '../assets/asset-repository.js';
import type { AssetServiceRepository } from '../assets/asset-service-repository.js';
import type { InspectionRepository, StaffDirectoryRepository } from '../inspections/inspection-repository.js';
import type { PartyRepository } from '../parties/party-repository.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import { requireCapability, type Actor } from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { MaintenanceRepository } from './maintenance-repository.js';

export interface MaintenanceDependencies {
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

async function requireIssue(
  repository: MaintenanceRepository,
  id: MaintenanceIssueId,
) {
  const issue = await repository.getIssueById(id);
  if (!issue) {
    throw new DomainError(
      'MAINTENANCE_ISSUE_NOT_FOUND',
      'Maintenance Issue not found.',
    );
  }
  return issue;
}

async function requireWorkOrder(
  repository: MaintenanceRepository,
  id: MaintenanceWorkOrderId,
) {
  const order = await repository.getWorkOrderById(id);
  if (!order) {
    throw new DomainError(
      'MAINTENANCE_WORK_ORDER_NOT_FOUND',
      'Maintenance WorkOrder not found.',
    );
  }
  return order;
}

async function assertIssueScope(
  deps: Pick<
    MaintenanceDependencies,
    'portfolioRepository' | 'assetRepository' | 'inspectionRepository'
  >,
  input: {
    readonly propertyId: PropertyId;
    readonly unitId?: UnitId | null;
    readonly spaceId?: SpaceId | null;
    readonly assetId?: AssetId | null;
    readonly inspectionFindingId?: InspectionFindingId | null;
  },
): Promise<void> {
  const property = await deps.portfolioRepository.getPropertyById(input.propertyId);
  if (!property) throw new DomainError('PROPERTY_NOT_FOUND', 'Property not found.');

  const unit =
    input.unitId == null
      ? null
      : await deps.portfolioRepository.getUnitById(input.unitId);
  if (input.unitId != null && !unit) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }
  if (unit !== null && unit.propertyId !== input.propertyId) {
    throw new DomainError(
      'MAINTENANCE_SCOPE_MISMATCH',
      'Maintenance Issue Unit must belong to its Property.',
    );
  }

  const space =
    input.spaceId == null
      ? null
      : await deps.portfolioRepository.getSpaceById(input.spaceId);
  if (input.spaceId != null && !space) {
    throw new DomainError('SPACE_NOT_FOUND', 'Space not found.');
  }
  if (space !== null && (unit === null || space.unitId !== unit.id)) {
    throw new DomainError(
      'MAINTENANCE_SCOPE_MISMATCH',
      'Maintenance Issue Space must belong to its Unit.',
    );
  }

  if (input.assetId != null) {
    const asset = await deps.assetRepository.getById(input.assetId);
    if (!asset) throw new DomainError('ASSET_NOT_FOUND', 'Asset not found.');
    if (
      asset.propertyId !== input.propertyId ||
      asset.unitId !== (input.unitId ?? null) ||
      asset.spaceId !== (input.spaceId ?? null)
    ) {
      throw new DomainError(
        'MAINTENANCE_ASSET_SCOPE_MISMATCH',
        'Maintenance Issue must capture the Asset exact current placement.',
      );
    }
  }

  if (input.inspectionFindingId != null) {
    const finding = await deps.inspectionRepository.getFindingById(
      input.inspectionFindingId,
    );
    if (!finding) {
      throw new DomainError(
        'INSPECTION_FINDING_NOT_FOUND',
        'Inspection Finding not found.',
      );
    }
    const inspection = await deps.inspectionRepository.getById(
      finding.inspectionId,
    );
    if (!inspection) {
      throw new DomainError('INSPECTION_NOT_FOUND', 'Inspection not found.');
    }
    if (input.unitId == null || inspection.unitId !== input.unitId) {
      throw new DomainError(
        'MAINTENANCE_FINDING_SCOPE_MISMATCH',
        'Originating Inspection Finding must belong to the Maintenance Issue Unit.',
      );
    }
  }
}

async function assertIssueOpen(
  repository: MaintenanceRepository,
  issueId: MaintenanceIssueId,
) {
  const issue = await requireIssue(repository, issueId);
  if (issue.status !== 'open') {
    throw new DomainError(
      'MAINTENANCE_ISSUE_TERMINAL',
      'Maintenance WorkOrder can only change while its Issue is open.',
    );
  }
  return issue;
}

export async function createMaintenanceIssueCommand(
  deps: MaintenanceDependencies,
  actor: Actor,
  input: {
    readonly code: string;
    readonly propertyId: PropertyId;
    readonly unitId?: UnitId | null;
    readonly spaceId?: SpaceId | null;
    readonly assetId?: AssetId | null;
    readonly inspectionFindingId?: InspectionFindingId | null;
    readonly title: string;
    readonly description?: string | null;
    readonly priority: MaintenanceIssuePriority;
    readonly reportedAt?: string;
  },
) {
  requireCapability(actor, 'maintenance:write');
  await assertIssueScope(deps, input);

  if (await deps.maintenanceRepository.issueCodeExists(input.code.trim())) {
    throw new DomainError(
      'MAINTENANCE_ISSUE_ALREADY_EXISTS',
      'Maintenance Issue code already exists.',
    );
  }
  if (
    input.inspectionFindingId != null &&
    (await deps.maintenanceRepository.getIssueByInspectionFindingId(
      input.inspectionFindingId,
    )) !== null
  ) {
    throw new DomainError(
      'MAINTENANCE_FINDING_ALREADY_LINKED',
      'Inspection Finding already originated a Maintenance Issue.',
    );
  }

  const recordedAt = deps.clock.now();
  const issue = createMaintenanceIssue({
    id: asMaintenanceIssueId(deps.idGenerator.next()),
    code: input.code,
    propertyId: input.propertyId,
    ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
    ...(input.spaceId !== undefined ? { spaceId: input.spaceId } : {}),
    ...(input.assetId !== undefined ? { assetId: input.assetId } : {}),
    ...(input.inspectionFindingId !== undefined
      ? { inspectionFindingId: input.inspectionFindingId }
      : {}),
    title: input.title,
    ...(input.description !== undefined ? { description: input.description } : {}),
    priority: input.priority,
    reportedAt: input.reportedAt ?? recordedAt,
    recordedAt,
    recordedByUserId: actor.userId,
  });
  await deps.maintenanceRepository.insertIssue(issue);
  return issue;
}

export async function updateMaintenanceIssueCommand(
  repository: MaintenanceRepository,
  actor: Actor,
  id: MaintenanceIssueId,
  expectedVersion: number,
  input: {
    readonly title?: string;
    readonly description?: string | null;
    readonly priority?: MaintenanceIssuePriority;
  },
) {
  requireCapability(actor, 'maintenance:write');
  const current = await requireIssue(repository, id);
  const updated = updateMaintenanceIssue(current, input);
  if (updated === current) return current;
  await repository.updateIssue(updated, expectedVersion);
  return updated;
}

export async function changeMaintenanceIssueStatusCommand(
  deps: Pick<MaintenanceDependencies, 'maintenanceRepository' | 'clock'>,
  actor: Actor,
  id: MaintenanceIssueId,
  expectedVersion: number,
  action: 'resolve' | 'cancel',
) {
  requireCapability(actor, 'maintenance:write');
  const current = await requireIssue(deps.maintenanceRepository, id);
  const orders = await deps.maintenanceRepository.listWorkOrdersByIssue(id);
  const now = deps.clock.now();
  const updated =
    action === 'resolve'
      ? resolveMaintenanceIssue(current, orders, now)
      : cancelMaintenanceIssue(current, orders, now);
  await deps.maintenanceRepository.updateIssue(updated, expectedVersion);
  return updated;
}

export async function createMaintenanceWorkOrderCommand(
  deps: Pick<MaintenanceDependencies, 'maintenanceRepository' | 'idGenerator' | 'clock'>,
  actor: Actor,
  issueId: MaintenanceIssueId,
  input: {
    readonly code: string;
    readonly title: string;
    readonly description?: string | null;
  },
) {
  requireCapability(actor, 'maintenance:write');
  const issue = await assertIssueOpen(deps.maintenanceRepository, issueId);
  if (await deps.maintenanceRepository.workOrderCodeExists(input.code.trim())) {
    throw new DomainError(
      'MAINTENANCE_WORK_ORDER_ALREADY_EXISTS',
      'Maintenance WorkOrder code already exists.',
    );
  }
  const order = createMaintenanceWorkOrder({
    id: asMaintenanceWorkOrderId(deps.idGenerator.next()),
    issue,
    code: input.code,
    title: input.title,
    ...(input.description !== undefined ? { description: input.description } : {}),
    createdAt: deps.clock.now(),
    createdByUserId: actor.userId,
  });
  await deps.maintenanceRepository.insertWorkOrder(order);
  return order;
}

export async function updateMaintenanceWorkOrderCommand(
  repository: MaintenanceRepository,
  actor: Actor,
  id: MaintenanceWorkOrderId,
  expectedVersion: number,
  input: { readonly title?: string; readonly description?: string | null },
) {
  requireCapability(actor, 'maintenance:write');
  const current = await requireWorkOrder(repository, id);
  await assertIssueOpen(repository, current.issueId);
  const updated = updateMaintenanceWorkOrder(current, input);
  if (updated === current) return current;
  await repository.updateWorkOrder(updated, expectedVersion);
  return updated;
}

async function requireActiveAssignee(
  deps: Pick<MaintenanceDependencies, 'staffDirectoryRepository' | 'partyRepository'>,
  assignee: MaintenanceAssignee,
): Promise<void> {
  if (assignee.kind === 'user') {
    if (!(await deps.staffDirectoryRepository.getActiveStaffById(assignee.userId))) {
      throw new DomainError(
        'MAINTENANCE_ASSIGNEE_NOT_ACTIVE',
        'Assigned internal User must be active staff.',
      );
    }
    return;
  }
  const party = await deps.partyRepository.getById(assignee.partyId);
  if (!party || party.status !== 'active') {
    throw new DomainError(
      'MAINTENANCE_ASSIGNEE_NOT_ACTIVE',
      'Assigned Party must exist and be active.',
    );
  }
}

export async function assignMaintenanceWorkOrderCommand(
  deps: Pick<
    MaintenanceDependencies,
    'maintenanceRepository' | 'staffDirectoryRepository' | 'partyRepository' | 'clock'
  >,
  actor: Actor,
  id: MaintenanceWorkOrderId,
  expectedVersion: number,
  assignee: MaintenanceAssignee,
) {
  requireCapability(actor, 'maintenance:write');
  const current = await requireWorkOrder(deps.maintenanceRepository, id);
  await assertIssueOpen(deps.maintenanceRepository, current.issueId);
  await requireActiveAssignee(deps, assignee);
  const updated = assignMaintenanceWorkOrder(current, assignee, deps.clock.now());
  await deps.maintenanceRepository.updateWorkOrder(updated, expectedVersion);
  return updated;
}

export async function changeMaintenanceWorkOrderStatusCommand(
  deps: Pick<MaintenanceDependencies, 'maintenanceRepository' | 'clock'>,
  actor: Actor,
  id: MaintenanceWorkOrderId,
  expectedVersion: number,
  action: 'start' | 'complete' | 'cancel',
) {
  requireCapability(actor, 'maintenance:write');
  const current = await requireWorkOrder(deps.maintenanceRepository, id);
  await assertIssueOpen(deps.maintenanceRepository, current.issueId);
  const now = deps.clock.now();
  let updated;
  if (action === 'start') {
    updated = startMaintenanceWorkOrder(current, now);
  } else if (action === 'complete') {
    updated = completeMaintenanceWorkOrder(current, now);
  } else {
    const serviceEvents =
      await deps.maintenanceRepository.listServiceEventIdsByWorkOrder(id);
    updated = cancelMaintenanceWorkOrder(current, serviceEvents.length > 0, now);
  }
  await deps.maintenanceRepository.updateWorkOrder(updated, expectedVersion);
  return updated;
}

export async function linkServiceEventToMaintenanceWorkOrderCommand(
  deps: Pick<
    MaintenanceDependencies,
    'maintenanceRepository' | 'assetServiceRepository' | 'clock'
  >,
  actor: Actor,
  workOrderId: MaintenanceWorkOrderId,
  serviceEventId: ServiceEventId,
) {
  requireCapability(actor, 'maintenance:write');
  const order = await requireWorkOrder(deps.maintenanceRepository, workOrderId);
  const issue = await requireIssue(deps.maintenanceRepository, order.issueId);
  const event = await deps.assetServiceRepository.getServiceEventById(serviceEventId);
  if (!event) {
    throw new DomainError('SERVICE_EVENT_NOT_FOUND', 'ServiceEvent not found.');
  }
  if (await deps.maintenanceRepository.serviceEventIsLinked(serviceEventId)) {
    throw new DomainError(
      'MAINTENANCE_SERVICE_EVENT_ALREADY_LINKED',
      'ServiceEvent is already linked to another Maintenance WorkOrder.',
    );
  }
  const link = createMaintenanceWorkOrderServiceEventLink({
    issue,
    workOrder: order,
    serviceEvent: event,
    linkedAt: deps.clock.now(),
    linkedByUserId: actor.userId,
  });
  await deps.maintenanceRepository.insertServiceEventLink(link);
  return link;
}
