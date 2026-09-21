import { describe, expect, it } from 'vitest';
import {
  formatExactMoney,
  formatTimelineOccurrence,
} from '../src/presentation/format.js';

describe('exact reporting money formatting', () => {
  it('preserves aggregates beyond JavaScript safe integer precision', () => {
    expect(
      formatExactMoney('CHF', '19999999999999999.98'),
    ).toBe('CHF 19’999’999’999’999’999.98');
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
    ).toBe('2026-09-21');
  });

  it('renders instant-precision events deterministically in UTC', () => {
    expect(
      formatTimelineOccurrence({
        precision: 'instant',
        occurredOn: '2026-09-21',
        occurredAt: '2026-09-21T12:34:00+02:00',
      }),
    ).toBe('21 Sept 2026, 10:34 UTC');
  });
});
