import type {
  AccessItem,
  AccessItemId,
  AccessItemTransaction,
  PropertyId,
  TenancyId,
  UnitId,
} from '@portfolio/domain';

export interface AccessItemRepository {
  getItemById(id: AccessItemId): Promise<AccessItem | null>;
  listItemsByProperty(propertyId: PropertyId): Promise<readonly AccessItem[]>;
  listItemsByUnit(unitId: UnitId): Promise<readonly AccessItem[]>;
  listCurrentItemsByTenancy(tenancyId: TenancyId): Promise<readonly AccessItem[]>;
  codeExists(code: string): Promise<boolean>;
  insertItem(item: AccessItem): Promise<void>;
  updateItem(item: AccessItem, expectedVersion: number): Promise<void>;

  getLastTransaction(
    accessItemId: AccessItemId,
  ): Promise<AccessItemTransaction | null>;
  listTransactions(
    accessItemId: AccessItemId,
  ): Promise<readonly AccessItemTransaction[]>;
  appendTransaction(transaction: AccessItemTransaction): Promise<void>;
}
