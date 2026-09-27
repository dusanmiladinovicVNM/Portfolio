import { describe, expect, it } from 'vitest';
import {
  issueAccessItemCommand,
  reportAccessItemLostCommand,
  returnAccessItemCommand,
  type AccessItemRepository,
  type Actor,
  type ClockPort,
  type IdGenerator,
  type PortfolioRepository,
  type TenancyRepository,
} from '../src/index.js';
import {
  DomainError,
  asAccessItemId,
  asAccessItemTransactionId,
  asPropertyId,
  asTenancyId,
  asUnitId,
  asUserId,
  type AccessItem,
  type AccessItemId,
  type AccessItemTransaction,
  type PropertyId,
  type Tenancy,
  type TenancyId,
  type Unit,
  type UnitId,
} from '@portfolio/domain';

const itemId = asAccessItemId('10000000-0000-4000-8000-000000000001');
const propertyId = asPropertyId('10000000-0000-4000-8000-000000000002');
const unitId = asUnitId('10000000-0000-4000-8000-000000000003');
const tenancyAId = asTenancyId('10000000-0000-4000-8000-000000000004');
const tenancyBId = asTenancyId('10000000-0000-4000-8000-000000000005');
const userId = asUserId('10000000-0000-4000-8000-000000000006');
const tx1Id = asAccessItemTransactionId('10000000-0000-4000-8000-000000000011');
const tx2Id = asAccessItemTransactionId('10000000-0000-4000-8000-000000000012');
const tx3Id = asAccessItemTransactionId('10000000-0000-4000-8000-000000000013');

const actor: Actor = { userId, role: 'admin' };

const item: AccessItem = {
  id: itemId,
  code: 'KEY-CAS',
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
  recordedAt: '2026-10-01T07:00:00.000Z',
  recordedByUserId: userId,
};

const unit: Unit = {
  id: unitId,
  propertyId,
  code: 'UNIT-CAS',
  unitNumber: '1A',
  unitType: 'apartment',
  floor: null,
  areaM2: null,
  rooms: null,
  status: 'active',
  notes: '',
};

function tenancy(id: TenancyId, code: string): Tenancy {
  return {
    id,
    code,
    unitId,
    status: 'active',
    plannedStart: '2026-10-01',
    plannedEnd: null,
    actualStart: '2026-10-01',
    actualEnd: null,
    noticeGivenAt: null,
    terminationEffectiveAt: null,
    version: 3,
    parties: [],
  };
}

function tx(
  id: ReturnType<typeof asAccessItemTransactionId>,
  tenancyId: TenancyId,
  type: AccessItemTransaction['type'],
  sequence: number,
): AccessItemTransaction {
  return {
    id,
    accessItemId: itemId,
    tenancyId,
    type,
    sequence,
    occurredAt: `2026-10-01T0${7 + sequence}:00:00.000Z`,
    recordedAt: `2026-10-01T0${7 + sequence}:01:00.000Z`,
    recordedByUserId: userId,
    note: null,
  };
}

class MemoryAccessItems implements AccessItemRepository {
  readonly transactions: AccessItemTransaction[];

  constructor(transactions: readonly AccessItemTransaction[]) {
    this.transactions = [...transactions];
  }

  async getItemById(id: AccessItemId) {
    return id === itemId ? item : null;
  }
  async listItemsByProperty(_propertyId: PropertyId) { return [item]; }
  async listItemsByUnit(_unitId: UnitId) { return [item]; }
  async listCurrentItemsByTenancy(_tenancyId: TenancyId) { return [item]; }
  async codeExists(_code: string) { return false; }
  async insertItem(_item: AccessItem) {}
  async updateItem(_item: AccessItem, _expectedVersion: number) {}
  async getLastTransaction(_accessItemId: AccessItemId) {
    return this.transactions.at(-1) ?? null;
  }
  async listTransactions(_accessItemId: AccessItemId) {
    return this.transactions;
  }
  async appendTransaction(transaction: AccessItemTransaction) {
    this.transactions.push(transaction);
  }
}

const portfolioRepository = {
  async getUnitById(id: UnitId) {
    return id === unitId ? unit : null;
  },
} as unknown as PortfolioRepository;

const tenancyRepository = {
  async getById(id: TenancyId) {
    if (id === tenancyAId) return tenancy(tenancyAId, 'TEN-A');
    if (id === tenancyBId) return tenancy(tenancyBId, 'TEN-B');
    return null;
  },
} as unknown as TenancyRepository;

const clock: ClockPort = {
  now: () => '2026-10-02T12:00:00.000Z',
};

const ids: IdGenerator = {
  next: () => '10000000-0000-4000-8000-000000000099',
};

function deps(accessItemRepository: AccessItemRepository) {
  return {
    accessItemRepository,
    portfolioRepository,
    tenancyRepository,
    clock,
    idGenerator: ids,
  };
}

async function expectConflict(operation: Promise<unknown>) {
  try {
    await operation;
    throw new Error('Expected ACCESS_ITEM_TRANSACTION_CONFLICT.');
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('ACCESS_ITEM_TRANSACTION_CONFLICT');
  }
}

describe('AccessItem custody predecessor fence', () => {
  it('rejects stale return and stale lost after custody moved from TEN-A to TEN-B', async () => {
    const repository = new MemoryAccessItems([
      tx(tx1Id, tenancyAId, 'issued', 1),
      tx(tx2Id, tenancyAId, 'returned', 2),
      tx(tx3Id, tenancyBId, 'issued', 3),
    ]);

    await expectConflict(
      returnAccessItemCommand(deps(repository), actor, itemId, {
        expectedLastTransactionId: tx1Id,
        occurredAt: '2026-10-02T08:00:00.000Z',
      }),
    );
    expect(repository.transactions).toHaveLength(3);
    expect(repository.transactions.at(-1)).toMatchObject({
      id: tx3Id,
      tenancyId: tenancyBId,
      type: 'issued',
    });

    await expectConflict(
      reportAccessItemLostCommand(deps(repository), actor, itemId, {
        expectedLastTransactionId: tx1Id,
        occurredAt: '2026-10-02T08:05:00.000Z',
      }),
    );
    expect(repository.transactions).toHaveLength(3);
    expect(repository.transactions.at(-1)).toMatchObject({
      id: tx3Id,
      tenancyId: tenancyBId,
      type: 'issued',
    });
  });

  it('rejects stale issue after an unseen issue-return cycle leaves the item available again', async () => {
    const repository = new MemoryAccessItems([
      tx(tx1Id, tenancyAId, 'issued', 1),
      tx(tx2Id, tenancyAId, 'returned', 2),
    ]);

    await expectConflict(
      issueAccessItemCommand(deps(repository), actor, itemId, {
        tenancyId: tenancyBId,
        expectedLastTransactionId: null,
        occurredAt: '2026-10-02T08:00:00.000Z',
      }),
    );

    expect(repository.transactions).toHaveLength(2);
    expect(repository.transactions.at(-1)).toMatchObject({
      id: tx2Id,
      type: 'returned',
    });
  });
});
