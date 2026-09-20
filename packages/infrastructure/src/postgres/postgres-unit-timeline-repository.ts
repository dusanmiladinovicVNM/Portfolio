import type postgres from 'postgres';
import type {
  UnitTimelineFilter,
  UnitTimelineRepository,
} from '@portfolio/application';
import {
  asUnitId,
  asUserId,
  createUnitTimelineEvent,
  type UnitId,
  type UnitTimelineCategory,
  type UnitTimelineDetailValue,
  type UnitTimelineEvent,
  type UnitTimelineEventType,
  type UnitTimelineSourceType,
  type UnitTimelineTemporalPrecision,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface TimelineRow {
  event_key: string;
  unit_id: string;
  category: UnitTimelineCategory;
  event_type: UnitTimelineEventType;
  precision: UnitTimelineTemporalPrecision;
  occurred_on: string | Date;
  occurred_at: string | Date | null;
  recorded_at: string | Date | null;
  recorded_by_user_id: string | null;
  source_type: UnitTimelineSourceType;
  source_id: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  details: Record<string, UnitTimelineDetailValue>;
}

function dateOnly(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function instant(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapEvent(row: TimelineRow): UnitTimelineEvent {
  return createUnitTimelineEvent({
    eventKey: row.event_key,
    unitId: asUnitId(row.unit_id),
    category: row.category,
    eventType: row.event_type,
    precision: row.precision,
    occurredOn: dateOnly(row.occurred_on),
    occurredAt: instant(row.occurred_at),
    recordedAt: instant(row.recorded_at),
    recordedByUserId:
      row.recorded_by_user_id === null
        ? null
        : asUserId(row.recorded_by_user_id),
    sourceType: row.source_type,
    sourceId: row.source_id,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    details: row.details,
  });
}

export class PostgresUnitTimelineRepository implements UnitTimelineRepository {
  constructor(private readonly sql: Sql) {}

  async listByUnit(
    unitId: UnitId,
    filter: UnitTimelineFilter,
  ): Promise<readonly UnitTimelineEvent[]> {
    const categories = filter.categories ?? [];
    const categoryCsv = categories.join(',');
    const fromDate = filter.from ?? null;
    const toDate = filter.to ?? null;
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;

    const rows = await this.sql<TimelineRow[]>`
      select
        event_key,
        unit_id,
        category,
        event_type,
        precision,
        occurred_on,
        occurred_at,
        recorded_at,
        recorded_by_user_id,
        source_type,
        source_id,
        related_entity_type,
        related_entity_id,
        details
      from public.unit_business_events
      where unit_id = ${unitId}
        and (
          ${categoryCsv} = ''
          or category = any(string_to_array(${categoryCsv}, ','))
        )
        and (${fromDate}::date is null or occurred_on >= ${fromDate}::date)
        and (${toDate}::date is null or occurred_on <= ${toDate}::date)
      order by
        occurred_on desc,
        case when precision = 'instant' then 0 else 1 end asc,
        occurred_at desc nulls last,
        event_type asc,
        event_key asc
      limit ${limit}
      offset ${offset}
    `;

    return rows.map(mapEvent);
  }
}
