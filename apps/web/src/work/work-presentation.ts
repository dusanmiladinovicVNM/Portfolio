import {
  type OperationalWorkItemResponse,
  type WorkOccupancyItemResponse,
  type WORK_ATTENTION_VALUES,
} from '@portfolio/contracts';
import {
  propertyRoute,
  unitRoute,
  type WorkspaceRoute,
} from '../navigation/workspace-route.js';

export type WorkAttention =
  (typeof WORK_ATTENTION_VALUES)[number];

export function workAttentionLabel(value: WorkAttention): string {
  switch (value) {
    case 'urgent':
      return 'Urgent';
    case 'overdue':
      return 'Overdue';
    case 'today':
      return 'Today';
    case 'high':
      return 'High';
    case 'upcoming':
      return 'Upcoming';
    case 'normal':
      return 'Normal';
    case 'unscheduled':
      return 'Unscheduled';
  }
}

export function workDomainLabel(
  value: OperationalWorkItemResponse['kind'],
): string {
  switch (value) {
    case 'inspection':
      return 'Inspection';
    case 'maintenance':
      return 'Maintenance';
    case 'occupancy':
      return 'Occupancy & contract';
  }
}

export function workOccupancyReasonLabel(
  reason: WorkOccupancyItemResponse['reason'],
): string {
  switch (reason) {
    case 'contract_missing':
      return 'Contract coverage missing';
    case 'contract_draft':
      return 'Draft agreement';
    case 'move_out':
      return 'Move-out';
  }
}

export function workItemKey(item: OperationalWorkItemResponse): string {
  switch (item.kind) {
    case 'inspection':
      return `inspection:${item.inspectionId}`;
    case 'maintenance':
      return `maintenance:${item.issueId}`;
    case 'occupancy':
      return `occupancy:${item.reason}:${item.tenancyId}:${item.agreementId ?? 'none'}`;
  }
}

export function workItemCode(item: OperationalWorkItemResponse): string {
  switch (item.kind) {
    case 'inspection':
      return item.inspectionCode;
    case 'maintenance':
      return item.issueCode;
    case 'occupancy':
      return item.tenancyCode;
  }
}

export function workItemActionLabel(
  item: OperationalWorkItemResponse,
): string {
  switch (item.kind) {
    case 'inspection':
      return 'Open Inspection';
    case 'maintenance':
      return 'Open Maintenance';
    case 'occupancy':
      return item.reason === 'move_out'
        ? 'Open Tenancy'
        : 'Open Contracts';
  }
}

export function workItemRoute(
  item: OperationalWorkItemResponse,
  asOf: string,
): WorkspaceRoute {
  if (item.kind === 'inspection') {
    return unitRoute(
      item.propertyId,
      item.unitId,
      asOf,
      'inspections',
      { inspectionId: item.inspectionId },
    );
  }

  if (item.kind === 'maintenance') {
    return item.unitId === null
      ? propertyRoute(item.propertyId, asOf, {
          maintenanceIssueId: item.issueId,
        })
      : unitRoute(
          item.propertyId,
          item.unitId,
          asOf,
          'maintenance',
          { maintenanceIssueId: item.issueId },
        );
  }

  return item.reason === 'move_out'
    ? unitRoute(
        item.propertyId,
        item.unitId,
        asOf,
        'tenancies',
      )
    : unitRoute(
        item.propertyId,
        item.unitId,
        asOf,
        'contracts',
        {
          tenancyId: item.tenancyId,
          ...(item.agreementId
            ? { agreementId: item.agreementId }
            : {}),
        },
      );
}
