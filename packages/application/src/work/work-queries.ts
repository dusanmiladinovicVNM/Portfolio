import {
  asDateOnly,
  type DateOnly,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type {
  WorkInspectionProjection,
  WorkMaintenanceProjection,
  WorkOccupancyProjection,
  WorkRepository,
} from './work-repository.js';

export const WORK_ATTENTION = [
  'urgent',
  'overdue',
  'today',
  'high',
  'upcoming',
  'normal',
  'unscheduled',
] as const;

export type WorkAttention = (typeof WORK_ATTENTION)[number];

export interface WorkInspectionItem extends WorkInspectionProjection {
  readonly attention: WorkAttention;
}

export interface WorkMaintenanceItem
  extends Omit<WorkMaintenanceProjection, 'assignedUserIds'> {
  readonly attention: WorkAttention;
}

export interface WorkOccupancyItem extends WorkOccupancyProjection {
  readonly attention: WorkAttention;
}

export type OperationalWorkItem =
  | WorkInspectionItem
  | WorkMaintenanceItem
  | WorkOccupancyItem;

export interface OperationalWorkQueue {
  readonly referenceDate: DateOnly;
  readonly items: readonly OperationalWorkItem[];
}

const attentionRank: Readonly<Record<WorkAttention, number>> = {
  urgent: 0,
  overdue: 1,
  today: 2,
  high: 3,
  upcoming: 4,
  normal: 5,
  unscheduled: 6,
};

function dateAttention(
  dueDate: DateOnly | null,
  referenceDate: DateOnly,
): WorkAttention {
  if (dueDate === null) return 'unscheduled';
  if (dueDate < referenceDate) return 'overdue';
  if (dueDate === referenceDate) return 'today';
  return 'upcoming';
}

function inspectionItem(
  item: WorkInspectionProjection,
  referenceDate: DateOnly,
): WorkInspectionItem {
  return {
    ...item,
    attention: dateAttention(item.scheduledFor, referenceDate),
  };
}

function maintenanceItem(
  item: WorkMaintenanceProjection,
): WorkMaintenanceItem {
  const { assignedUserIds: _assignedUserIds, ...publicItem } = item;
  return {
    ...publicItem,
    attention:
      item.priority === 'urgent'
        ? 'urgent'
        : item.priority === 'high'
          ? 'high'
          : 'normal',
  };
}

function occupancyItem(
  item: WorkOccupancyProjection,
  referenceDate: DateOnly,
): WorkOccupancyItem {
  return {
    ...item,
    attention: dateAttention(item.dueDate, referenceDate),
  };
}

function itemDate(item: OperationalWorkItem): string {
  if (item.kind === 'inspection') return item.scheduledFor ?? '9999-12-31';
  if (item.kind === 'occupancy') return item.dueDate ?? '9999-12-31';
  return item.reportedAt;
}

function itemCode(item: OperationalWorkItem): string {
  if (item.kind === 'inspection') return item.inspectionCode;
  if (item.kind === 'maintenance') return item.issueCode;
  return item.tenancyCode;
}

function sortItems(
  left: OperationalWorkItem,
  right: OperationalWorkItem,
): number {
  const attentionDelta =
    attentionRank[left.attention] - attentionRank[right.attention];
  if (attentionDelta !== 0) return attentionDelta;

  const dateDelta = itemDate(left).localeCompare(itemDate(right));
  if (dateDelta !== 0) return dateDelta;

  const propertyDelta = left.propertyCode.localeCompare(right.propertyCode);
  if (propertyDelta !== 0) return propertyDelta;

  const leftUnit = left.unitCode ?? '';
  const rightUnit = right.unitCode ?? '';
  const unitDelta = leftUnit.localeCompare(rightUnit);
  if (unitDelta !== 0) return unitDelta;

  const kindDelta = left.kind.localeCompare(right.kind);
  if (kindDelta !== 0) return kindDelta;

  return itemCode(left).localeCompare(itemCode(right));
}

export async function listOperationalWorkQuery(
  repository: WorkRepository,
  actor: Actor,
  referenceDateValue: string,
): Promise<OperationalWorkQueue> {
  requireCapability(actor, 'portfolio:read');
  requireCapability(actor, 'inspections:read');
  requireCapability(actor, 'maintenance:read');

  if (actor.role !== 'inspector') {
    requireCapability(actor, 'tenancy:read');
    requireCapability(actor, 'contracts:read');
  }

  const referenceDate = asDateOnly(referenceDateValue);
  const projection = await repository.getOperationalWork(referenceDate);

  const inspections = projection.inspections
    .filter(
      (item) =>
        actor.role !== 'inspector' ||
        item.assignedToUserId === actor.userId,
    )
    .map((item) => inspectionItem(item, referenceDate));

  const maintenance = projection.maintenance
    .filter(
      (item) =>
        actor.role !== 'inspector' ||
        item.assignedUserIds.includes(actor.userId),
    )
    .map(maintenanceItem);

  const occupancy =
    actor.role === 'inspector'
      ? []
      : projection.occupancy.map((item) =>
          occupancyItem(item, referenceDate),
        );

  return {
    referenceDate,
    items: [...inspections, ...maintenance, ...occupancy].sort(sortItems),
  };
}
