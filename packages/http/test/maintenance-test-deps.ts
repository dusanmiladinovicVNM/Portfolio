import { DomainError } from '@portfolio/domain';
import type { MaintenanceRepository } from '@portfolio/application';
import type {
  AssetId,
  InspectionFindingId,
  MaintenanceIssue,
  MaintenanceIssueId,
  MaintenanceWorkOrder,
  MaintenanceWorkOrderId,
  MaintenanceWorkOrderServiceEventLink,
  PropertyId,
  ServiceEventId,
  UnitId,
} from '@portfolio/domain';

export class InMemoryMaintenanceRepository implements MaintenanceRepository {
  readonly issues = new Map<MaintenanceIssueId, MaintenanceIssue>();
  readonly workOrders = new Map<MaintenanceWorkOrderId, MaintenanceWorkOrder>();
  readonly serviceLinks: MaintenanceWorkOrderServiceEventLink[] = [];

  async getIssueById(id: MaintenanceIssueId) {
    return this.issues.get(id) ?? null;
  }

  async getIssueByInspectionFindingId(findingId: InspectionFindingId) {
    return (
      [...this.issues.values()].find(
        (issue) => issue.inspectionFindingId === findingId,
      ) ?? null
    );
  }

  async listIssuesByProperty(propertyId: PropertyId) {
    return [...this.issues.values()].filter(
      (issue) => issue.propertyId === propertyId,
    );
  }

  async listIssuesByUnit(unitId: UnitId) {
    return [...this.issues.values()].filter((issue) => issue.unitId === unitId);
  }

  async listIssuesByAsset(assetId: AssetId) {
    return [...this.issues.values()].filter((issue) => issue.assetId === assetId);
  }

  async issueCodeExists(code: string) {
    return [...this.issues.values()].some(
      (issue) => issue.code.toLowerCase() === code.toLowerCase(),
    );
  }

  async insertIssue(issue: MaintenanceIssue) {
    if (await this.issueCodeExists(issue.code)) {
      throw new DomainError(
        'MAINTENANCE_ISSUE_ALREADY_EXISTS',
        'Maintenance Issue code already exists.',
      );
    }
    if (
      issue.inspectionFindingId !== null &&
      (await this.getIssueByInspectionFindingId(issue.inspectionFindingId))
    ) {
      throw new DomainError(
        'MAINTENANCE_FINDING_ALREADY_LINKED',
        'Inspection Finding already originated a Maintenance Issue.',
      );
    }
    this.issues.set(issue.id, issue);
  }

  async updateIssue(issue: MaintenanceIssue, expectedVersion: number) {
    const current = this.issues.get(issue.id);
    if (!current || current.version !== expectedVersion) {
      throw new DomainError(
        'MAINTENANCE_ISSUE_VERSION_CONFLICT',
        'Maintenance Issue was modified concurrently.',
      );
    }
    this.issues.set(issue.id, issue);
  }

  async getWorkOrderById(id: MaintenanceWorkOrderId) {
    return this.workOrders.get(id) ?? null;
  }

  async listWorkOrdersByIssue(issueId: MaintenanceIssueId) {
    return [...this.workOrders.values()].filter(
      (order) => order.issueId === issueId,
    );
  }

  async workOrderCodeExists(code: string) {
    return [...this.workOrders.values()].some(
      (order) => order.code.toLowerCase() === code.toLowerCase(),
    );
  }

  async insertWorkOrder(workOrder: MaintenanceWorkOrder) {
    if (await this.workOrderCodeExists(workOrder.code)) {
      throw new DomainError(
        'MAINTENANCE_WORK_ORDER_ALREADY_EXISTS',
        'Maintenance WorkOrder code already exists.',
      );
    }
    this.workOrders.set(workOrder.id, workOrder);
  }

  async updateWorkOrder(
    workOrder: MaintenanceWorkOrder,
    expectedVersion: number,
  ) {
    const current = this.workOrders.get(workOrder.id);
    if (!current || current.version !== expectedVersion) {
      throw new DomainError(
        'MAINTENANCE_WORK_ORDER_VERSION_CONFLICT',
        'Maintenance WorkOrder was modified concurrently.',
      );
    }
    this.workOrders.set(workOrder.id, workOrder);
  }

  async insertServiceEventLink(link: MaintenanceWorkOrderServiceEventLink) {
    if (await this.serviceEventIsLinked(link.serviceEventId)) {
      throw new DomainError(
        'MAINTENANCE_SERVICE_EVENT_ALREADY_LINKED',
        'ServiceEvent is already linked to another Maintenance WorkOrder.',
      );
    }
    this.serviceLinks.push(link);
  }

  async listServiceEventIdsByWorkOrder(workOrderId: MaintenanceWorkOrderId) {
    return this.serviceLinks
      .filter((link) => link.workOrderId === workOrderId)
      .map((link) => link.serviceEventId);
  }

  async serviceEventIsLinked(serviceEventId: ServiceEventId) {
    return this.serviceLinks.some(
      (link) => link.serviceEventId === serviceEventId,
    );
  }
}
