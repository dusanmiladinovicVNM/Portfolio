import type {
  DateOnly,
  UnitId,
  UnitTimelineCategory,
  UnitTimelineEvent,
} from '@portfolio/domain';

export interface UnitTimelineFilter {
  readonly categories?: readonly UnitTimelineCategory[];
  readonly from?: DateOnly;
  readonly to?: DateOnly;
  readonly limit?: number;
  readonly offset?: number;
}

export interface UnitTimelineRepository {
  listByUnit(
    unitId: UnitId,
    filter: UnitTimelineFilter,
  ): Promise<readonly UnitTimelineEvent[]>;
}
