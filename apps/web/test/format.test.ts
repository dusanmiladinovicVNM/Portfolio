import { describe, expect, it } from 'vitest';
import { formatExactMoney } from '../src/presentation/format.js';

describe('exact reporting money formatting', () => {
  it('preserves aggregates beyond JavaScript safe integer precision', () => {
    expect(
      formatExactMoney('CHF', '19999999999999999.98'),
    ).toBe('CHF 19’999’999’999’999’999.98');
  });
});
