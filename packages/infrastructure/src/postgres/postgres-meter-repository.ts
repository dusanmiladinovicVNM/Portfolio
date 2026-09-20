import type postgres from 'postgres';
import type { MeterRepository } from '@portfolio/application';
import {
  DomainError,
  asMeterId,
  asMeterReadingBoundaryId,
  asMeterReadingId,
  asMeterReadingValue,
  asSpaceId,
  asTenancyId,
  asUnitId,
  asUserId,
  type Meter,
  type MeterId,
  type MeterMeasurementUnit,
  type MeterReading,
  type MeterReadingBoundary,
  type MeterReadingBoundaryType,
  type MeterReadingId,
  type MeterStatus,
  type MeterUtilityType,
  type TenancyId,
  type UnitId,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PgErrorLike {
  code?: string;
  constraint_name?: string;
}

interface MeterRow {
  id: string;
  code: string;
  serial_number: string;
  utility_type: MeterUtilityType;
  measurement_unit: MeterMeasurementUnit;
  unit_id: string;
  space_id: string | null;
  label: string;
  installed_at: string | Date;
  status: MeterStatus;
  retired_at: string | Date | null;
  retirement_recorded_at: string | Date | null;
  retired_by_user_id: string | null;
  retirement_reason: string | null;
  version: number;
  recorded_at: string | Date;
  recorded_by_user_id: string;
}

interface MeterReadingRow {
  id: string;
  meter_id: string;
  value: string | number;
  read_at: string | Date;
  recorded_at: string | Date;
  recorded_by_user_id: string;
  note: string | null;
}

interface MeterBoundaryRow {
  id: string;
  reading_id: string;
  tenancy_id: string;
  boundary_type: MeterReadingBoundaryType;
  recorded_at: string | Date;
  recorded_by_user_id: string;
}

function instant(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableInstant(value: string | Date | null): string | null {
  return value === null ? null : instant(value);
}

function mapMeter(row: MeterRow): Meter {
  return {
    id: asMeterId(row.id),
    code: row.code,
    serialNumber: row.serial_number,
    utilityType: row.utility_type,
    measurementUnit: row.measurement_unit,
    unitId: asUnitId(row.unit_id),
    spaceId: row.space_id === null ? null : asSpaceId(row.space_id),
    label: row.label,
    installedAt: instant(row.installed_at),
    status: row.status,
    retiredAt: nullableInstant(row.retired_at),
    retirementRecordedAt: nullableInstant(row.retirement_recorded_at),
    retiredByUserId:
      row.retired_by_user_id === null ? null : asUserId(row.retired_by_user_id),
    retirementReason: row.retirement_reason,
    version: row.version,
    recordedAt: instant(row.recorded_at),
    recordedByUserId: asUserId(row.recorded_by_user_id),
  };
}

function mapReading(row: MeterReadingRow): MeterReading {
  return {
    id: asMeterReadingId(row.id),
    meterId: asMeterId(row.meter_id),
    value: asMeterReadingValue(String(row.value)),
    readAt: instant(row.read_at),
    recordedAt: instant(row.recorded_at),
    recordedByUserId: asUserId(row.recorded_by_user_id),
    note: row.note,
  };
}

function mapBoundary(row: MeterBoundaryRow): MeterReadingBoundary {
  return {
    id: asMeterReadingBoundaryId(row.id),
    readingId: asMeterReadingId(row.reading_id),
    tenancyId: asTenancyId(row.tenancy_id),
    type: row.boundary_type,
    recordedAt: instant(row.recorded_at),
    recordedByUserId: asUserId(row.recorded_by_user_id),
  };
}

function translate(error: unknown): DomainError | null {
  const pg = error as PgErrorLike;

  if (pg.code === '23505') {
    switch (pg.constraint_name) {
      case 'meters_code_uq':
        return new DomainError(
          'METER_CODE_ALREADY_EXISTS',
          'Meter code already exists.',
        );
      case 'meter_readings_meter_time_uq':
        return new DomainError(
          'METER_READING_AT_TIME_ALREADY_EXISTS',
          'Meter already has a reading at this exact occurrence time.',
        );
      case 'meter_reading_boundaries_exact_link_uq':
        return new DomainError(
          'METER_READING_BOUNDARY_ALREADY_EXISTS',
          'Meter reading already carries this Tenancy boundary.',
        );
      default:
        return null;
    }
  }

  if (pg.code !== '23514') return null;

  switch (pg.constraint_name) {
    case 'meters_utility_measurement_pair_valid':
      return new DomainError(
        'METER_MEASUREMENT_UNIT_INVALID',
        'Measurement unit is not valid for this utility type.',
      );
    case 'meter_initial_state':
      return new DomainError(
        'METER_INVALID_INITIAL_STATE',
        'Meter must start active at version 1 without retirement provenance.',
      );
    case 'meter_identity_immutable':
    case 'meter_delete_forbidden':
      return new DomainError(
        'METER_IDENTITY_IMMUTABLE',
        'Meter identity, placement and original provenance are immutable.',
      );
    case 'meter_version_step_invalid':
      return new DomainError(
        'METER_VERSION_CONFLICT',
        'Meter version must advance exactly once.',
      );
    case 'meter_retirement_before_reading':
      return new DomainError(
        'METER_RETIREMENT_BEFORE_READING',
        'Meter retirement cannot predate existing reading history.',
      );
    case 'meter_retirement_immutable':
      return new DomainError(
        'METER_ALREADY_RETIRED',
        'Meter retirement provenance is immutable.',
      );
    case 'meter_invalid_transition':
    case 'meter_lifecycle_mutation_invalid':
    case 'meter_retirement_provenance_required':
      return new DomainError(
        'METER_INVALID_TRANSITION',
        'Meter lifecycle transition is invalid.',
      );
    case 'meter_reading_before_installation':
      return new DomainError(
        'METER_READING_BEFORE_INSTALLATION',
        'Meter reading cannot predate Meter installation.',
      );
    case 'meter_reading_after_retirement':
      return new DomainError(
        'METER_READING_AFTER_RETIREMENT',
        'Meter reading cannot occur after Meter retirement.',
      );
    case 'meter_reading_immutable':
      return new DomainError(
        'METER_READING_IMMUTABLE',
        'Meter readings are append-only observations.',
      );
    case 'meter_readings_value_scale_valid':
    case 'meter_readings_value_range_valid':
    case 'meter_readings_value_nonnegative':
      return new DomainError(
        'METER_READING_VALUE_INVALID',
        'Meter reading value is outside the canonical decimal range.',
      );
    case 'meter_boundary_before_reading_recorded':
      return new DomainError(
        'METER_BOUNDARY_TIMESTAMP_INVALID',
        'Meter reading boundary cannot be recorded before the reading.',
      );
    case 'meter_boundary_tenancy_unit_mismatch':
      return new DomainError(
        'METER_READING_TENANCY_UNIT_MISMATCH',
        'Meter reading boundary Tenancy must belong to the Meter Unit.',
      );
    case 'meter_boundary_move_in_start_missing':
      return new DomainError(
        'METER_MOVE_IN_REQUIRES_ACTUAL_START',
        'Move-in Meter reading requires a Tenancy actualStart.',
      );
    case 'meter_boundary_move_in_date_mismatch':
      return new DomainError(
        'METER_MOVE_IN_DATE_MISMATCH',
        'Move-in Meter reading UTC date must equal Tenancy actualStart.',
      );
    case 'meter_boundary_move_out_end_missing':
      return new DomainError(
        'METER_MOVE_OUT_REQUIRES_ACTUAL_END',
        'Move-out Meter reading requires a Tenancy actualEnd.',
      );
    case 'meter_boundary_move_out_date_mismatch':
      return new DomainError(
        'METER_MOVE_OUT_DATE_MISMATCH',
        'Move-out Meter reading UTC date must equal Tenancy actualEnd.',
      );
    case 'meter_boundary_already_exists':
      return new DomainError(
        'METER_READING_BOUNDARY_ALREADY_EXISTS',
        'Meter already has this Tenancy boundary reading.',
      );
    case 'meter_boundary_immutable':
      return new DomainError(
        'METER_READING_BOUNDARY_IMMUTABLE',
        'Meter reading boundaries are append-only.',
      );
    default:
      return null;
  }
}

async function translated<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = translate(error);
    if (mapped) throw mapped;
    throw error;
  }
}

const meterSelect = `
  select
    id, code, serial_number, utility_type, measurement_unit,
    unit_id, space_id, label, installed_at, status,
    retired_at, retirement_recorded_at, retired_by_user_id,
    retirement_reason, version, recorded_at, recorded_by_user_id
  from public.meters
`;

const readingSelect = `
  select
    id, meter_id, value, read_at, recorded_at, recorded_by_user_id, note
  from public.meter_readings
`;

const boundarySelect = `
  select
    id, reading_id, tenancy_id, boundary_type, recorded_at, recorded_by_user_id
  from public.meter_reading_boundaries
`;

export class PostgresMeterRepository implements MeterRepository {
  constructor(private readonly sql: Sql) {}

  async getMeterById(id: MeterId): Promise<Meter | null> {
    const rows = await this.sql<MeterRow[]>`
      ${this.sql.unsafe(meterSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapMeter(rows[0]!);
  }

  async listMetersByUnit(unitId: UnitId): Promise<readonly Meter[]> {
    const rows = await this.sql<MeterRow[]>`
      ${this.sql.unsafe(meterSelect)}
      where unit_id = ${unitId}
      order by utility_type, lower(code), id
    `;
    return rows.map(mapMeter);
  }

  async codeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.meters
        where lower(btrim(code)) = lower(btrim(${code}))
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insertMeter(meter: Meter): Promise<void> {
    await translated(async () => {
      await this.sql`
        insert into public.meters (
          id, code, serial_number, utility_type, measurement_unit,
          unit_id, space_id, label, installed_at, status,
          retired_at, retirement_recorded_at, retired_by_user_id,
          retirement_reason, version, recorded_at, recorded_by_user_id
        ) values (
          ${meter.id}, ${meter.code}, ${meter.serialNumber},
          ${meter.utilityType}, ${meter.measurementUnit},
          ${meter.unitId}, ${meter.spaceId}, ${meter.label},
          ${meter.installedAt}, ${meter.status},
          ${meter.retiredAt}, ${meter.retirementRecordedAt},
          ${meter.retiredByUserId}, ${meter.retirementReason},
          ${meter.version}, ${meter.recordedAt}, ${meter.recordedByUserId}
        )
      `;
    });
  }

  async updateMeter(meter: Meter, expectedVersion: number): Promise<void> {
    await translated(async () => {
      const rows = await this.sql<{ id: string }[]>`
        update public.meters
        set
          label = ${meter.label},
          status = ${meter.status},
          retired_at = ${meter.retiredAt},
          retirement_recorded_at = ${meter.retirementRecordedAt},
          retired_by_user_id = ${meter.retiredByUserId},
          retirement_reason = ${meter.retirementReason},
          version = ${meter.version}
        where id = ${meter.id}
          and version = ${expectedVersion}
        returning id
      `;

      if (rows.length === 0) {
        throw new DomainError(
          'METER_VERSION_CONFLICT',
          'Meter was modified concurrently.',
        );
      }
    });
  }

  async getReadingById(id: MeterReadingId): Promise<MeterReading | null> {
    const rows = await this.sql<MeterReadingRow[]>`
      ${this.sql.unsafe(readingSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapReading(rows[0]!);
  }

  async listReadings(meterId: MeterId): Promise<readonly MeterReading[]> {
    const rows = await this.sql<MeterReadingRow[]>`
      ${this.sql.unsafe(readingSelect)}
      where meter_id = ${meterId}
      order by read_at, recorded_at, id
    `;
    return rows.map(mapReading);
  }

  async getLatestReadingAt(meterId: MeterId): Promise<string | null> {
    const rows = await this.sql<{ read_at: string | Date | null }[]>`
      select max(read_at) as read_at
      from public.meter_readings
      where meter_id = ${meterId}
    `;
    return rows[0]?.read_at == null ? null : instant(rows[0].read_at);
  }

  async insertReading(reading: MeterReading): Promise<void> {
    await translated(async () => {
      await this.sql`
        insert into public.meter_readings (
          id, meter_id, value, read_at, recorded_at,
          recorded_by_user_id, note
        ) values (
          ${reading.id}, ${reading.meterId}, ${reading.value},
          ${reading.readAt}, ${reading.recordedAt},
          ${reading.recordedByUserId}, ${reading.note}
        )
      `;
    });
  }

  async listBoundariesByMeter(
    meterId: MeterId,
  ): Promise<readonly MeterReadingBoundary[]> {
    const rows = await this.sql<MeterBoundaryRow[]>`
      select
        b.id, b.reading_id, b.tenancy_id, b.boundary_type,
        b.recorded_at, b.recorded_by_user_id
      from public.meter_reading_boundaries b
      join public.meter_readings r on r.id = b.reading_id
      where r.meter_id = ${meterId}
      order by r.read_at, b.boundary_type, b.id
    `;
    return rows.map(mapBoundary);
  }

  async listBoundariesByTenancy(
    tenancyId: TenancyId,
  ): Promise<readonly MeterReadingBoundary[]> {
    const rows = await this.sql<MeterBoundaryRow[]>`
      ${this.sql.unsafe(boundarySelect)}
      where tenancy_id = ${tenancyId}
      order by recorded_at, id
    `;
    return rows.map(mapBoundary);
  }

  async boundaryExistsForMeterTenancy(
    meterId: MeterId,
    tenancyId: TenancyId,
    type: MeterReadingBoundaryType,
  ): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.meter_reading_boundaries b
        join public.meter_readings r on r.id = b.reading_id
        where r.meter_id = ${meterId}
          and b.tenancy_id = ${tenancyId}
          and b.boundary_type = ${type}
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insertBoundary(boundary: MeterReadingBoundary): Promise<void> {
    await translated(async () => {
      await this.sql`
        insert into public.meter_reading_boundaries (
          id, reading_id, tenancy_id, boundary_type,
          recorded_at, recorded_by_user_id
        ) values (
          ${boundary.id}, ${boundary.readingId}, ${boundary.tenancyId},
          ${boundary.type}, ${boundary.recordedAt},
          ${boundary.recordedByUserId}
        )
      `;
    });
  }
}
