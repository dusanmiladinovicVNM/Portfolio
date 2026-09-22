import {
  asMeterReadingValue,
} from '@portfolio/domain';
import type {
  MeterDetailResponse,
  MeterReadingBoundaryResponse,
  MeterReadingResponse,
  MeterResponse,
} from '@portfolio/contracts';

function sameImmutableMeterIdentity(
  left: MeterResponse,
  right: MeterResponse,
): boolean {
  return (
    left.id === right.id &&
    left.code === right.code &&
    left.serialNumber === right.serialNumber &&
    left.utilityType === right.utilityType &&
    left.measurementUnit === right.measurementUnit &&
    left.unitId === right.unitId &&
    left.spaceId === right.spaceId &&
    left.installedAt === right.installedAt &&
    left.recordedAt === right.recordedAt &&
    left.recordedByUserId === right.recordedByUserId
  );
}

export function assertUnitMetersOwner(
  unitId: string,
  meters: readonly MeterResponse[],
): void {
  if (meters.some((meter) => meter.unitId !== unitId)) {
    throw new Error('Unit Meter list contains a Meter owned by another Unit.');
  }
}

export function assertMeterDetailOwner(
  unitId: string,
  meterId: string,
  detail: MeterDetailResponse,
): void {
  if (detail.meter.id !== meterId || detail.meter.unitId !== unitId) {
    throw new Error('Meter detail does not match the selected Unit/Meter owner.');
  }

  if (detail.readings.some((reading) => reading.meterId !== meterId)) {
    throw new Error('Meter detail contains a Reading owned by another Meter.');
  }

  const readingIds = new Set(detail.readings.map((reading) => reading.id));
  if (
    detail.boundaries.some(
      (boundary) => !readingIds.has(boundary.readingId),
    )
  ) {
    throw new Error(
      'Meter detail contains a Boundary whose Reading is outside this Meter.',
    );
  }

  if (
    detail.consumptionIntervals.some(
      (interval) =>
        !readingIds.has(interval.fromReadingId) ||
        !readingIds.has(interval.toReadingId),
    )
  ) {
    throw new Error(
      'Meter consumption interval references a Reading outside this Meter.',
    );
  }
}

export function assertCreatedMeter(
  expected: {
    readonly code: string;
    readonly serialNumber: string;
    readonly utilityType: MeterResponse['utilityType'];
    readonly measurementUnit: MeterResponse['measurementUnit'];
    readonly unitId: string;
    readonly spaceId: string | null;
    readonly label: string;
    readonly installedAt: string;
  },
  meter: MeterResponse,
): void {
  if (
    meter.code !== expected.code ||
    meter.serialNumber !== expected.serialNumber ||
    meter.utilityType !== expected.utilityType ||
    meter.measurementUnit !== expected.measurementUnit ||
    meter.unitId !== expected.unitId ||
    meter.spaceId !== expected.spaceId ||
    meter.label !== expected.label ||
    meter.installedAt !== expected.installedAt ||
    meter.status !== 'active' ||
    meter.retiredAt !== null ||
    meter.retirementRecordedAt !== null ||
    meter.retiredByUserId !== null ||
    meter.retirementReason !== null ||
    meter.version !== 1
  ) {
    throw new Error('Created Meter response does not match the submitted Meter.');
  }
}

export function assertMeterLabelMutationOwner(
  current: MeterResponse,
  label: string,
  response: MeterResponse,
): void {
  if (!sameImmutableMeterIdentity(current, response)) {
    throw new Error('Meter label response changed immutable Meter identity.');
  }
  if (
    response.label !== label ||
    response.status !== current.status ||
    response.retiredAt !== current.retiredAt ||
    response.retirementRecordedAt !== current.retirementRecordedAt ||
    response.retiredByUserId !== current.retiredByUserId ||
    response.retirementReason !== current.retirementReason ||
    response.version !== current.version + 1
  ) {
    throw new Error('Meter label response does not match the requested correction.');
  }
}

export function assertMeterRetirementMutationOwner(
  current: MeterResponse,
  expected: {
    readonly retiredAt: string;
    readonly retirementReason: string;
  },
  response: MeterResponse,
): void {
  if (!sameImmutableMeterIdentity(current, response)) {
    throw new Error('Meter retirement response changed immutable Meter identity.');
  }
  if (
    response.label !== current.label ||
    response.status !== 'retired' ||
    response.retiredAt !== expected.retiredAt ||
    response.retirementRecordedAt === null ||
    response.retiredByUserId === null ||
    response.retirementReason !== expected.retirementReason ||
    response.version !== current.version + 1
  ) {
    throw new Error('Meter retirement response does not match the requested terminal state.');
  }
}

export function assertMeterReadingMutationOwner(
  meterId: string,
  expected: {
    readonly value: string;
    readonly readAt: string;
    readonly note: string | null;
  },
  reading: MeterReadingResponse,
): void {
  if (
    reading.meterId !== meterId ||
    reading.value !== asMeterReadingValue(expected.value) ||
    reading.readAt !== expected.readAt ||
    reading.note !== expected.note
  ) {
    throw new Error('Meter Reading response does not match the submitted observation.');
  }
}

export function assertMeterBoundaryMutationOwner(
  reading: MeterReadingResponse,
  expected: {
    readonly tenancyId: string;
    readonly type: MeterReadingBoundaryResponse['type'];
  },
  boundary: MeterReadingBoundaryResponse,
): void {
  if (
    boundary.readingId !== reading.id ||
    boundary.tenancyId !== expected.tenancyId ||
    boundary.type !== expected.type
  ) {
    throw new Error('Meter boundary response does not match the exact Reading/Tenancy role.');
  }
}

export function findCommittedReading(
  detail: MeterDetailResponse,
  expected: {
    readonly value: string;
    readonly readAt: string;
    readonly note: string | null;
  },
): MeterReadingResponse | null {
  const normalizedValue = asMeterReadingValue(expected.value);
  return (
    detail.readings.find(
      (reading) =>
        reading.readAt === expected.readAt &&
        reading.value === normalizedValue &&
        reading.note === expected.note,
    ) ?? null
  );
}

export function findCommittedBoundary(
  detail: MeterDetailResponse,
  expected: {
    readonly readingId: string;
    readonly tenancyId: string;
    readonly type: MeterReadingBoundaryResponse['type'];
  },
): MeterReadingBoundaryResponse | null {
  return (
    detail.boundaries.find(
      (boundary) =>
        boundary.readingId === expected.readingId &&
        boundary.tenancyId === expected.tenancyId &&
        boundary.type === expected.type,
    ) ?? null
  );
}
