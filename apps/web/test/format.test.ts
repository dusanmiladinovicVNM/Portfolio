import { describe, expect, it } from 'vitest';
import {
  formatExactMoney,
  formatSwissDate,
  formatSwissDateTime,
  formatTimelineOccurrence,
  formatTimelineValue,
  swissLocalDateTimeToInstant,
} from '../src/presentation/format.js';

describe('exact reporting money formatting', () => {
  it('preserves aggregates beyond JavaScript safe integer precision', () => {
    expect(
      formatExactMoney('CHF', '19999999999999999.98'),
    ).toBe('CHF 19’999’999’999’999’999.98');
  });
});

describe('Swiss presentation formatting', () => {
  it('formats date-only values without inventing an instant', () => {
    expect(formatSwissDate('2026-09-21')).toBe('21.09.2026');
  });

  it('renders instants in Europe/Zurich including daylight saving time', () => {
    expect(formatSwissDateTime('2026-09-21T10:34:00.000Z')).toBe(
      '21.09.2026 12:34',
    );
    expect(formatSwissDateTime('2026-01-21T10:34:00.000Z')).toBe(
      '21.01.2026 11:34',
    );
  });

  it('converts Swiss wall-clock input to one canonical UTC instant', () => {
    expect(swissLocalDateTimeToInstant('2026-09-21', '12:34')).toBe(
      '2026-09-21T10:34:00.000Z',
    );
    expect(swissLocalDateTimeToInstant('2026-01-21', '12:34')).toBe(
      '2026-01-21T11:34:00.000Z',
    );
  });

  it('rejects nonexistent and ambiguous DST wall-clock times', () => {
    expect(swissLocalDateTimeToInstant('2026-03-29', '02:30')).toBeNull();
    expect(swissLocalDateTimeToInstant('2026-10-25', '02:30')).toBeNull();
  });

  it('suppresses raw internal UUID values in generic timeline details', () => {
    expect(
      formatTimelineValue('05a979c0-9da5-44a8-bace-c1786fa50e0e'),
    ).toBe('Internal reference');
  });
});

describe('timeline occurrence formatting', () => {
  it('does not invent a midnight instant for date-only business events', () => {
    expect(
      formatTimelineOccurrence({
        precision: 'date',
        occurredOn: '2026-09-21',
        occurredAt: null,
      }),
    ).toBe('21.09.2026');
  });

  it('renders instant-precision events in Europe/Zurich', () => {
    expect(
      formatTimelineOccurrence({
        precision: 'instant',
        occurredOn: '2026-09-21',
        occurredAt: '2026-09-21T12:34:00+02:00',
      }),
    ).toBe('21.09.2026 12:34');
  });
});
