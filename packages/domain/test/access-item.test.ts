import { describe, expect, it } from 'vitest';
import {
  asAccessItemId,
  asAccessItemTransactionId,
  asPropertyId,
  asSpaceId,
  asTenancyId,
  asUnitId,
  asUserId,
  createAccessItem,
  createAccessItemTransaction,
  deriveAccessItemState,
  retireAccessItem,
  updateAccessItemLabel,
} from '../src/index.js';

const actor = asUserId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const propertyId = asPropertyId('11111111-1111-4111-8111-111111111111');
const unitId = asUnitId('22222222-2222-4222-8222-222222222222');
const tenancyA = asTenancyId('33333333-3333-4333-8333-333333333333');
const tenancyB = asTenancyId('44444444-4444-4444-8444-444444444444');

function item() {
  return createAccessItem({
    id: asAccessItemId('55555555-5555-4555-8555-555555555555'),
    code: 'KEY-001',
    kind: 'key',
    propertyId,
    unitId,
    label: 'Apartment entrance key',
    recordedAt: '2026-09-19T10:00:00.000Z',
    recordedByUserId: actor,
  });
}

describe('AccessItem domain', () => {
  it('requires Unit scope when Space scope is present', () => {
    expect(() =>
      createAccessItem({
        id: asAccessItemId('55555555-5555-4555-8555-555555555556'),
        code: 'KEY-002',
        kind: 'key',
        propertyId,
        spaceId: asSpaceId('66666666-6666-4666-8666-666666666666'),
        label: 'Storage key',
        recordedAt: '2026-09-19T10:00:00.000Z',
        recordedByUserId: actor,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'ACCESS_ITEM_SPACE_REQUIRES_UNIT' }),
    );
  });

  it('supports issue, loss and recovery-return as immutable custody events', () => {
    const issued = createAccessItemTransaction({
      id: asAccessItemTransactionId(
        '77777777-7777-4777-8777-777777777771',
      ),
      item: item(),
      tenancyId: tenancyA,
      type: 'issued',
      previous: null,
      occurredAt: '2026-09-19T10:05:00.000Z',
      recordedAt: '2026-09-19T10:05:00.000Z',
      recordedByUserId: actor,
    });

    expect(deriveAccessItemState(issued)).toMatchObject({
      kind: 'issued',
      tenancyId: tenancyA,
    });

    const lost = createAccessItemTransaction({
      id: asAccessItemTransactionId(
        '77777777-7777-4777-8777-777777777772',
      ),
      item: item(),
      tenancyId: tenancyA,
      type: 'lost',
      previous: issued,
      occurredAt: '2026-09-19T11:00:00.000Z',
      recordedAt: '2026-09-19T11:01:00.000Z',
      recordedByUserId: actor,
    });

    expect(deriveAccessItemState(lost)).toMatchObject({
      kind: 'lost',
      tenancyId: tenancyA,
    });

    const returned = createAccessItemTransaction({
      id: asAccessItemTransactionId(
        '77777777-7777-4777-8777-777777777773',
      ),
      item: item(),
      tenancyId: tenancyA,
      type: 'returned',
      previous: lost,
      occurredAt: '2026-09-19T12:00:00.000Z',
      recordedAt: '2026-09-19T12:00:00.000Z',
      recordedByUserId: actor,
    });

    expect(returned.sequence).toBe(3);
    expect(deriveAccessItemState(returned)).toMatchObject({
      kind: 'available',
      tenancyId: null,
    });
  });

  it('does not allow another Tenancy to return or lose the current holder item', () => {
    const issued = createAccessItemTransaction({
      id: asAccessItemTransactionId(
        '77777777-7777-4777-8777-777777777774',
      ),
      item: item(),
      tenancyId: tenancyA,
      type: 'issued',
      previous: null,
      occurredAt: '2026-09-19T10:05:00.000Z',
      recordedAt: '2026-09-19T10:05:00.000Z',
      recordedByUserId: actor,
    });

    expect(() =>
      createAccessItemTransaction({
        id: asAccessItemTransactionId(
          '77777777-7777-4777-8777-777777777775',
        ),
        item: item(),
        tenancyId: tenancyB,
        type: 'returned',
        previous: issued,
        occurredAt: '2026-09-19T11:00:00.000Z',
        recordedAt: '2026-09-19T11:00:00.000Z',
        recordedByUserId: actor,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'ACCESS_ITEM_TENANCY_MISMATCH' }),
    );
  });

  it('does not reissue an item until the previous custody is returned', () => {
    const issued = createAccessItemTransaction({
      id: asAccessItemTransactionId(
        '77777777-7777-4777-8777-777777777776',
      ),
      item: item(),
      tenancyId: tenancyA,
      type: 'issued',
      previous: null,
      occurredAt: '2026-09-19T10:05:00.000Z',
      recordedAt: '2026-09-19T10:05:00.000Z',
      recordedByUserId: actor,
    });

    expect(() =>
      createAccessItemTransaction({
        id: asAccessItemTransactionId(
          '77777777-7777-4777-8777-777777777777',
        ),
        item: item(),
        tenancyId: tenancyB,
        type: 'issued',
        previous: issued,
        occurredAt: '2026-09-19T11:00:00.000Z',
        recordedAt: '2026-09-19T11:00:00.000Z',
        recordedByUserId: actor,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'ACCESS_ITEM_NOT_AVAILABLE' }),
    );
  });

  it('keeps lifecycle separate from custody and permits return after retirement', () => {
    const issued = createAccessItemTransaction({
      id: asAccessItemTransactionId(
        '77777777-7777-4777-8777-777777777779',
      ),
      item: item(),
      tenancyId: tenancyA,
      type: 'issued',
      previous: null,
      occurredAt: '2026-09-19T10:05:00.000Z',
      recordedAt: '2026-09-19T10:05:00.000Z',
      recordedByUserId: actor,
    });

    const retired = retireAccessItem(item(), {
      retiredAt: '2026-09-19T10:10:00.000Z',
      retiredByUserId: actor,
      retirementReason: 'Lock replaced',
      lastTransaction: issued,
    });

    expect(retired).toMatchObject({
      status: 'retired',
      version: 2,
      retirementReason: 'Lock replaced',
    });

    expect(() =>
      createAccessItemTransaction({
        id: asAccessItemTransactionId(
          '77777777-7777-4777-8777-777777777780',
        ),
        item: retired,
        tenancyId: tenancyA,
        type: 'issued',
        previous: issued,
        occurredAt: '2026-09-19T10:11:00.000Z',
        recordedAt: '2026-09-19T10:11:00.000Z',
        recordedByUserId: actor,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'ACCESS_ITEM_RETIRED' }),
    );

    const returned = createAccessItemTransaction({
      id: asAccessItemTransactionId(
        '77777777-7777-4777-8777-777777777781',
      ),
      item: retired,
      tenancyId: tenancyA,
      type: 'returned',
      previous: issued,
      occurredAt: '2026-09-19T10:12:00.000Z',
      recordedAt: '2026-09-19T10:12:00.000Z',
      recordedByUserId: actor,
    });

    expect(deriveAccessItemState(returned)).toMatchObject({
      kind: 'available',
      tenancyId: null,
    });
    expect(retired.status).toBe('retired');
  });

  it('treats label as correctable metadata with optimistic version', () => {
    const corrected = updateAccessItemLabel(
      item(),
      'Main entrance — left cylinder',
    );

    expect(corrected).toMatchObject({
      label: 'Main entrance — left cylinder',
      version: 2,
      status: 'active',
    });
  });

  it('does not allow retirement to predate existing custody occurrence', () => {
    const issued = createAccessItemTransaction({
      id: asAccessItemTransactionId(
        '77777777-7777-4777-8777-777777777782',
      ),
      item: item(),
      tenancyId: tenancyA,
      type: 'issued',
      previous: null,
      occurredAt: '2026-09-19T10:15:00.000Z',
      recordedAt: '2026-09-19T10:15:00.000Z',
      recordedByUserId: actor,
    });

    expect(() =>
      retireAccessItem(item(), {
        retiredAt: '2026-09-19T10:14:59.000Z',
        retiredByUserId: actor,
        retirementReason: 'Backdated retirement',
        lastTransaction: issued,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'ACCESS_ITEM_RETIREMENT_BEFORE_CUSTODY' }),
    );
  });

  it('enforces item and transaction temporal order', () => {
    expect(() =>
      createAccessItemTransaction({
        id: asAccessItemTransactionId(
          '77777777-7777-4777-8777-777777777778',
        ),
        item: item(),
        tenancyId: tenancyA,
        type: 'issued',
        previous: null,
        occurredAt: '2026-09-19T09:59:59.000Z',
        recordedAt: '2026-09-19T10:01:00.000Z',
        recordedByUserId: actor,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'ACCESS_ITEM_TIMESTAMP_ORDER_INVALID' }),
    );
  });
});
