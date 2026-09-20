import type {
  UnitTimelineFilter,
  UnitTimelineRepository,
} from '@portfolio/application';
import type {
  UnitId,
  UnitTimelineEvent,
} from '@portfolio/domain';

function compareEvents(
  left: UnitTimelineEvent,
  right: UnitTimelineEvent,
): number {
  if (left.occurredOn !== right.occurredOn) {
    return right.occurredOn.localeCompare(left.occurredOn);
  }

  if (left.precision !== right.precision) {
    return left.precision === 'instant' ? -1 : 1;
  }

  if (
    left.occurredAt !== null &&
    right.occurredAt !== null &&
    left.occurredAt !== right.occurredAt
  ) {
    return right.occurredAt.localeCompare(left.occurredAt);
  }

  const typeOrder = left.eventType.localeCompare(right.eventType);
  if (typeOrder !== 0) return typeOrder;

  return left.eventKey.localeCompare(right.eventKey);
}

export class InMemoryUnitTimelineRepository
  implements UnitTimelineRepository
{
  readonly events: UnitTimelineEvent[] = [];

  async listByUnit(unitId: UnitId, filter: UnitTimelineFilter) {
    const categories =
      filter.categories === undefined
        ? null
        : new Set(filter.categories);

    const filtered = this.events
      .filter((event) => event.unitId === unitId)
      .filter(
        (event) =>
          categories === null ||
          categories.size === 0 ||
          categories.has(event.category),
      )
      .filter(
        (event) =>
          filter.from === undefined || event.occurredOn >= filter.from,
      )
      .filter(
        (event) =>
          filter.to === undefined || event.occurredOn <= filter.to,
      )
      .sort(compareEvents);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    return filtered.slice(offset, offset + limit);
  }
}
