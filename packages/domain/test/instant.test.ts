import { describe, expect, it } from 'vitest';
import { asInstant } from '../src/index.js';

describe('canonical Instant', () => {
  it('rejects timestamps without an explicit UTC offset', () => {
    expect(() => asInstant('2026-09-20T00:30:00')).toThrowError(
      expect.objectContaining({ code: 'INVALID_INSTANT' }),
    );
  });

  it('accepts Z timestamps and normalizes explicit numeric offsets to UTC', () => {
    expect(asInstant('2026-09-20T00:30:00Z')).toBe(
      '2026-09-20T00:30:00.000Z',
    );
    expect(asInstant('2026-09-20T00:30:00+02:00')).toBe(
      '2026-09-19T22:30:00.000Z',
    );
  });
});
