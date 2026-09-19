import { DomainError, type AssetId, type MaintenanceIssueId, type MaintenanceWorkOrderId, type PropertyId, type UnitId } from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { MaintenanceRepository } from './maintenance-repository.js';

export async function getMaintenanceIssueQuery(
  repository: MaintenanceRepository,
  actor: Actor,
  id: MaintenanceIssueId,
) {
  requireCapability(actor, 'maintenance:read');
  const issue = await repository.getIssueById(id);
  if (!issue) {
    throw new DomainError(
      'MAINTENANCE_ISSUE_NOT_FOUND',
      'Maintenance Issue not found.',
    );
  }
  return issue;
}

export async function listMaintenanceIssuesByPropertyQuery(
  repository: MaintenanceRepository,
  actor: Actor,
  propertyId: PropertyId,
) {
  requireCapability(actor, 'maintenance:read');
  return repository.listIssuesByProperty(propertyId);
}

export async function listMaintenanceIssuesByUnitQuery(
  repository: MaintenanceRepository,
  actor: Actor,
  unitId: UnitId,
) {
  requireCapability(actor, 'maintenance:read');
  return repository.listIssuesByUnit(unitId);
}

export async function listMaintenanceIssuesByAssetQuery(
  repository: MaintenanceRepository,
  actor: Actor,
  assetId: AssetId,
) {
  requireCapability(actor, 'maintenance:read');
  return repository.listIssuesByAsset(assetId);
}

export async function getMaintenanceWorkOrderQuery(
  repository: MaintenanceRepository,
  actor: Actor,
  id: MaintenanceWorkOrderId,
) {
  requireCapability(actor, 'maintenance:read');
  const order = await repository.getWorkOrderById(id);
  if (!order) {
    throw new DomainError(
      'MAINTENANCE_WORK_ORDER_NOT_FOUND',
      'Maintenance WorkOrder not found.',
    );
  }
  return {
    workOrder: order,
    serviceEventIds: await repository.listServiceEventIdsByWorkOrder(id),
  };
}

export async function listMaintenanceWorkOrdersQuery(
  repository: MaintenanceRepository,
  actor: Actor,
  issueId: MaintenanceIssueId,
) {
  requireCapability(actor, 'maintenance:read');
  if (!(await repository.getIssueById(issueId))) {
    throw new DomainError(
      'MAINTENANCE_ISSUE_NOT_FOUND',
      'Maintenance Issue not found.',
    );
  }
  const orders = await repository.listWorkOrdersByIssue(issueId);
  return Promise.all(
    orders.map(async (workOrder) => ({
      workOrder,
      serviceEventIds: await repository.listServiceEventIdsByWorkOrder(
        workOrder.id,
      ),
    })),
  );
}
