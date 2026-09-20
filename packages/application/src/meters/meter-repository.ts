import type {
  Meter,
  MeterId,
  MeterReading,
  MeterReadingBoundary,
  MeterReadingBoundaryType,
  MeterReadingId,
  TenancyId,
  UnitId,
} from '@portfolio/domain';

export interface MeterRepository {
  getMeterById(id: MeterId): Promise<Meter | null>;
  listMetersByUnit(unitId: UnitId): Promise<readonly Meter[]>;
  codeExists(code: string): Promise<boolean>;
  insertMeter(meter: Meter): Promise<void>;
  updateMeter(meter: Meter, expectedVersion: number): Promise<void>;

  getReadingById(id: MeterReadingId): Promise<MeterReading | null>;
  listReadings(meterId: MeterId): Promise<readonly MeterReading[]>;
  getLatestReadingAt(meterId: MeterId): Promise<string | null>;
  insertReading(reading: MeterReading): Promise<void>;

  listBoundariesByMeter(
    meterId: MeterId,
  ): Promise<readonly MeterReadingBoundary[]>;
  listBoundariesByTenancy(
    tenancyId: TenancyId,
  ): Promise<readonly MeterReadingBoundary[]>;
  boundaryExistsForMeterTenancy(
    meterId: MeterId,
    tenancyId: TenancyId,
    type: MeterReadingBoundaryType,
  ): Promise<boolean>;
  insertBoundary(boundary: MeterReadingBoundary): Promise<void>;
}
