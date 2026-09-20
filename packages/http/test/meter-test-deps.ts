import { DomainError } from '@portfolio/domain';
import type { MeterRepository } from '@portfolio/application';
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

export class InMemoryMeterRepository implements MeterRepository {
  readonly meters = new Map<MeterId, Meter>();
  readonly readings: MeterReading[] = [];
  readonly boundaries: MeterReadingBoundary[] = [];

  async getMeterById(id: MeterId) {
    return this.meters.get(id) ?? null;
  }

  async listMetersByUnit(unitId: UnitId) {
    return [...this.meters.values()].filter((meter) => meter.unitId === unitId);
  }

  async codeExists(code: string) {
    const normalized = code.trim().toLowerCase();
    return [...this.meters.values()].some(
      (meter) => meter.code.trim().toLowerCase() === normalized,
    );
  }

  async insertMeter(meter: Meter) {
    if (await this.codeExists(meter.code)) {
      throw new DomainError(
        'METER_CODE_ALREADY_EXISTS',
        'Meter code already exists.',
      );
    }
    this.meters.set(meter.id, meter);
  }

  async updateMeter(meter: Meter, expectedVersion: number) {
    const current = this.meters.get(meter.id);
    if (!current || current.version !== expectedVersion) {
      throw new DomainError(
        'METER_VERSION_CONFLICT',
        'Meter was modified concurrently.',
      );
    }
    this.meters.set(meter.id, meter);
  }

  async getReadingById(id: MeterReadingId) {
    return this.readings.find((reading) => reading.id === id) ?? null;
  }

  async listReadings(meterId: MeterId) {
    return this.readings
      .filter((reading) => reading.meterId === meterId)
      .sort((left, right) => Date.parse(left.readAt) - Date.parse(right.readAt));
  }

  async getLatestReadingAt(meterId: MeterId) {
    const readings = await this.listReadings(meterId);
    return readings.length === 0 ? null : readings[readings.length - 1]!.readAt;
  }

  async insertReading(reading: MeterReading) {
    if (
      this.readings.some(
        (existing) =>
          existing.meterId === reading.meterId &&
          existing.readAt === reading.readAt,
      )
    ) {
      throw new DomainError(
        'METER_READING_AT_TIME_ALREADY_EXISTS',
        'Meter already has a reading at this exact occurrence time.',
      );
    }
    this.readings.push(reading);
  }

  async listBoundariesByMeter(meterId: MeterId) {
    const readingIds = new Set(
      this.readings
        .filter((reading) => reading.meterId === meterId)
        .map((reading) => reading.id),
    );
    return this.boundaries.filter((boundary) =>
      readingIds.has(boundary.readingId),
    );
  }

  async listBoundariesByTenancy(tenancyId: TenancyId) {
    return this.boundaries.filter(
      (boundary) => boundary.tenancyId === tenancyId,
    );
  }

  async boundaryExistsForMeterTenancy(
    meterId: MeterId,
    tenancyId: TenancyId,
    type: MeterReadingBoundaryType,
  ) {
    const readingIds = new Set(
      this.readings
        .filter((reading) => reading.meterId === meterId)
        .map((reading) => reading.id),
    );
    return this.boundaries.some(
      (boundary) =>
        readingIds.has(boundary.readingId) &&
        boundary.tenancyId === tenancyId &&
        boundary.type === type,
    );
  }

  async insertBoundary(boundary: MeterReadingBoundary) {
    const reading = await this.getReadingById(boundary.readingId);
    if (!reading) {
      throw new DomainError(
        'METER_READING_NOT_FOUND',
        'Meter reading not found.',
      );
    }
    if (
      await this.boundaryExistsForMeterTenancy(
        reading.meterId,
        boundary.tenancyId,
        boundary.type,
      )
    ) {
      throw new DomainError(
        'METER_READING_BOUNDARY_ALREADY_EXISTS',
        'Meter already has this Tenancy boundary reading.',
      );
    }
    this.boundaries.push(boundary);
  }
}
