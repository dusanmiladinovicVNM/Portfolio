import {
  asDateOnly,
  type DateOnly,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type {
  WorkInspectionProjection,
  WorkMaintenanceProjection,
  WorkOccupancyProjection,
  WorkServiceProjection,
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

export interface WorkServiceItem
  extends Omit<WorkServiceProjection, 'latestLinkedServicePerformedAt'> {
  readonly attention: WorkAttention;
  readonly dueOn: DateOnly;
}

export interface WorkOccupancyItem extends WorkOccupancyProjection {
  readonly attention: WorkAttention;
}

export type OperationalWorkItem =
  | WorkInspectionItem
  | WorkMaintenanceItem
  | WorkServiceItem
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

const SWISS_TIME_ZONE = 'Europe/Zurich';

function swissDateOnlyFromInstant(value: string): DateOnly {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new Error('Service Work received an invalid ServiceEvent instant.');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SWISS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return asDateOnly(
    `${part('year')}-${part('month')}-${part('day')}`,
  );
}

function anchoredOccurrence(
  firstDueOn: DateOnly,
  intervalMonths: number,
  occurrenceIndex: number,
): DateOnly {
  const [yearValue, monthValue, dayValue] = firstDueOn
    .split('-')
    .map(Number);
  if (
    !Number.isInteger(yearValue) ||
    !Number.isInteger(monthValue) ||
    !Number.isInteger(dayValue)
  ) {
    throw new Error('Service Work received an invalid first due date.');
  }

  const monthIndex =
    yearValue! * 12 + (monthValue! - 1) +
    intervalMonths * occurrenceIndex;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(dayValue!, lastDay);
  const value =
    String(year).padStart(4, '0') +
    '-' +
    String(month + 1).padStart(2, '0') +
    '-' +
    String(day).padStart(2, '0');
  return asDateOnly(value);
}

export function deriveServicePlanNextDue(
  item: WorkServiceProjection,
): DateOnly | null {
  const performedAt = item.latestLinkedServicePerformedAt;
  if (performedAt === null) return item.firstDueOn;

  const performedOn = swissDateOnlyFromInstant(performedAt);
  if (performedOn < item.firstDueOn) return item.firstDueOn;

  if (item.scheduleKind === 'one_time') return null;

  const intervalMonths = item.intervalMonths;
  if (!Number.isInteger(intervalMonths) || (intervalMonths ?? 0) <= 0) {
    throw new Error(
      'Recurring Service Work is missing a positive intervalMonths.',
    );
  }

  const [firstYear, firstMonth] = item.firstDueOn.split('-').map(Number);
  const [performedYear, performedMonth] = performedOn.split('-').map(Number);
  const elapsedMonths =
    (performedYear! - firstYear!) * 12 +
    (performedMonth! - firstMonth!);
  let occurrenceIndex = Math.max(
    0,
    Math.floor(elapsedMonths / intervalMonths!),
  );

  while (
    anchoredOccurrence(
      item.firstDueOn,
      intervalMonths!,
      occurrenceIndex,
    ) <= performedOn
  ) {
    occurrenceIndex += 1;
  }

  return anchoredOccurrence(
    item.firstDueOn,
    intervalMonths!,
    occurrenceIndex,
  );
}

function serviceItem(
  item: WorkServiceProjection,
  referenceDate: DateOnly,
): WorkServiceItem | null {
  const dueOn = deriveServicePlanNextDue(item);
  if (dueOn === null) return null;
  const {
    latestLinkedServicePerformedAt: _latestLinkedServicePerformedAt,
    ...publicItem
  } = item;
  return {
    ...publicItem,
    dueOn,
    attention: dateAttention(dueOn, referenceDate),
  };
}


function itemDate(item: OperationalWorkItem): string {
  if (item.kind === 'inspection') return item.scheduledFor ?? '9999-12-31';
  if (item.kind === 'service') return item.dueOn;
  if (item.kind === 'occupancy') return item.dueDate ?? '9999-12-31';
  return item.reportedAt;
}

function itemCode(item: OperationalWorkItem): string {
  if (item.kind === 'inspection') return item.inspectionCode;
  if (item.kind === 'maintenance') return item.issueCode;
  if (item.kind === 'service') return item.assetCode + ':' + item.planName;
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
  operationalDateValue: string,
): Promise<OperationalWorkQueue> {
  requireCapability(actor, 'portfolio:read');
  requireCapability(actor, 'inspections:read');
  requireCapability(actor, 'maintenance:read');

  if (actor.role !== 'inspector') {
    requireCapability(actor, 'tenancy:read');
    requireCapability(actor, 'contracts:read');
    requireCapability(actor, 'service:read');
  }

  const referenceDate = asDateOnly(referenceDateValue);
  const operationalDate = asDateOnly(operationalDateValue);
  const projection = await repository.getOperationalWork(operationalDate);

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

  const service =
    actor.role === 'inspector'
      ? []
      : projection.service
          .map((item) => serviceItem(item, referenceDate))
          .filter((item): item is WorkServiceItem => item !== null);

  const occupancy =
    actor.role === 'inspector'
      ? []
      : projection.occupancy.map((item) =>
          occupancyItem(item, referenceDate),
        );

  return {
    referenceDate,
    items: [...inspections, ...maintenance, ...service, ...occupancy].sort(
      sortItems,
    ),
  };
}
