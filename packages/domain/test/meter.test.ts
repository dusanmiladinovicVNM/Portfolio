import { describe, expect, it } from 'vitest';
import {
  asMeterId,
  asMeterReadingId,
  asSpaceId,
  asTenancyId,
  asUnitId,
  asUserId,
  asMeterReadingValue,
  buildMeterConsumptionIntervals,
  createMeter,
  createMeterReading,
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

describe('Meter domain', () => {
  it('creates exact physical meter identity with canonical lifecycle start', () => {
    expect(meter()).toMatchObject({
      code: 'MTR-001',
      serialNumber: 'SN-10001',
      status: 'active',
      version: 1,
      retiredAt: null,
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

  it('keeps regular readings meter-only and handover readings Tenancy-bound', () => {
    expect(() =>
      createMeterReading({
        id: asMeterReadingId('44444444-4444-4444-8444-444444444441'),
        meter: meter(),
        value: '100',
        context: 'regular',
        tenancyId,
        readAt: '2026-09-20T09:00:00.000Z',
        recordedAt: '2026-09-20T09:00:00.000Z',
        recordedByUserId: actor,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'METER_READING_CONTEXT_INVALID' }),
    );

    expect(() =>
      createMeterReading({
        id: asMeterReadingId('44444444-4444-4444-8444-444444444442'),
        meter: meter(),
        value: '100',
        context: 'move_in',
        readAt: '2026-09-20T09:00:00.000Z',
        recordedAt: '2026-09-20T09:00:00.000Z',
        recordedByUserId: actor,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'METER_READING_TENANCY_REQUIRED' }),
    );
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
        context: 'regular',
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
        context: 'regular',
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
    expect(retired).toMatchObject({ status: 'retired', version: 3 });

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
    const first = createMeterReading({
      id: asMeterReadingId('44444444-4444-4444-8444-444444444445'),
      meter: meter(),
      value: '100.25',
      context: 'move_in',
      tenancyId,
      readAt: '2026-09-20T08:00:00.000Z',
      recordedAt: '2026-09-20T08:00:00.000Z',
      recordedByUserId: actor,
    });
    const second = createMeterReading({
      id: asMeterReadingId('44444444-4444-4444-8444-444444444446'),
      meter: meter(),
      value: '110.375',
      context: 'regular',
      readAt: '2026-09-20T09:00:00.000Z',
      recordedAt: '2026-09-20T09:00:00.000Z',
      recordedByUserId: actor,
    });
    const third = createMeterReading({
      id: asMeterReadingId('44444444-4444-4444-8444-444444444447'),
      meter: meter(),
      value: '3',
      context: 'regular',
      readAt: '2026-09-20T10:00:00.000Z',
      recordedAt: '2026-09-20T10:00:00.000Z',
      recordedByUserId: actor,
    });

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
