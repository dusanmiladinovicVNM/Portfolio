import {
  DomainError,
  asMeterId,
  asMeterReadingId,
  createMeter,
  createMeterReading,
  meterUtcCalendarDate,
  retireMeter,
  updateMeterLabel,
  type Meter,
  type MeterId,
  type MeterMeasurementUnit,
  type MeterReading,
  type MeterReadingContext,
  type MeterUtilityType,
  type SpaceId,
  type Tenancy,
  type TenancyId,
  type UnitId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type { TenancyRepository } from '../tenancy/tenancy-repository.js';
import type { MeterRepository } from './meter-repository.js';

export interface MeterDependencies {
  readonly meterRepository: MeterRepository;
  readonly portfolioRepository: PortfolioRepository;
  readonly tenancyRepository: TenancyRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: ClockPort;
}

async function requireMeter(
  repository: MeterRepository,
  id: MeterId,
): Promise<Meter> {
  const meter = await repository.getMeterById(id);
  if (!meter) {
    throw new DomainError('METER_NOT_FOUND', 'Meter not found.');
  }
  return meter;
}

async function requireTenancy(
  repository: TenancyRepository,
  id: TenancyId,
): Promise<Tenancy> {
  const tenancy = await repository.getById(id);
  if (!tenancy) {
    throw new DomainError('TENANCY_NOT_FOUND', 'Tenancy not found.');
  }
  return tenancy;
}

function assertExpectedVersion(meter: Meter, expectedVersion: number): void {
  if (meter.version !== expectedVersion) {
    throw new DomainError(
      'METER_VERSION_CONFLICT',
      'Meter has changed since the caller last read it.',
    );
  }
}

async function assertMeterPlacement(
  repository: PortfolioRepository,
  unitId: UnitId,
  spaceId: SpaceId | null,
): Promise<void> {
  const unit = await repository.getUnitById(unitId);
  if (!unit) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  if (spaceId !== null) {
    const space = await repository.getSpaceById(spaceId);
    if (!space) {
      throw new DomainError('SPACE_NOT_FOUND', 'Space not found.');
    }
    if (space.unitId !== unitId) {
      throw new DomainError(
        'METER_SPACE_UNIT_MISMATCH',
        'Meter Space must belong to the Meter Unit.',
      );
    }
  }
}

async function assertHandoverReading(
  deps: Pick<MeterDependencies, 'meterRepository' | 'tenancyRepository'>,
  meter: Meter,
  context: Exclude<MeterReadingContext, 'regular'>,
  tenancyId: TenancyId,
  readAt: string,
): Promise<void> {
  const tenancy = await requireTenancy(deps.tenancyRepository, tenancyId);

  if (tenancy.unitId !== meter.unitId) {
    throw new DomainError(
      'METER_READING_TENANCY_UNIT_MISMATCH',
      'Move-in/out Meter reading Tenancy must belong to the Meter Unit.',
    );
  }

  const readDate = meterUtcCalendarDate(readAt, 'readAt');

  if (context === 'move_in') {
    if (tenancy.actualStart === null) {
      throw new DomainError(
        'METER_MOVE_IN_REQUIRES_ACTUAL_START',
        'Move-in Meter reading requires a Tenancy actualStart.',
      );
    }
    if (readDate !== tenancy.actualStart) {
      throw new DomainError(
        'METER_MOVE_IN_DATE_MISMATCH',
        'Move-in Meter reading UTC date must equal Tenancy actualStart.',
      );
    }
  } else {
    if (tenancy.actualEnd === null) {
      throw new DomainError(
        'METER_MOVE_OUT_REQUIRES_ACTUAL_END',
        'Move-out Meter reading requires a Tenancy actualEnd.',
      );
    }
    if (readDate !== tenancy.actualEnd) {
      throw new DomainError(
        'METER_MOVE_OUT_DATE_MISMATCH',
        'Move-out Meter reading UTC date must equal Tenancy actualEnd.',
      );
    }
  }

  if (
    await deps.meterRepository.handoverReadingExists(
      meter.id,
      tenancy.id,
      context,
    )
  ) {
    throw new DomainError(
      'METER_HANDOVER_READING_ALREADY_EXISTS',
      'This Meter already has the requested Tenancy boundary reading.',
    );
  }
}

export async function createMeterCommand(
  deps: MeterDependencies,
  actor: Actor,
  input: {
    readonly code: string;
    readonly serialNumber: string;
    readonly utilityType: MeterUtilityType;
    readonly measurementUnit: MeterMeasurementUnit;
    readonly unitId: UnitId;
    readonly spaceId?: SpaceId | null;
    readonly label: string;
    readonly installedAt: string;
  },
): Promise<Meter> {
  requireCapability(actor, 'meters:write');

  const meter = createMeter({
    id: asMeterId(deps.idGenerator.next()),
    code: input.code,
    serialNumber: input.serialNumber,
    utilityType: input.utilityType,
    measurementUnit: input.measurementUnit,
    unitId: input.unitId,
    ...(input.spaceId !== undefined ? { spaceId: input.spaceId } : {}),
    label: input.label,
    installedAt: input.installedAt,
    recordedAt: deps.clock.now(),
    recordedByUserId: actor.userId,
  });

  await assertMeterPlacement(
    deps.portfolioRepository,
    meter.unitId,
    meter.spaceId,
  );

  if (await deps.meterRepository.codeExists(meter.code)) {
    throw new DomainError(
      'METER_CODE_ALREADY_EXISTS',
      `Meter code '${meter.code}' already exists.`,
    );
  }

  await deps.meterRepository.insertMeter(meter);
  return meter;
}

export async function updateMeterLabelCommand(
  deps: Pick<MeterDependencies, 'meterRepository'>,
  actor: Actor,
  meterId: MeterId,
  expectedVersion: number,
  label: string,
): Promise<Meter> {
  requireCapability(actor, 'meters:write');

  const meter = await requireMeter(deps.meterRepository, meterId);
  assertExpectedVersion(meter, expectedVersion);

  const updated = updateMeterLabel(meter, label);
  if (updated === meter) return meter;

  await deps.meterRepository.updateMeter(updated, meter.version);
  return updated;
}

export async function retireMeterCommand(
  deps: Pick<MeterDependencies, 'meterRepository' | 'clock'>,
  actor: Actor,
  meterId: MeterId,
  input: {
    readonly expectedVersion: number;
    readonly retiredAt: string;
    readonly retirementReason: string;
  },
): Promise<Meter> {
  requireCapability(actor, 'meters:write');

  const meter = await requireMeter(deps.meterRepository, meterId);
  assertExpectedVersion(meter, input.expectedVersion);
  const latestExistingReadingAt =
    await deps.meterRepository.getLatestReadingAt(meter.id);
  const recordedAt = deps.clock.now();

  const retired = retireMeter(meter, {
    retiredAt: input.retiredAt,
    recordedAt,
    retiredByUserId: actor.userId,
    retirementReason: input.retirementReason,
    latestExistingReadingAt,
  });

  await deps.meterRepository.updateMeter(retired, meter.version);
  return retired;
}

export async function recordMeterReadingCommand(
  deps: Pick<
    MeterDependencies,
    'meterRepository' | 'tenancyRepository' | 'idGenerator' | 'clock'
  >,
  actor: Actor,
  meterId: MeterId,
  input: {
    readonly value: string;
    readonly context: MeterReadingContext;
    readonly tenancyId?: TenancyId | null;
    readonly readAt: string;
    readonly note?: string | null;
  },
): Promise<MeterReading> {
  requireCapability(actor, 'meter_readings:write');

  const meter = await requireMeter(deps.meterRepository, meterId);

  if (input.context !== 'regular') {
    if (input.tenancyId === undefined || input.tenancyId === null) {
      throw new DomainError(
        'METER_READING_TENANCY_REQUIRED',
        'Move-in and move-out readings require a Tenancy.',
      );
    }
    await assertHandoverReading(
      deps,
      meter,
      input.context,
      input.tenancyId,
      input.readAt,
    );
  }

  const reading = createMeterReading({
    id: asMeterReadingId(deps.idGenerator.next()),
    meter,
    value: input.value,
    context: input.context,
    ...(input.tenancyId !== undefined ? { tenancyId: input.tenancyId } : {}),
    readAt: input.readAt,
    recordedAt: deps.clock.now(),
    recordedByUserId: actor.userId,
    ...(input.note !== undefined ? { note: input.note } : {}),
  });

  await deps.meterRepository.insertReading(reading);
  return reading;
}
