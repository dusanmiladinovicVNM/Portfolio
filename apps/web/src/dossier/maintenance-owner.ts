import type {
  InspectionBundleResponse,
  MaintenanceIssueResponse,
  MaintenanceWorkOrderEntryResponse,
  MaintenanceWorkOrderResponse,
  ServiceEventResponse,
} from '@portfolio/contracts';

export function assertUnitMaintenanceIssuesOwner(
  unitId: string,
  issues: readonly MaintenanceIssueResponse[],
): void {
  if (issues.some((issue) => issue.unitId !== unitId)) {
    throw new Error(
      'Unit Maintenance list contains an Issue owned by another Unit.',
    );
  }
}

export function assertMaintenanceIssueOwner(
  unitId: string,
  issueId: string,
  issue: MaintenanceIssueResponse,
): void {
  if (issue.id !== issueId || issue.unitId !== unitId) {
    throw new Error(
      'Maintenance Issue response does not match the selected Unit/Issue owner.',
    );
  }
}

export function assertMaintenanceWorkOrdersOwner(
  issueId: string,
  entries: readonly MaintenanceWorkOrderEntryResponse[],
): void {
  if (entries.some((entry) => entry.workOrder.issueId !== issueId)) {
    throw new Error(
      'Maintenance WorkOrder list contains an order owned by another Issue.',
    );
  }
}

export function assertMaintenanceWorkOrderOwner(
  issueId: string,
  workOrderId: string,
  workOrder: MaintenanceWorkOrderResponse,
): void {
  if (workOrder.id !== workOrderId || workOrder.issueId !== issueId) {
    throw new Error(
      'Maintenance WorkOrder response does not match the selected Issue/WorkOrder owner.',
    );
  }
}

export function assertServiceEventsOwner(
  assetId: string,
  events: readonly ServiceEventResponse[],
): void {
  if (events.some((event) => event.assetId !== assetId)) {
    throw new Error(
      'Maintenance ServiceEvent list contains an event owned by another Asset.',
    );
  }
}

export function assertInspectionBundleUnitOwner(
  unitId: string,
  bundle: InspectionBundleResponse,
): void {
  if (bundle.inspection.unitId !== unitId) {
    throw new Error(
      'Maintenance finding source comes from an Inspection owned by another Unit.',
    );
  }
  if (
    bundle.findings.some(
      (finding) => finding.inspectionId !== bundle.inspection.id,
    )
  ) {
    throw new Error(
      'Inspection bundle contains a Finding owned by another Inspection.',
    );
  }
}

function sameIssueImmutableIdentity(
  current: MaintenanceIssueResponse,
  response: MaintenanceIssueResponse,
): boolean {
  return (
    response.id === current.id &&
    response.code === current.code &&
    response.propertyId === current.propertyId &&
    response.unitId === current.unitId &&
    response.spaceId === current.spaceId &&
    response.assetId === current.assetId &&
    response.inspectionFindingId === current.inspectionFindingId &&
    response.reportedAt === current.reportedAt &&
    response.recordedAt === current.recordedAt &&
    response.recordedByUserId === current.recordedByUserId
  );
}

export function assertCreatedMaintenanceIssue(
  expected: {
    readonly code: string;
    readonly propertyId: string;
    readonly unitId: string;
    readonly spaceId: string | null;
    readonly assetId: string | null;
    readonly inspectionFindingId: string | null;
    readonly title: string;
    readonly description: string | null;
    readonly priority: MaintenanceIssueResponse['priority'];
  },
  issue: MaintenanceIssueResponse,
): void {
  if (
    issue.code !== expected.code ||
    issue.propertyId !== expected.propertyId ||
    issue.unitId !== expected.unitId ||
    issue.spaceId !== expected.spaceId ||
    issue.assetId !== expected.assetId ||
    issue.inspectionFindingId !== expected.inspectionFindingId ||
    issue.title !== expected.title ||
    issue.description !== expected.description ||
    issue.priority !== expected.priority ||
    issue.status !== 'open' ||
    issue.resolvedAt !== null ||
    issue.cancelledAt !== null ||
    issue.version !== 1
  ) {
    throw new Error(
      'Created Maintenance Issue does not match submitted canonical scope.',
    );
  }
}

export function assertMaintenanceIssueUpdate(
  current: MaintenanceIssueResponse,
  expected: {
    readonly title: string;
    readonly description: string | null;
    readonly priority: MaintenanceIssueResponse['priority'];
  },
  response: MaintenanceIssueResponse,
): void {
  if (!sameIssueImmutableIdentity(current, response)) {
    throw new Error('Maintenance Issue update changed immutable Issue identity.');
  }
  if (
    response.title !== expected.title ||
    response.description !== expected.description ||
    response.priority !== expected.priority ||
    response.status !== current.status ||
    response.version !== current.version + 1
  ) {
    throw new Error(
      'Maintenance Issue update does not match requested correction.',
    );
  }
}

export function assertMaintenanceIssueTerminal(
  current: MaintenanceIssueResponse,
  action: 'resolve' | 'cancel',
  response: MaintenanceIssueResponse,
): void {
  if (!sameIssueImmutableIdentity(current, response)) {
    throw new Error(
      'Maintenance Issue terminal response changed immutable Issue identity.',
    );
  }
  const expectedStatus = action === 'resolve' ? 'resolved' : 'cancelled';
  if (
    response.status !== expectedStatus ||
    response.version !== current.version + 1 ||
    (action === 'resolve'
      ? response.resolvedAt === null || response.cancelledAt !== null
      : response.cancelledAt === null || response.resolvedAt !== null)
  ) {
    throw new Error(
      'Maintenance Issue terminal response does not match requested action.',
    );
  }
}

function sameWorkOrderImmutableIdentity(
  current: MaintenanceWorkOrderResponse,
  response: MaintenanceWorkOrderResponse,
): boolean {
  return (
    response.id === current.id &&
    response.issueId === current.issueId &&
    response.code === current.code &&
    response.createdAt === current.createdAt &&
    response.createdByUserId === current.createdByUserId
  );
}

export function assertCreatedMaintenanceWorkOrder(
  issueId: string,
  expected: {
    readonly code: string;
    readonly title: string;
    readonly description: string | null;
  },
  workOrder: MaintenanceWorkOrderResponse,
): void {
  if (
    workOrder.issueId !== issueId ||
    workOrder.code !== expected.code ||
    workOrder.title !== expected.title ||
    workOrder.description !== expected.description ||
    workOrder.assignee !== null ||
    workOrder.status !== 'draft' ||
    workOrder.assignedAt !== null ||
    workOrder.startedAt !== null ||
    workOrder.completedAt !== null ||
    workOrder.cancelledAt !== null ||
    workOrder.version !== 1
  ) {
    throw new Error(
      'Created Maintenance WorkOrder does not match submitted task.',
    );
  }
}

export function assertMaintenanceWorkOrderUpdate(
  current: MaintenanceWorkOrderResponse,
  expected: {
    readonly title: string;
    readonly description: string | null;
  },
  response: MaintenanceWorkOrderResponse,
): void {
  if (!sameWorkOrderImmutableIdentity(current, response)) {
    throw new Error(
      'Maintenance WorkOrder update changed immutable task identity.',
    );
  }
  if (
    response.title !== expected.title ||
    response.description !== expected.description ||
    response.assignee?.kind !== current.assignee?.kind ||
    (response.assignee?.kind === 'party' &&
      current.assignee?.kind === 'party' &&
      response.assignee.partyId !== current.assignee.partyId) ||
    (response.assignee?.kind === 'user' &&
      current.assignee?.kind === 'user' &&
      response.assignee.userId !== current.assignee.userId) ||
    response.status !== current.status ||
    response.version !== current.version + 1
  ) {
    throw new Error(
      'Maintenance WorkOrder update does not match requested correction.',
    );
  }
}

export function assertMaintenanceWorkOrderAssignment(
  current: MaintenanceWorkOrderResponse,
  partyId: string,
  response: MaintenanceWorkOrderResponse,
): void {
  if (!sameWorkOrderImmutableIdentity(current, response)) {
    throw new Error(
      'Maintenance WorkOrder assignment changed immutable task identity.',
    );
  }
  if (
    response.assignee?.kind !== 'party' ||
    response.assignee.partyId !== partyId ||
    response.status !== 'assigned' ||
    response.assignedAt === null ||
    response.version !== current.version + 1
  ) {
    throw new Error(
      'Maintenance WorkOrder assignment response does not match assignee.',
    );
  }
}

export function assertMaintenanceWorkOrderTransition(
  current: MaintenanceWorkOrderResponse,
  action: 'start' | 'complete' | 'cancel',
  response: MaintenanceWorkOrderResponse,
): void {
  if (!sameWorkOrderImmutableIdentity(current, response)) {
    throw new Error(
      'Maintenance WorkOrder transition changed immutable task identity.',
    );
  }
  const status =
    action === 'start'
      ? 'in_progress'
      : action === 'complete'
        ? 'completed'
        : 'cancelled';
  if (response.status !== status || response.version !== current.version + 1) {
    throw new Error(
      'Maintenance WorkOrder transition response has the wrong lifecycle state.',
    );
  }
  if (action === 'start' && response.startedAt === null) {
    throw new Error('Started WorkOrder response is missing startedAt.');
  }
  if (action === 'complete' && response.completedAt === null) {
    throw new Error('Completed WorkOrder response is missing completedAt.');
  }
  if (action === 'cancel' && response.cancelledAt === null) {
    throw new Error('Cancelled WorkOrder response is missing cancelledAt.');
  }
}
