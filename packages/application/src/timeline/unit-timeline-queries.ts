import {
  DomainError,
  type UnitId,
  type UnitTimelineEvent,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type {
  UnitTimelineFilter,
  UnitTimelineRepository,
} from './unit-timeline-repository.js';

export interface UnitTimelineQueryDependencies {
  readonly portfolioRepository: PortfolioRepository;
  readonly unitTimelineRepository: UnitTimelineRepository;
}

function normalizeFilter(filter: UnitTimelineFilter): UnitTimelineFilter {
  const limit = filter.limit ?? 100;
  const offset = filter.offset ?? 0;

  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new DomainError(
      'UNIT_TIMELINE_LIMIT_INVALID',
      'Unit timeline limit must be an integer between 1 and 500.',
    );
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new DomainError(
      'UNIT_TIMELINE_OFFSET_INVALID',
      'Unit timeline offset must be a non-negative integer.',
    );
  }

  if (
    filter.from !== undefined &&
    filter.to !== undefined &&
    filter.from > filter.to
  ) {
    throw new DomainError(
      'UNIT_TIMELINE_RANGE_INVALID',
      'Unit timeline from date cannot be after to date.',
    );
  }

  return {
    ...(filter.categories !== undefined
      ? { categories: [...new Set(filter.categories)] }
      : {}),
    ...(filter.from !== undefined ? { from: filter.from } : {}),
    ...(filter.to !== undefined ? { to: filter.to } : {}),
    limit,
    offset,
  };
}

export async function listUnitTimelineQuery(
  deps: UnitTimelineQueryDependencies,
  actor: Actor,
  unitId: UnitId,
  filter: UnitTimelineFilter = {},
): Promise<readonly UnitTimelineEvent[]> {
  requireCapability(actor, 'portfolio:read');

  if (!(await deps.portfolioRepository.getUnitById(unitId))) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  return deps.unitTimelineRepository.listByUnit(
    unitId,
    normalizeFilter(filter),
  );
}
