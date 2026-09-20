import { describe, expect, it } from 'vitest';
import {
  instantSchema,
  issueAccessItemRequestSchema,
  recordMeterReadingRequestSchema,
} from '../src/index.js';

describe('canonical Instant contract', () => {
  it('rejects offset-less timestamps', () => {
    expect(instantSchema.safeParse('2026-09-20T00:30:00').success).toBe(false);

    expect(
      recordMeterReadingRequestSchema.safeParse({
        value: '100',
        readAt: '2026-09-20T00:30:00',
      }).success,
    ).toBe(false);

    expect(
      issueAccessItemRequestSchema.safeParse({
        tenancyId: '11111111-1111-4111-8111-111111111111',
        occurredAt: '2026-09-20T00:30:00',
      }).success,
    ).toBe(false);
  });

  it('accepts Z and canonicalizes explicit numeric offsets to UTC', () => {
    expect(instantSchema.parse('2026-09-20T00:30:00Z')).toBe(
      '2026-09-20T00:30:00.000Z',
    );
    expect(instantSchema.parse('2026-09-20T00:30:00+02:00')).toBe(
      '2026-09-19T22:30:00.000Z',
    );

    expect(
      recordMeterReadingRequestSchema.parse({
        value: '100',
        readAt: '2026-09-20T00:30:00+02:00',
      }).readAt,
    ).toBe('2026-09-19T22:30:00.000Z');
  });
});
