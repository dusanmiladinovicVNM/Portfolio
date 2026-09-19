import { DomainError } from '../shared/domain-error.js';
import type {
  AssetId,
  InspectionFindingId,
  MaintenanceIssueId,
  MaintenanceWorkOrderId,
  PartyId,
  PropertyId,
  ServiceEventId,
  SpaceId,
  UnitId,
  UserId,
} from '../shared/entity-id.js';

export const MAINTENANCE_ISSUE_PRIORITIES = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;

export const MAINTENANCE_ISSUE_STATUSES = [
  'open',
  'resolved',
  'cancelled',
] as const;

export const MAINTENANCE_WORK_ORDER_STATUSES = [
  'draft',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type MaintenanceIssuePriority =
  (typeof MAINTENANCE_ISSUE_PRIORITIES)[number];
export type MaintenanceIssueStatus =
  (typeof MAINTENANCE_ISSUE_STATUSES)[number];
export type MaintenanceWorkOrderStatus =
  (typeof MAINTENANCE_WORK_ORDER_STATUSES)[number];

export type MaintenanceAssignee =
  | { readonly kind: 'user'; readonly userId: UserId }
  | { readonly kind: 'party'; readonly partyId: PartyId };

export interface MaintenanceIssue {
  readonly id: MaintenanceIssueId;
  readonly code: string;
  readonly propertyId: PropertyId;
  readonly unitId: UnitId | null;
  readonly spaceId: SpaceId | null;
  readonly assetId: AssetId | null;
  readonly inspectionFindingId: InspectionFindingId | null;
  readonly reportedAt: string;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
  readonly title: string;
  readonly description: string | null;
  readonly priority: MaintenanceIssuePriority;
  readonly status: MaintenanceIssueStatus;
  readonly resolvedAt: string | null;
  readonly cancelledAt: string | null;
  readonly version: number;
}

export interface MaintenanceWorkOrder {
  readonly id: MaintenanceWorkOrderId;
  readonly issueId: MaintenanceIssueId;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly assignee: MaintenanceAssignee | null;
  readonly status: MaintenanceWorkOrderStatus;
  readonly assignedAt: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly createdByUserId: UserId;
}

export interface MaintenanceWorkOrderServiceEventLink {
  readonly workOrderId: MaintenanceWorkOrderId;
  readonly serviceEventId: ServiceEventId;
  readonly linkedAt: string;
  readonly linkedByUserId: UserId;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('MAINTENANCE_REQUIRED_FIELD', `${field} is required.`);
  }
  return normalized;
}

function optional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function instant(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'MAINTENANCE_INVALID_TIMESTAMP',
      `${field} must be a valid ISO timestamp.`,
    );
  }
  return value;
}

function assertNotBefore(
  value: string,
  notBefore: string,
  field: string,
  predecessor: string,
): void {
  if (Date.parse(value) < Date.parse(notBefore)) {
    throw new DomainError(
      'MAINTENANCE_TIMESTAMP_ORDER_INVALID',
      `${field} cannot be before ${predecessor}.`,
    );
  }
}

function latestWorkOrderTerminalAt(
  orders: readonly MaintenanceWorkOrder[],
): string | null {
  const terminal = orders.flatMap((order) => {
    const value =
      order.status === 'completed'
        ? order.completedAt
        : order.status === 'cancelled'
          ? order.cancelledAt
          : null;
    return value === null ? [] : [value];
  });
  if (terminal.length === 0) return null;
  return terminal.reduce((latest, value) =>
    Date.parse(value) > Date.parse(latest) ? value : latest,
  );
}

export function createMaintenanceIssue(input: {
  readonly id: MaintenanceIssueId;
  readonly code: string;
  readonly propertyId: PropertyId;
  readonly unitId?: UnitId | null;
  readonly spaceId?: SpaceId | null;
  readonly assetId?: AssetId | null;
  readonly inspectionFindingId?: InspectionFindingId | null;
  readonly title: string;
  readonly description?: string | null;
  readonly priority: MaintenanceIssuePriority;
  readonly reportedAt: string;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}): MaintenanceIssue {
  if (input.spaceId != null && input.unitId == null) {
    throw new DomainError(
      'MAINTENANCE_SPACE_REQUIRES_UNIT',
      'Maintenance Issue Space scope requires Unit scope.',
    );
  }
  const reportedAt = instant(input.reportedAt, 'reportedAt');
  const recordedAt = instant(input.recordedAt, 'recordedAt');
  assertNotBefore(recordedAt, reportedAt, 'recordedAt', 'reportedAt');

  return {
    id: input.id,
    code: required(input.code, 'code'),
    propertyId: input.propertyId,
    unitId: input.unitId ?? null,
    spaceId: input.spaceId ?? null,
    assetId: input.assetId ?? null,
    inspectionFindingId: input.inspectionFindingId ?? null,
    reportedAt,
    recordedAt,
    recordedByUserId: input.recordedByUserId,
    title: required(input.title, 'title'),
    description: optional(input.description),
    priority: input.priority,
    status: 'open',
    resolvedAt: null,
    cancelledAt: null,
    version: 1,
  };
}

export function updateMaintenanceIssue(
  issue: MaintenanceIssue,
  input: {
    readonly title?: string;
    readonly description?: string | null;
    readonly priority?: MaintenanceIssuePriority;
  },
): MaintenanceIssue {
  if (issue.status !== 'open') {
    throw new DomainError(
      'MAINTENANCE_ISSUE_TERMINAL',
      'A resolved or cancelled Maintenance Issue cannot be edited.',
    );
  }
  const title = input.title === undefined ? issue.title : required(input.title, 'title');
  const description =
    input.description === undefined ? issue.description : optional(input.description);
  const priority = input.priority ?? issue.priority;

  if (
    title === issue.title &&
    description === issue.description &&
    priority === issue.priority
  ) {
    return issue;
  }
  return { ...issue, title, description, priority, version: issue.version + 1 };
}

export function resolveMaintenanceIssue(
  issue: MaintenanceIssue,
  orders: readonly MaintenanceWorkOrder[],
  resolvedAtValue: string,
): MaintenanceIssue {
  if (issue.status !== 'open') {
    throw new DomainError(
      'MAINTENANCE_ISSUE_INVALID_TRANSITION',
      `Cannot resolve Maintenance Issue from ${issue.status}.`,
    );
  }
  if (!orders.some((order) => order.status === 'completed')) {
    throw new DomainError(
      'MAINTENANCE_ISSUE_COMPLETED_WORK_REQUIRED',
      'Resolving a Maintenance Issue requires at least one completed WorkOrder.',
    );
  }
  if (!orders.every((order) => order.status === 'completed' || order.status === 'cancelled')) {
    throw new DomainError(
      'MAINTENANCE_ISSUE_OPEN_WORK_ORDERS',
      'All WorkOrders must be terminal before resolving the Issue.',
    );
  }
  const resolvedAt = instant(resolvedAtValue, 'resolvedAt');
  assertNotBefore(resolvedAt, issue.recordedAt, 'resolvedAt', 'recordedAt');
  const latestChild = latestWorkOrderTerminalAt(orders);
  if (latestChild !== null) {
    assertNotBefore(resolvedAt, latestChild, 'resolvedAt', 'latest WorkOrder terminal time');
  }
  return {
    ...issue,
    status: 'resolved',
    resolvedAt,
    version: issue.version + 1,
  };
}

export function cancelMaintenanceIssue(
  issue: MaintenanceIssue,
  orders: readonly MaintenanceWorkOrder[],
  cancelledAtValue: string,
): MaintenanceIssue {
  if (issue.status !== 'open') {
    throw new DomainError(
      'MAINTENANCE_ISSUE_INVALID_TRANSITION',
      `Cannot cancel Maintenance Issue from ${issue.status}.`,
    );
  }
  if (!orders.every((order) => order.status === 'cancelled')) {
    throw new DomainError(
      'MAINTENANCE_ISSUE_NON_CANCELLED_WORK_ORDERS',
      'Every existing WorkOrder must be cancelled before cancelling the Issue.',
    );
  }
  const cancelledAt = instant(cancelledAtValue, 'cancelledAt');
  assertNotBefore(cancelledAt, issue.recordedAt, 'cancelledAt', 'recordedAt');
  const latestChild = latestWorkOrderTerminalAt(orders);
  if (latestChild !== null) {
    assertNotBefore(cancelledAt, latestChild, 'cancelledAt', 'latest WorkOrder terminal time');
  }
  return {
    ...issue,
    status: 'cancelled',
    cancelledAt,
    version: issue.version + 1,
  };
}

export function createMaintenanceWorkOrder(input: {
  readonly id: MaintenanceWorkOrderId;
  readonly issue: MaintenanceIssue;
  readonly code: string;
  readonly title: string;
  readonly description?: string | null;
  readonly createdAt: string;
  readonly createdByUserId: UserId;
}): MaintenanceWorkOrder {
  if (input.issue.status !== 'open') {
    throw new DomainError(
      'MAINTENANCE_ISSUE_TERMINAL',
      'WorkOrders can only be created for an open Maintenance Issue.',
    );
  }
  const createdAt = instant(input.createdAt, 'createdAt');
  assertNotBefore(createdAt, input.issue.recordedAt, 'createdAt', 'Issue.recordedAt');

  return {
    id: input.id,
    issueId: input.issue.id,
    code: required(input.code, 'code'),
    title: required(input.title, 'title'),
    description: optional(input.description),
    assignee: null,
    status: 'draft',
    assignedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    version: 1,
    createdAt,
    createdByUserId: input.createdByUserId,
  };
}

export function updateMaintenanceWorkOrder(
  order: MaintenanceWorkOrder,
  input: { readonly title?: string; readonly description?: string | null },
): MaintenanceWorkOrder {
  if (order.status !== 'draft' && order.status !== 'assigned') {
    throw new DomainError(
      'MAINTENANCE_WORK_ORDER_DEFINITION_FROZEN',
      'WorkOrder definition is frozen once work starts.',
    );
  }
  const title = input.title === undefined ? order.title : required(input.title, 'title');
  const description =
    input.description === undefined ? order.description : optional(input.description);
  if (title === order.title && description === order.description) return order;
  return { ...order, title, description, version: order.version + 1 };
}

export function assignMaintenanceWorkOrder(
  order: MaintenanceWorkOrder,
  assignee: MaintenanceAssignee,
  assignedAtValue: string,
): MaintenanceWorkOrder {
  if (order.status !== 'draft' && order.status !== 'assigned') {
    throw new DomainError(
      'MAINTENANCE_WORK_ORDER_INVALID_TRANSITION',
      'Only a draft or assigned WorkOrder can be assigned or reassigned.',
    );
  }
  const assignedAt = instant(assignedAtValue, 'assignedAt');
  assertNotBefore(assignedAt, order.createdAt, 'assignedAt', 'createdAt');
  return {
    ...order,
    assignee,
    status: 'assigned',
    assignedAt,
    version: order.version + 1,
  };
}

export function startMaintenanceWorkOrder(
  order: MaintenanceWorkOrder,
  startedAtValue: string,
): MaintenanceWorkOrder {
  if (order.status !== 'assigned' || order.assignee === null || order.assignedAt === null) {
    throw new DomainError(
      'MAINTENANCE_WORK_ORDER_INVALID_TRANSITION',
      'Only an assigned WorkOrder can start.',
    );
  }
  const startedAt = instant(startedAtValue, 'startedAt');
  assertNotBefore(startedAt, order.assignedAt, 'startedAt', 'assignedAt');
  return { ...order, status: 'in_progress', startedAt, version: order.version + 1 };
}

export function completeMaintenanceWorkOrder(
  order: MaintenanceWorkOrder,
  completedAtValue: string,
): MaintenanceWorkOrder {
  if (order.status !== 'in_progress' || order.startedAt === null) {
    throw new DomainError(
      'MAINTENANCE_WORK_ORDER_INVALID_TRANSITION',
      'Only an in-progress WorkOrder can complete.',
    );
  }
  const completedAt = instant(completedAtValue, 'completedAt');
  assertNotBefore(completedAt, order.startedAt, 'completedAt', 'startedAt');
  return {
    ...order,
    status: 'completed',
    completedAt,
    version: order.version + 1,
  };
}

export function cancelMaintenanceWorkOrder(
  order: MaintenanceWorkOrder,
  hasServiceEventLinks: boolean,
  cancelledAtValue: string,
): MaintenanceWorkOrder {
  if (!['draft', 'assigned', 'in_progress'].includes(order.status)) {
    throw new DomainError(
      'MAINTENANCE_WORK_ORDER_INVALID_TRANSITION',
      `Cannot cancel WorkOrder from ${order.status}.`,
    );
  }
  if (hasServiceEventLinks) {
    throw new DomainError(
      'MAINTENANCE_WORK_ORDER_HAS_SERVICE_EVENTS',
      'A WorkOrder with linked ServiceEvents cannot be cancelled.',
    );
  }
  const cancelledAt = instant(cancelledAtValue, 'cancelledAt');
  const predecessor = order.startedAt ?? order.assignedAt ?? order.createdAt;
  assertNotBefore(cancelledAt, predecessor, 'cancelledAt', 'latest WorkOrder lifecycle time');
  return {
    ...order,
    status: 'cancelled',
    cancelledAt,
    version: order.version + 1,
  };
}

export function createMaintenanceWorkOrderServiceEventLink(input: {
  readonly issue: MaintenanceIssue;
  readonly workOrder: MaintenanceWorkOrder;
  readonly serviceEvent: {
    readonly id: ServiceEventId;
    readonly assetId: AssetId;
    readonly performedAt: string;
  };
  readonly linkedAt: string;
  readonly linkedByUserId: UserId;
}): MaintenanceWorkOrderServiceEventLink {
  if (input.issue.assetId === null) {
    throw new DomainError(
      'MAINTENANCE_SERVICE_EVENT_ASSET_REQUIRED',
      'Only an Asset-scoped Maintenance Issue can link ServiceEvents.',
    );
  }
  if (input.serviceEvent.assetId !== input.issue.assetId) {
    throw new DomainError(
      'MAINTENANCE_SERVICE_EVENT_ASSET_MISMATCH',
      'ServiceEvent Asset must match the Maintenance Issue Asset.',
    );
  }
  if (
    input.workOrder.status !== 'in_progress' &&
    input.workOrder.status !== 'completed'
  ) {
    throw new DomainError(
      'MAINTENANCE_SERVICE_EVENT_WORK_ORDER_STATE_INVALID',
      'ServiceEvents can only link to an in-progress or completed WorkOrder.',
    );
  }
  if (input.workOrder.startedAt === null) {
    throw new DomainError(
      'MAINTENANCE_WORK_ORDER_INVALID_STATE',
      'Started WorkOrder timestamp is missing.',
    );
  }
  if (Date.parse(input.serviceEvent.performedAt) < Date.parse(input.workOrder.startedAt)) {
    throw new DomainError(
      'MAINTENANCE_SERVICE_EVENT_BEFORE_WORK_ORDER',
      'ServiceEvent performedAt cannot predate WorkOrder startedAt.',
    );
  }
  if (
    input.workOrder.completedAt !== null &&
    Date.parse(input.serviceEvent.performedAt) > Date.parse(input.workOrder.completedAt)
  ) {
    throw new DomainError(
      'MAINTENANCE_SERVICE_EVENT_AFTER_WORK_ORDER',
      'ServiceEvent performedAt cannot be after WorkOrder completedAt.',
    );
  }
  return {
    workOrderId: input.workOrder.id,
    serviceEventId: input.serviceEvent.id,
    linkedAt: instant(input.linkedAt, 'linkedAt'),
    linkedByUserId: input.linkedByUserId,
  };
}
