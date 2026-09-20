import { asDateOnly, type DateOnly } from '../shared/date-only.js';
import { DomainError } from '../shared/domain-error.js';
import type { UnitId, UserId } from '../shared/entity-id.js';
import { asInstant } from '../shared/instant.js';

export const UNIT_TIMELINE_CATEGORIES = [
  'tenancy',
  'lease',
  'document',
  'inspection',
  'asset',
  'service',
  'improvement',
  'cost',
  'maintenance',
  'access',
  'meter',
] as const;

export const UNIT_TIMELINE_TEMPORAL_PRECISIONS = ['date', 'instant'] as const;

export const UNIT_TIMELINE_EVENT_TYPES = [
  'tenancy.created',
  'tenancy.started',
  'tenancy.notice_given',
  'tenancy.termination_effective',
  'tenancy.ended',

  'lease.created',
  'lease.signed',
  'lease.effective_started',
  'lease.effective_ended',
  'lease_amendment.created',
  'lease_amendment.signed',
  'lease_amendment.effective_started',
  'tenancy_terms.effective_started',

  'document.linked',

  'inspection.created',
  'inspection.started',
  'inspection.locked',
  'inspection.finalized',
  'inspection.cancelled',
  'inspection.finding_created',

  'asset.location_started',
  'asset.location_ended',
  'asset.condition_assessed',
  'asset.inventory_move_in_recorded',
  'asset.inventory_move_out_recorded',

  'warranty_claim.submitted',
  'warranty_claim.resolved',
  'warranty_claim.closed',
  'warranty_claim.cancelled',
  'service.performed',

  'improvement.created',
  'improvement.planned',
  'improvement.started',
  'improvement.completed',
  'improvement.cancelled',
  'work_item.created',
  'work_item.started',
  'work_item.completed',
  'work_item.cancelled',
  'work_record.performed',

  'cost.incurred',
  'cost.reversed',

  'maintenance_issue.reported',
  'maintenance_issue.resolved',
  'maintenance_issue.cancelled',
  'maintenance_work_order.created',
  'maintenance_work_order.assigned',
  'maintenance_work_order.started',
  'maintenance_work_order.completed',
  'maintenance_work_order.cancelled',

  'access.issued',
  'access.returned',
  'access.lost',

  'meter.installed',
  'meter.retired',
  'meter.reading',
  'meter.boundary_move_in',
  'meter.boundary_move_out',
] as const;

export const UNIT_TIMELINE_SOURCE_TYPES = [
  'tenancy',
  'lease_agreement',
  'lease_amendment',
  'tenancy_term_version',
  'document_link',
  'inspection',
  'inspection_finding',
  'asset_location_history',
  'asset_condition_assessment',
  'tenancy_asset_assignment',
  'warranty_claim',
  'service_event',
  'improvement_project',
  'work_item',
  'work_record',
  'cost',
  'cost_reversal',
  'maintenance_issue',
  'maintenance_work_order',
  'access_item_transaction',
  'meter',
  'meter_reading',
  'meter_reading_boundary',
] as const;

export type UnitTimelineCategory =
  (typeof UNIT_TIMELINE_CATEGORIES)[number];
export type UnitTimelineTemporalPrecision =
  (typeof UNIT_TIMELINE_TEMPORAL_PRECISIONS)[number];
export type UnitTimelineEventType =
  (typeof UNIT_TIMELINE_EVENT_TYPES)[number];
export type UnitTimelineSourceType =
  (typeof UNIT_TIMELINE_SOURCE_TYPES)[number];

export type UnitTimelineDetailValue = string | number | boolean | null;
export type UnitTimelineDetails = Readonly<
  Record<string, UnitTimelineDetailValue>
>;

const EVENT_CATEGORY: Readonly<
  Record<UnitTimelineEventType, UnitTimelineCategory>
> = {
  'tenancy.created': 'tenancy',
  'tenancy.started': 'tenancy',
  'tenancy.notice_given': 'tenancy',
  'tenancy.termination_effective': 'tenancy',
  'tenancy.ended': 'tenancy',

  'lease.created': 'lease',
  'lease.signed': 'lease',
  'lease.effective_started': 'lease',
  'lease.effective_ended': 'lease',
  'lease_amendment.created': 'lease',
  'lease_amendment.signed': 'lease',
  'lease_amendment.effective_started': 'lease',
  'tenancy_terms.effective_started': 'lease',

  'document.linked': 'document',

  'inspection.created': 'inspection',
  'inspection.started': 'inspection',
  'inspection.locked': 'inspection',
  'inspection.finalized': 'inspection',
  'inspection.cancelled': 'inspection',
  'inspection.finding_created': 'inspection',

  'asset.location_started': 'asset',
  'asset.location_ended': 'asset',
  'asset.condition_assessed': 'asset',
  'asset.inventory_move_in_recorded': 'asset',
  'asset.inventory_move_out_recorded': 'asset',

  'warranty_claim.submitted': 'service',
  'warranty_claim.resolved': 'service',
  'warranty_claim.closed': 'service',
  'warranty_claim.cancelled': 'service',
  'service.performed': 'service',

  'improvement.created': 'improvement',
  'improvement.planned': 'improvement',
  'improvement.started': 'improvement',
  'improvement.completed': 'improvement',
  'improvement.cancelled': 'improvement',
  'work_item.created': 'improvement',
  'work_item.started': 'improvement',
  'work_item.completed': 'improvement',
  'work_item.cancelled': 'improvement',
  'work_record.performed': 'improvement',

  'cost.incurred': 'cost',
  'cost.reversed': 'cost',

  'maintenance_issue.reported': 'maintenance',
  'maintenance_issue.resolved': 'maintenance',
  'maintenance_issue.cancelled': 'maintenance',
  'maintenance_work_order.created': 'maintenance',
  'maintenance_work_order.assigned': 'maintenance',
  'maintenance_work_order.started': 'maintenance',
  'maintenance_work_order.completed': 'maintenance',
  'maintenance_work_order.cancelled': 'maintenance',

  'access.issued': 'access',
  'access.returned': 'access',
  'access.lost': 'access',

  'meter.installed': 'meter',
  'meter.retired': 'meter',
  'meter.reading': 'meter',
  'meter.boundary_move_in': 'meter',
  'meter.boundary_move_out': 'meter',
};

export interface UnitTimelineEvent {
  readonly eventKey: string;
  readonly unitId: UnitId;
  readonly category: UnitTimelineCategory;
  readonly eventType: UnitTimelineEventType;
  readonly precision: UnitTimelineTemporalPrecision;
  readonly occurredOn: DateOnly;
  readonly occurredAt: string | null;
  readonly recordedAt: string | null;
  readonly recordedByUserId: UserId | null;
  readonly sourceType: UnitTimelineSourceType;
  readonly sourceId: string;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: string | null;
  readonly details: UnitTimelineDetails;
}

export interface CreateUnitTimelineEventInput
  extends Omit<
    UnitTimelineEvent,
    'occurredOn' | 'occurredAt' | 'recordedAt'
  > {
  readonly occurredOn: string;
  readonly occurredAt: string | null;
  readonly recordedAt: string | null;
}

const CATEGORY_SET = new Set<string>(UNIT_TIMELINE_CATEGORIES);
const EVENT_TYPE_SET = new Set<string>(UNIT_TIMELINE_EVENT_TYPES);
const PRECISION_SET = new Set<string>(UNIT_TIMELINE_TEMPORAL_PRECISIONS);
const SOURCE_TYPE_SET = new Set<string>(UNIT_TIMELINE_SOURCE_TYPES);

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError(
      'UNIT_TIMELINE_INVALID_EVENT',
      `${field} is required.`,
    );
  }
  return normalized;
}

export function createUnitTimelineEvent(
  input: CreateUnitTimelineEventInput,
): UnitTimelineEvent {
  if (
    !CATEGORY_SET.has(input.category) ||
    !EVENT_TYPE_SET.has(input.eventType) ||
    !PRECISION_SET.has(input.precision) ||
    !SOURCE_TYPE_SET.has(input.sourceType)
  ) {
    throw new DomainError(
      'UNIT_TIMELINE_INVALID_EVENT',
      'Timeline event contains an unsupported category, type, precision or source type.',
    );
  }

  const eventType = input.eventType as UnitTimelineEventType;
  const expectedCategory = EVENT_CATEGORY[eventType];
  if (input.category !== expectedCategory) {
    throw new DomainError(
      'UNIT_TIMELINE_INVALID_EVENT',
      `Event type ${eventType} belongs to category ${expectedCategory}.`,
    );
  }

  const occurredOn = asDateOnly(input.occurredOn);
  let occurredAt: string | null = null;

  if (input.precision === 'instant') {
    if (input.occurredAt === null) {
      throw new DomainError(
        'UNIT_TIMELINE_INVALID_EVENT',
        'Instant-precision event requires occurredAt.',
      );
    }

    occurredAt = asInstant(
      input.occurredAt,
      'occurredAt',
      'UNIT_TIMELINE_INVALID_EVENT',
    );

    if (occurredAt.slice(0, 10) !== occurredOn) {
      throw new DomainError(
        'UNIT_TIMELINE_INVALID_EVENT',
        'occurredOn must equal the UTC calendar date of occurredAt.',
      );
    }
  } else if (input.occurredAt !== null) {
    throw new DomainError(
      'UNIT_TIMELINE_INVALID_EVENT',
      'Date-precision event must not invent occurredAt.',
    );
  }

  const recordedAt =
    input.recordedAt === null
      ? null
      : asInstant(
          input.recordedAt,
          'recordedAt',
          'UNIT_TIMELINE_INVALID_EVENT',
        );

  return {
    ...input,
    eventKey: required(input.eventKey, 'eventKey'),
    category: input.category as UnitTimelineCategory,
    eventType,
    precision: input.precision as UnitTimelineTemporalPrecision,
    occurredOn,
    occurredAt,
    recordedAt,
    sourceType: input.sourceType as UnitTimelineSourceType,
    sourceId: required(input.sourceId, 'sourceId'),
    relatedEntityType:
      input.relatedEntityType === null
        ? null
        : required(input.relatedEntityType, 'relatedEntityType'),
    relatedEntityId:
      input.relatedEntityId === null
        ? null
        : required(input.relatedEntityId, 'relatedEntityId'),
    details: { ...input.details },
  };
}

export function unitTimelineEventCategory(
  eventType: UnitTimelineEventType,
): UnitTimelineCategory {
  return EVENT_CATEGORY[eventType];
}
