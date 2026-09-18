import type {
  DateOnly,
  Tenancy,
  TenancyId,
  TenancyParty,
  UnitId,
} from '@portfolio/domain';

export interface TenancyRepository {
  getById(id: TenancyId): Promise<Tenancy | null>;
  listByUnit(unitId: UnitId): Promise<readonly Tenancy[]>;
  codeExists(code: string): Promise<boolean>;
  hasPlannedReservationOverlap(
    unitId: UnitId,
    validFrom: DateOnly,
    validTo: DateOnly | null,
    excludeTenancyId?: TenancyId,
  ): Promise<boolean>;
  hasActualOccupancyOverlap(
    unitId: UnitId,
    validFrom: DateOnly,
    validTo: DateOnly | null,
    excludeTenancyId?: TenancyId,
  ): Promise<boolean>;
  insert(tenancy: Tenancy): Promise<void>;
  insertParty(
    tenancyParty: TenancyParty,
    expectedTenancyVersion: number,
    newTenancyVersion: number,
  ): Promise<void>;
  updateLifecycle(
    tenancy: Tenancy,
    expectedVersion: number,
  ): Promise<void>;
}
