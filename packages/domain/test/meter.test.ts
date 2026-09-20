import { describe, expect, it } from 'vitest';
import {
  asMeterId,
  asMeterReadingBoundaryId,
  asMeterReadingId,
  asSpaceId,
  asTenancyId,
  asUnitId,
  asUserId,
  asMeterReadingValue,
  buildMeterConsumptionIntervals,
  createMeter,
  createMeterReading,
  createMeterReadingBoundary,
  retireMeter,
  updateMeterLabel,
} from '../src/index.js';

const actor = asUserId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const unitId = asUnitId('11111111-1111-4111-8111-111111111111');
const tenancyId = asTenancyId('22222222-2222-4222-8222-222222222222');

function meter() {
  return createMeter({
    id: asMeterId('33333333-3333-4333-8333-333333333333'),
    code: 'MTR-001',
    serialNumber: 'SN-10001',
    utilityType: 'electricity',
    measurementUnit: 'kwh',
    unitId,
    label: 'Apartment electricity meter',
    installedAt: '2026-01-01T00:00:00.000Z',
    recordedAt: '2026-09-20T08:00:00.000Z',
    recordedByUserId: actor,
  });
}

function reading(
  id: string,
  value: string,
  readAt: string,
  recordedAt = readAt,
) {
  return createMeterReading({
    id: asMeterReadingId(id),
    meter: meter(),
    value,
    readAt,
    recordedAt,
    recordedByUserId: actor,
  });
}

describe('Meter domain', () => {
  it('creates exact physical meter identity with canonical lifecycle start', () => {
    expect(meter()).toMatchObject({
      code: 'MTR-001',
      serialNumber: 'SN-10001',
      status: 'active',
      version: 1,
      retiredAt: null,
      retirementRecordedAt: null,
      spaceId: null,
    });
  });

  it('rejects invalid utility measurement combinations', () => {
    expect(() =>
      createMeter({
        id: asMeterId('33333333-3333-4333-8333-333333333334'),
        code: 'MTR-002',
        serialNumber: 'SN-10002',
        utilityType: 'water',
        measurementUnit: 'kwh',
        unitId,
        label: 'Bad water meter',
        installedAt: '2026-01-01T00:00:00.000Z',
        recordedAt: '2026-09-20T08:00:00.000Z',
        recordedByUserId: actor,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'METER_MEASUREMENT_UNIT_INVALID' }),
    );
  });

  it('normalizes reading values to exact six-decimal strings', () => {
    expect(asMeterReadingValue('123.45')).toBe('123.450000');
    expect(asMeterReadingValue('0')).toBe('0.000000');
    expect(() => asMeterReadingValue('1.1234567')).toThrowError(
      expect.objectContaining({ code: 'METER_READING_VALUE_INVALID' }),
    );
  });

  it('keeps physical observation separate from move-in/out boundary role', () => {
    const observed = reading(
      '44444444-4444-4444-8444-444444444441',
      '100',
      '2026-09-20T09:00:00.000Z',
    );

    const moveOut = createMeterReadingBoundary({
      id: asMeterReadingBoundaryId(
        '55555555-5555-4555-8555-555555555551',
      ),
      reading: observed,
      tenancyId,
      type: 'move_out',
      recordedAt: '2026-09-20T09:05:00.000Z',
      recordedByUserId: actor,
    });

    const nextTenancy = asTenancyId(
      '22222222-2222-4222-8222-222222222223',
    );
    const moveIn = createMeterReadingBoundary({
      id: asMeterReadingBoundaryId(
        '55555555-5555-4555-8555-555555555552',
      ),
      reading: observed,
      tenancyId: nextTenancy,
      type: 'move_in',
      recordedAt: '2026-09-20T09:05:00.000Z',
      recordedByUserId: actor,
    });

    expect(moveOut.readingId).toBe(observed.id);
    expect(moveIn.readingId).toBe(observed.id);
    expect(moveOut.tenancyId).not.toBe(moveIn.tenancyId);
  });

  it('allows historical backfill while preventing readings outside physical lifetime', () => {
    const retired = retireMeter(meter(), {
      retiredAt: '2026-09-20T10:00:00.000Z',
      recordedAt: '2026-09-20T11:00:00.000Z',
      retiredByUserId: actor,
      retirementReason: 'Meter replaced',
      latestExistingReadingAt: '2026-09-20T09:00:00.000Z',
    });

    expect(
      createMeterReading({
        id: asMeterReadingId('44444444-4444-4444-8444-444444444443'),
        meter: retired,
        value: '150',
        readAt: '2026-09-20T09:30:00.000Z',
        recordedAt: '2026-09-20T12:00:00.000Z',
        recordedByUserId: actor,
      }),
    ).toMatchObject({ value: '150.000000' });

    expect(() =>
      createMeterReading({
        id: asMeterReadingId('44444444-4444-4444-8444-444444444444'),
        meter: retired,
        value: '151',
        readAt: '2026-09-20T10:00:01.000Z',
        recordedAt: '2026-09-20T12:00:00.000Z',
        recordedByUserId: actor,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'METER_READING_AFTER_RETIREMENT' }),
    );
  });

  it('treats label as correctable metadata and retirement as terminal lifecycle', () => {
    const renamed = updateMeterLabel(meter(), 'Main electricity register');
    expect(renamed).toMatchObject({
      label: 'Main electricity register',
      version: 2,
      status: 'active',
    });

    const retired = retireMeter(renamed, {
      retiredAt: '2026-09-20T10:00:00.000Z',
      recordedAt: '2026-09-20T10:05:00.000Z',
      retiredByUserId: actor,
      retirementReason: 'Replaced',
    });
    expect(retired).toMatchObject({
      status: 'retired',
      version: 3,
      retirementRecordedAt: '2026-09-20T10:05:00.000Z',
    });

    expect(() =>
      retireMeter(retired, {
        retiredAt: '2026-09-20T10:10:00.000Z',
        recordedAt: '2026-09-20T10:10:00.000Z',
        retiredByUserId: actor,
        retirementReason: 'Again',
      }),
    ).toThrowError(expect.objectContaining({ code: 'METER_ALREADY_RETIRED' }));
  });

  it('builds exact consumption intervals without inventing negative consumption', () => {
    const first = reading(
      '44444444-4444-4444-8444-444444444445',
      '100.25',
      '2026-09-20T08:00:00.000Z',
    );
    const second = reading(
      '44444444-4444-4444-8444-444444444446',
      '110.375',
      '2026-09-20T09:00:00.000Z',
    );
    const third = reading(
      '44444444-4444-4444-8444-444444444447',
      '3',
      '2026-09-20T10:00:00.000Z',
    );

    expect(buildMeterConsumptionIntervals([third, first, second])).toEqual([
      expect.objectContaining({
        consumption: asMeterReadingValue('10.125'),
        continuity: 'continuous',
      }),
      expect.objectContaining({
        consumption: null,
        continuity: 'decrease_detected',
      }),
    ]);
  });

  it('accepts optional Space placement without changing the Unit grain', () => {
    expect(
      createMeter({
        id: asMeterId('33333333-3333-4333-8333-333333333335'),
        code: 'MTR-003',
        serialNumber: 'SN-10003',
        utilityType: 'water',
        measurementUnit: 'm3',
        unitId,
        spaceId: asSpaceId('55555555-5555-4555-8555-555555555555'),
        label: 'Bathroom water meter',
        installedAt: '2026-01-01T00:00:00.000Z',
        recordedAt: '2026-09-20T08:00:00.000Z',
        recordedByUserId: actor,
      }),
    ).toMatchObject({
      utilityType: 'water',
      measurementUnit: 'm3',
    });
  });
});
