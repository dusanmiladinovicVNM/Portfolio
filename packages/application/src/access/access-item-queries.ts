import {
  DomainError,
  deriveAccessItemState,
  type AccessItem,
  type AccessItemId,
  type PropertyId,
  type TenancyId,
  type UnitId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { AccessItemRepository } from './access-item-repository.js';

async function withState(repository: AccessItemRepository, item: AccessItem) {
  const lastTransaction = await repository.getLastTransaction(item.id);
  return {
    item,
    state: deriveAccessItemState(lastTransaction),
  };
}

export async function getAccessItemQuery(
  repository: AccessItemRepository,
  actor: Actor,
  id: AccessItemId,
) {
  requireCapability(actor, 'access_items:read');
  const item = await repository.getItemById(id);
  if (!item) {
    throw new DomainError('ACCESS_ITEM_NOT_FOUND', 'AccessItem not found.');
  }
  return {
    ...(await withState(repository, item)),
    transactions: await repository.listTransactions(id),
  };
}

export async function listAccessItemsByPropertyQuery(
  repository: AccessItemRepository,
  actor: Actor,
  propertyId: PropertyId,
) {
  requireCapability(actor, 'access_items:read');
  const items = await repository.listItemsByProperty(propertyId);
  return Promise.all(items.map((item) => withState(repository, item)));
}

export async function listAccessItemsByUnitQuery(
  repository: AccessItemRepository,
  actor: Actor,
  unitId: UnitId,
) {
  requireCapability(actor, 'access_items:read');
  const items = await repository.listItemsByUnit(unitId);
  return Promise.all(items.map((item) => withState(repository, item)));
}

export async function listCurrentAccessItemsByTenancyQuery(
  repository: AccessItemRepository,
  actor: Actor,
  tenancyId: TenancyId,
) {
  requireCapability(actor, 'access_items:read');
  const items = await repository.listCurrentItemsByTenancy(tenancyId);
  return Promise.all(items.map((item) => withState(repository, item)));
}
