import { describe, expect, it } from 'vitest';
import type {
  MeterDetailResponse,
  MeterReadingBoundaryResponse,
  MeterReadingResponse,
  MeterResponse,
} from '@portfolio/contracts';
import {
  assertCreatedMeter,
  assertMeterBoundaryMutationOwner,
  assertMeterDetailOwner,
  assertMeterLabelMutationOwner,
  assertMeterReadingMutationOwner,
  assertMeterRetirementMutationOwner,
  assertUnitMetersOwner,
  findCommittedBoundary,
  findCommittedReading,
} from '../src/dossier/meter-owner.js';

const unitId = '11111111-1111-4111-8111-111111111111';
const otherUnitId = '22222222-2222-4222-8222-222222222222';
const meterId = '33333333-3333-4333-8333-333333333333';
const readingId = '44444444-4444-4444-8444-444444444444';
const tenancyId = '55555555-5555-4555-8555-555555555555';

function meter(overrides: Partial<MeterResponse> = {}): MeterResponse {
  return {
    id: meterId,
    code: 'MTR-1',
    serialNumber: 'SN-1',
    utilityType: 'electricity',
    measurementUnit: 'kwh',
    unitId,
    spaceId: null,
    label: 'Main meter',
    installedAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    retiredAt: null,
    retirementRecordedAt: null,
    retiredByUserId: null,
    retirementReason: null,
    version: 1,
    recordedAt: '2026-09-22T08:00:00.000Z',
    recordedByUserId: '66666666-6666-4666-8666-666666666666',
    ...overrides,
  };
}

function reading(
  overrides: Partial<MeterReadingResponse> = {},
): MeterReadingResponse {
  return {
    id: readingId,
    meterId,
    value: '100.000000',
    readAt: '2026-09-22T09:00:00.000Z',
    recordedAt: '2026-09-22T09:05:00.000Z',
    recordedByUserId: '66666666-6666-4666-8666-666666666666',
    note: 'Initial read',
    ...overrides,
  };
}

function boundary(
  overrides: Partial<MeterReadingBoundaryResponse> = {},
): MeterReadingBoundaryResponse {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    readingId,
    tenancyId,
    type: 'move_in',
    recordedAt: '2026-09-22T09:06:00.000Z',
    recordedByUserId: '66666666-6666-4666-8666-666666666666',
    ...overrides,
  };
}

function detail(
  overrides: Partial<MeterDetailResponse> = {},
): MeterDetailResponse {
  return {
    meter: meter(),
    readings: [reading()],
    boundaries: [boundary()],
    consumptionIntervals: [],
    ...overrides,
  };
}

describe('Meter browser ownership and recovery guards', () => {
  it('fails closed for Unit and detail ownership mismatches', () => {
    expect(() => assertUnitMetersOwner(unitId, [meter()])).not.toThrow();
    expect(() =>
      assertUnitMetersOwner(unitId, [meter({ unitId: otherUnitId })]),
    ).toThrow('another Unit');

    expect(() => assertMeterDetailOwner(unitId, meterId, detail())).not.toThrow();
    expect(() =>
      assertMeterDetailOwner(
        unitId,
        meterId,
        detail({ meter: meter({ unitId: otherUnitId }) }),
      ),
    ).toThrow('selected Unit/Meter owner');

    expect(() =>
      assertMeterDetailOwner(
        unitId,
        meterId,
        detail({ readings: [reading({ meterId: otherUnitId })] }),
      ),
    ).toThrow('another Meter');
  });

  it('binds create and CAS mutation responses to immutable Meter identity', () => {
    expect(() =>
      assertCreatedMeter(
        {
          code: 'MTR-1',
          serialNumber: 'SN-1',
          utilityType: 'electricity',
          measurementUnit: 'kwh',
          unitId,
          spaceId: null,
          label: 'Main meter',
          installedAt: '2026-01-01T00:00:00.000Z',
        },
        meter(),
      ),
    ).not.toThrow();

    expect(() =>
      assertMeterLabelMutationOwner(
        meter(),
        'Corrected label',
        meter({ label: 'Corrected label', version: 2 }),
      ),
    ).not.toThrow();

    expect(() =>
      assertMeterRetirementMutationOwner(
        meter(),
        {
          retiredAt: '2026-09-23T10:00:00.000Z',
          retirementReason: 'Replaced',
        },
        meter({
          status: 'retired',
          retiredAt: '2026-09-23T10:00:00.000Z',
          retirementRecordedAt: '2026-09-23T10:05:00.000Z',
          retiredByUserId: '66666666-6666-4666-8666-666666666666',
          retirementReason: 'Replaced',
          version: 2,
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertMeterLabelMutationOwner(
        meter(),
        'Corrected label',
        meter({
          label: 'Corrected label',
          unitId: otherUnitId,
          version: 2,
        }),
      ),
    ).toThrow('immutable Meter identity');
  });

  it('normalizes submitted Reading value and recovers exact committed observation', () => {
    expect(() =>
      assertMeterReadingMutationOwner(
        meterId,
        {
          value: '100',
          readAt: '2026-09-22T09:00:00.000Z',
          note: 'Initial read',
        },
        reading(),
      ),
    ).not.toThrow();

    expect(
      findCommittedReading(detail(), {
        value: '100',
        readAt: '2026-09-22T09:00:00.000Z',
        note: 'Initial read',
      })?.id,
    ).toBe(readingId);

    expect(
      findCommittedReading(detail(), {
        value: '101',
        readAt: '2026-09-22T09:00:00.000Z',
        note: 'Initial read',
      }),
    ).toBeNull();
  });

  it('binds and recovers an exact Reading/Tenancy boundary role', () => {
    expect(() =>
      assertMeterBoundaryMutationOwner(
        reading(),
        { tenancyId, type: 'move_in' },
        boundary(),
      ),
    ).not.toThrow();

    expect(
      findCommittedBoundary(detail(), {
        readingId,
        tenancyId,
        type: 'move_in',
      })?.id,
    ).toBe(boundary().id);

    expect(
      findCommittedBoundary(detail(), {
        readingId,
        tenancyId,
        type: 'move_out',
      }),
    ).toBeNull();
  });

  it('accepts consumption continuity breaks as canonical read-model output', () => {
    expect(() =>
      assertMeterDetailOwner(
        unitId,
        meterId,
        detail({
          readings: [
            reading(),
            reading({
              id: '88888888-8888-4888-8888-888888888888',
              value: '3.000000',
              readAt: '2026-09-23T09:00:00.000Z',
            }),
          ],
          consumptionIntervals: [
            {
              fromReadingId: readingId,
              toReadingId: '88888888-8888-4888-8888-888888888888',
              fromReadAt: '2026-09-22T09:00:00.000Z',
              toReadAt: '2026-09-23T09:00:00.000Z',
              fromValue: '100.000000',
              toValue: '3.000000',
              consumption: null,
              continuity: 'decrease_detected',
            },
          ],
        }),
      ),
    ).not.toThrow();
  });
});
