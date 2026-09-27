import { describe, expect, it } from 'vitest';
import type {
  AccessItemEntryResponse,
  AccessItemResponse,
} from '@portfolio/contracts';
import {
  assertAccessItemLabelMutationOwner,
  assertCreatedAccessItem,
  assertUnitAccessItemsOwner,
} from '../src/dossier/access-item-owner.js';

const propertyId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const itemId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';

function item(overrides: Partial<AccessItemResponse> = {}): AccessItemResponse {
  return {
    id: itemId,
    code: 'KEY-1',
    kind: 'key',
    propertyId,
    unitId,
    spaceId: null,
    label: 'Apartment key',
    status: 'active',
    retiredAt: null,
    retiredByUserId: null,
    retirementReason: null,
    version: 1,
    recordedAt: '2026-09-27T10:00:00.000Z',
    recordedByUserId: userId,
    ...overrides,
  };
}

describe('AccessItem UI ownership', () => {
  it('accepts canonical same-Unit list state', () => {
    const entry: AccessItemEntryResponse = {
      item: item(),
      state: { kind: 'available', tenancyId: null, lastTransaction: null },
    };
    expect(() =>
      assertUnitAccessItemsOwner(propertyId, unitId, [entry]),
    ).not.toThrow();
  });

  it('rejects custody state that disagrees with the last ledger event', () => {
    const entry: AccessItemEntryResponse = {
      item: item(),
      state: {
        kind: 'issued',
        tenancyId: '66666666-6666-4666-8666-666666666666',
        lastTransaction: {
          id: '77777777-7777-4777-8777-777777777777',
          accessItemId: itemId,
          tenancyId: '66666666-6666-4666-8666-666666666666',
          type: 'lost',
          sequence: 2,
          occurredAt: '2026-09-27T11:00:00.000Z',
          recordedAt: '2026-09-27T11:00:01.000Z',
          recordedByUserId: userId,
          note: null,
        },
      },
    };
    expect(() =>
      assertUnitAccessItemsOwner(propertyId, unitId, [entry]),
    ).toThrow(/inconsistent custody state/);
  });

  it('rejects available state unless the last ledger event is returned or absent', () => {
    const entry: AccessItemEntryResponse = {
      item: item(),
      state: {
        kind: 'available',
        tenancyId: null,
        lastTransaction: {
          id: '77777777-7777-4777-8777-777777777778',
          accessItemId: itemId,
          tenancyId: '66666666-6666-4666-8666-666666666666',
          type: 'issued',
          sequence: 1,
          occurredAt: '2026-09-27T11:00:00.000Z',
          recordedAt: '2026-09-27T11:00:01.000Z',
          recordedByUserId: userId,
          note: null,
        },
      },
    };
    expect(() =>
      assertUnitAccessItemsOwner(propertyId, unitId, [entry]),
    ).toThrow(/inconsistent custody state/);
  });

  it('rejects wrong-Unit list state', () => {
    const entry: AccessItemEntryResponse = {
      item: item({ unitId: '55555555-5555-4555-8555-555555555555' }),
      state: { kind: 'available', tenancyId: null, lastTransaction: null },
    };
    expect(() =>
      assertUnitAccessItemsOwner(propertyId, unitId, [entry]),
    ).toThrow(/another Property\/Unit/);
  });

  it('locks create and label response ownership', () => {
    expect(() =>
      assertCreatedAccessItem(
        {
          code: 'KEY-1',
          kind: 'key',
          propertyId,
          unitId,
          spaceId: null,
          label: 'Apartment key',
        },
        item(),
      ),
    ).not.toThrow();

    expect(() =>
      assertAccessItemLabelMutationOwner(
        item(),
        'Main apartment key',
        item({ label: 'Main apartment key', version: 2 }),
      ),
    ).not.toThrow();

    expect(() =>
      assertAccessItemLabelMutationOwner(
        item(),
        'Main apartment key',
        item({
          unitId: '55555555-5555-4555-8555-555555555555',
          label: 'Main apartment key',
          version: 2,
        }),
      ),
    ).toThrow(/immutable identity/);
  });
});
