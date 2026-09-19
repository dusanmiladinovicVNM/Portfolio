import { DomainError } from '@portfolio/domain';
import type { AccessItemRepository } from '@portfolio/application';
import type {
  AccessItem,
  AccessItemId,
  AccessItemTransaction,
  PropertyId,
  TenancyId,
  UnitId,
} from '@portfolio/domain';

export class InMemoryAccessItemRepository implements AccessItemRepository {
  readonly items = new Map<AccessItemId, AccessItem>();
  readonly transactions: AccessItemTransaction[] = [];

  async getItemById(id: AccessItemId) {
    return this.items.get(id) ?? null;
  }

  async listItemsByProperty(propertyId: PropertyId) {
    return [...this.items.values()].filter(
      (item) => item.propertyId === propertyId,
    );
  }

  async listItemsByUnit(unitId: UnitId) {
    return [...this.items.values()].filter((item) => item.unitId === unitId);
  }

  async listCurrentItemsByTenancy(tenancyId: TenancyId) {
    const result: AccessItem[] = [];
    for (const item of this.items.values()) {
      const last = await this.getLastTransaction(item.id);
      if (
        last !== null &&
        last.tenancyId === tenancyId &&
        (last.type === 'issued' || last.type === 'lost')
      ) {
        result.push(item);
      }
    }
    return result;
  }

  async codeExists(code: string) {
    const normalized = code.trim().toLowerCase();
    return [...this.items.values()].some(
      (item) => item.code.trim().toLowerCase() === normalized,
    );
  }

  async insertItem(item: AccessItem) {
    if (await this.codeExists(item.code)) {
      throw new DomainError(
        'ACCESS_ITEM_CODE_ALREADY_EXISTS',
        'AccessItem code already exists.',
      );
    }
    this.items.set(item.id, item);
  }

  async getLastTransaction(accessItemId: AccessItemId) {
    return (
      this.transactions
        .filter((tx) => tx.accessItemId === accessItemId)
        .sort((a, b) => b.sequence - a.sequence)[0] ?? null
    );
  }

  async listTransactions(accessItemId: AccessItemId) {
    return this.transactions
      .filter((tx) => tx.accessItemId === accessItemId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  async appendTransaction(transaction: AccessItemTransaction) {
    const current = await this.getLastTransaction(transaction.accessItemId);
    if (transaction.sequence !== (current?.sequence ?? 0) + 1) {
      throw new DomainError(
        'ACCESS_ITEM_TRANSACTION_CONFLICT',
        'AccessItem custody history changed concurrently.',
      );
    }
    this.transactions.push(transaction);
  }
}
