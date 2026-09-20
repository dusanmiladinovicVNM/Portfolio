import type {
  Meter,
  MeterId,
  MeterReading,
  MeterReadingContext,
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
  listBoundaryReadingsByTenancy(
    tenancyId: TenancyId,
  ): Promise<readonly MeterReading[]>;
  handoverReadingExists(
    meterId: MeterId,
    tenancyId: TenancyId,
    context: Exclude<MeterReadingContext, 'regular'>,
  ): Promise<boolean>;
  getLatestReadingAt(meterId: MeterId): Promise<string | null>;
  insertReading(reading: MeterReading): Promise<void>;
}
