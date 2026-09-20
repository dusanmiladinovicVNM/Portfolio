import { DomainError } from '../shared/domain-error.js';
import type {
  MeterId,
  MeterReadingId,
  SpaceId,
  TenancyId,
  UnitId,
  UserId,
} from '../shared/entity-id.js';

declare const meterReadingValueBrand: unique symbol;

export const METER_UTILITY_TYPES = [
  'electricity',
  'gas',
  'water',
  'heat',
] as const;

export const METER_MEASUREMENT_UNITS = ['kwh', 'm3'] as const;
export const METER_STATUSES = ['active', 'retired'] as const;
export const METER_READING_CONTEXTS = [
  'regular',
  'move_in',
  'move_out',
] as const;

export type MeterUtilityType = (typeof METER_UTILITY_TYPES)[number];
export type MeterMeasurementUnit = (typeof METER_MEASUREMENT_UNITS)[number];
export type MeterStatus = (typeof METER_STATUSES)[number];
export type MeterReadingContext = (typeof METER_READING_CONTEXTS)[number];

export type MeterReadingValue = string & {
  readonly [meterReadingValueBrand]: 'MeterReadingValue';
};

export interface Meter {
  readonly id: MeterId;
  readonly code: string;
  readonly serialNumber: string;
  readonly utilityType: MeterUtilityType;
  readonly measurementUnit: MeterMeasurementUnit;
  readonly unitId: UnitId;
  readonly spaceId: SpaceId | null;
  readonly label: string;
  readonly installedAt: string;
  readonly status: MeterStatus;
  readonly retiredAt: string | null;
  readonly retirementRecordedAt: string | null;
  readonly retiredByUserId: UserId | null;
  readonly retirementReason: string | null;
  readonly version: number;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}

export interface MeterReading {
  readonly id: MeterReadingId;
  readonly meterId: MeterId;
  readonly value: MeterReadingValue;
  readonly context: MeterReadingContext;
  readonly tenancyId: TenancyId | null;
  readonly readAt: string;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
  readonly note: string | null;
}

export interface MeterConsumptionInterval {
  readonly fromReadingId: MeterReadingId;
  readonly toReadingId: MeterReadingId;
  readonly fromReadAt: string;
  readonly toReadAt: string;
  readonly fromValue: MeterReadingValue;
  readonly toValue: MeterReadingValue;
  readonly consumption: MeterReadingValue | null;
  readonly continuity: 'continuous' | 'decrease_detected';
}

const READING_VALUE_PATTERN =
  /^(0|[1-9]\d{0,17})(?:\.(\d{1,6}))?$/;

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('METER_REQUIRED_FIELD', `${field} is required.`);
  }
  return normalized;
}

function optional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function instant(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'METER_INVALID_TIMESTAMP',
      `${field} must be a valid ISO timestamp.`,
    );
  }
  return value;
}

function assertNotBefore(
  value: string,
  notBefore: string,
  field: string,
  predecessor: string,
): void {
  if (Date.parse(value) < Date.parse(notBefore)) {
    throw new DomainError(
      'METER_TIMESTAMP_ORDER_INVALID',
      `${field} cannot be before ${predecessor}.`,
    );
  }
}

function allowedMeasurementUnit(
  utilityType: MeterUtilityType,
  measurementUnit: MeterMeasurementUnit,
): boolean {
  switch (utilityType) {
    case 'electricity':
    case 'heat':
      return measurementUnit === 'kwh';
    case 'water':
      return measurementUnit === 'm3';
    case 'gas':
      return measurementUnit === 'm3' || measurementUnit === 'kwh';
  }
}

export function meterUtcCalendarDate(value: string, field: string): string {
  const parsed = instant(value, field);
  return new Date(parsed).toISOString().slice(0, 10);
}

export function asMeterReadingValue(value: string): MeterReadingValue {
  const normalized = value.trim();
  const match = READING_VALUE_PATTERN.exec(normalized);
  if (!match) {
    throw new DomainError(
      'METER_READING_VALUE_INVALID',
      'Meter reading value must be a non-negative decimal with at most 18 whole digits and 6 decimal places.',
    );
  }

  const whole = match[1]!;
  const fraction = (match[2] ?? '').padEnd(6, '0');
  return `${whole}.${fraction}` as MeterReadingValue;
}

function scaledValue(value: MeterReadingValue): bigint {
  return BigInt(value.replace('.', ''));
}

function fromScaledValue(value: bigint): MeterReadingValue {
  const raw = value.toString().padStart(7, '0');
  const whole = raw.slice(0, -6) || '0';
  const fraction = raw.slice(-6);
  return `${whole}.${fraction}` as MeterReadingValue;
}

export function meterReadingDifference(
  later: MeterReadingValue,
  earlier: MeterReadingValue,
): MeterReadingValue | null {
  const laterScaled = scaledValue(later);
  const earlierScaled = scaledValue(earlier);
  if (laterScaled < earlierScaled) return null;
  return fromScaledValue(laterScaled - earlierScaled);
}

export function createMeter(input: {
  readonly id: MeterId;
  readonly code: string;
  readonly serialNumber: string;
  readonly utilityType: MeterUtilityType;
  readonly measurementUnit: MeterMeasurementUnit;
  readonly unitId: UnitId;
  readonly spaceId?: SpaceId | null;
  readonly label: string;
  readonly installedAt: string;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}): Meter {
  if (!allowedMeasurementUnit(input.utilityType, input.measurementUnit)) {
    throw new DomainError(
      'METER_MEASUREMENT_UNIT_INVALID',
      'Measurement unit is not valid for this utility type.',
    );
  }

  const installedAt = instant(input.installedAt, 'installedAt');
  const recordedAt = instant(input.recordedAt, 'recordedAt');
  assertNotBefore(recordedAt, installedAt, 'recordedAt', 'installedAt');

  return {
    id: input.id,
    code: required(input.code, 'code'),
    serialNumber: required(input.serialNumber, 'serialNumber'),
    utilityType: input.utilityType,
    measurementUnit: input.measurementUnit,
    unitId: input.unitId,
    spaceId: input.spaceId ?? null,
    label: required(input.label, 'label'),
    installedAt,
    status: 'active',
    retiredAt: null,
    retirementRecordedAt: null,
    retiredByUserId: null,
    retirementReason: null,
    version: 1,
    recordedAt,
    recordedByUserId: input.recordedByUserId,
  };
}

export function updateMeterLabel(meter: Meter, labelValue: string): Meter {
  const label = required(labelValue, 'label');
  if (label === meter.label) return meter;
  return {
    ...meter,
    label,
    version: meter.version + 1,
  };
}

export function retireMeter(
  meter: Meter,
  input: {
    readonly retiredAt: string;
    readonly recordedAt: string;
    readonly retiredByUserId: UserId;
    readonly retirementReason: string;
    readonly latestExistingReadingAt?: string | null;
  },
): Meter {
  if (meter.status === 'retired') {
    throw new DomainError('METER_ALREADY_RETIRED', 'Meter is already retired.');
  }

  const retiredAt = instant(input.retiredAt, 'retiredAt');
  const recordedAt = instant(input.recordedAt, 'recordedAt');

  assertNotBefore(retiredAt, meter.installedAt, 'retiredAt', 'installedAt');
  assertNotBefore(recordedAt, retiredAt, 'recordedAt', 'retiredAt');

  if (
    input.latestExistingReadingAt !== undefined &&
    input.latestExistingReadingAt !== null &&
    Date.parse(retiredAt) < Date.parse(input.latestExistingReadingAt)
  ) {
    throw new DomainError(
      'METER_RETIREMENT_BEFORE_READING',
      'Meter retirement cannot predate an existing reading occurrence.',
    );
  }

  return {
    ...meter,
    status: 'retired',
    retiredAt,
    retirementRecordedAt: recordedAt,
    retiredByUserId: input.retiredByUserId,
    retirementReason: required(input.retirementReason, 'retirementReason'),
    version: meter.version + 1,
  };
}

export function createMeterReading(input: {
  readonly id: MeterReadingId;
  readonly meter: Meter;
  readonly value: string;
  readonly context: MeterReadingContext;
  readonly tenancyId?: TenancyId | null;
  readonly readAt: string;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
  readonly note?: string | null;
}): MeterReading {
  const readAt = instant(input.readAt, 'readAt');
  const recordedAt = instant(input.recordedAt, 'recordedAt');

  assertNotBefore(readAt, input.meter.installedAt, 'readAt', 'installedAt');
  assertNotBefore(recordedAt, readAt, 'recordedAt', 'readAt');

  if (
    input.meter.status === 'retired' &&
    input.meter.retiredAt !== null &&
    Date.parse(readAt) > Date.parse(input.meter.retiredAt)
  ) {
    throw new DomainError(
      'METER_READING_AFTER_RETIREMENT',
      'Meter reading cannot occur after Meter retirement.',
    );
  }

  const tenancyId = input.tenancyId ?? null;
  if (input.context === 'regular' && tenancyId !== null) {
    throw new DomainError(
      'METER_READING_CONTEXT_INVALID',
      'Regular Meter reading cannot carry a Tenancy boundary reference.',
    );
  }

  if (input.context !== 'regular' && tenancyId === null) {
    throw new DomainError(
      'METER_READING_TENANCY_REQUIRED',
      'Move-in and move-out readings require a Tenancy.',
    );
  }

  return {
    id: input.id,
    meterId: input.meter.id,
    value: asMeterReadingValue(input.value),
    context: input.context,
    tenancyId,
    readAt,
    recordedAt,
    recordedByUserId: input.recordedByUserId,
    note: optional(input.note),
  };
}

export function buildMeterConsumptionIntervals(
  readings: readonly MeterReading[],
): readonly MeterConsumptionInterval[] {
  const sorted = [...readings].sort((left, right) => {
    const time = Date.parse(left.readAt) - Date.parse(right.readAt);
    if (time !== 0) return time;
    const recorded = Date.parse(left.recordedAt) - Date.parse(right.recordedAt);
    if (recorded !== 0) return recorded;
    return left.id.localeCompare(right.id);
  });

  const intervals: MeterConsumptionInterval[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const from = sorted[index - 1]!;
    const to = sorted[index]!;
    if (from.meterId !== to.meterId) {
      throw new DomainError(
        'METER_READING_METER_MISMATCH',
        'Consumption intervals require readings from exactly one Meter.',
      );
    }

    const consumption = meterReadingDifference(to.value, from.value);
    intervals.push({
      fromReadingId: from.id,
      toReadingId: to.id,
      fromReadAt: from.readAt,
      toReadAt: to.readAt,
      fromValue: from.value,
      toValue: to.value,
      consumption,
      continuity:
        consumption === null ? 'decrease_detected' : 'continuous',
    });
  }

  return intervals;
}
