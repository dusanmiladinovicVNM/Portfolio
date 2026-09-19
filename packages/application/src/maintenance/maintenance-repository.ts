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

export interface MaintenanceRepository {
  getIssueById(id: MaintenanceIssueId): Promise<MaintenanceIssue | null>;
  getIssueByInspectionFindingId(
    findingId: InspectionFindingId,
  ): Promise<MaintenanceIssue | null>;
  listIssuesByProperty(
    propertyId: PropertyId,
  ): Promise<readonly MaintenanceIssue[]>;
  listIssuesByUnit(unitId: UnitId): Promise<readonly MaintenanceIssue[]>;
  listIssuesByAsset(assetId: AssetId): Promise<readonly MaintenanceIssue[]>;
  issueCodeExists(code: string): Promise<boolean>;
  insertIssue(issue: MaintenanceIssue): Promise<void>;
  updateIssue(issue: MaintenanceIssue, expectedVersion: number): Promise<void>;

  getWorkOrderById(
    id: MaintenanceWorkOrderId,
  ): Promise<MaintenanceWorkOrder | null>;
  listWorkOrdersByIssue(
    issueId: MaintenanceIssueId,
  ): Promise<readonly MaintenanceWorkOrder[]>;
  workOrderCodeExists(code: string): Promise<boolean>;
  insertWorkOrder(workOrder: MaintenanceWorkOrder): Promise<void>;
  updateWorkOrder(
    workOrder: MaintenanceWorkOrder,
    expectedVersion: number,
  ): Promise<void>;

  insertServiceEventLink(
    link: MaintenanceWorkOrderServiceEventLink,
  ): Promise<void>;
  listServiceEventIdsByWorkOrder(
    workOrderId: MaintenanceWorkOrderId,
  ): Promise<readonly ServiceEventId[]>;
  serviceEventIsLinked(serviceEventId: ServiceEventId): Promise<boolean>;
}
