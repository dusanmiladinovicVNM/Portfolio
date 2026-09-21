import { describe, expect, it } from 'vitest';
import { partyListResponseSchema } from '@portfolio/contracts';
import { partiesByIdsPath } from '../src/api/paths.js';

describe('Party lifecycle resolution', () => {
  it('builds a deterministic deduplicated batch URL', () => {
    expect(
      partiesByIdsPath([
        '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ]),
    ).toBe(
      '/parties?id=11111111-1111-4111-8111-111111111111&id=22222222-2222-4222-8222-222222222222',
    );
  });

  it('uses the shared Party response contract for batch results', () => {
    expect(partyListResponseSchema.parse({ items: [] })).toEqual({ items: [] });
  });
});
