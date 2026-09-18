import type {
  DateOnly,
  OwnershipPeriod,
  UnitId,
} from '@portfolio/domain';

export interface OwnershipRepository {
  listByUnit(unitId: UnitId): Promise<readonly OwnershipPeriod[]>;
  overlaps(
    unitId: UnitId,
    validFrom: DateOnly,
    validTo: DateOnly | null,
  ): Promise<boolean>;
  insert(period: OwnershipPeriod): Promise<void>;
}
