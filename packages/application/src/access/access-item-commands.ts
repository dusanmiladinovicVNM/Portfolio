import {
  DomainError,
  asAccessItemId,
  asAccessItemTransactionId,
  createAccessItem,
  createAccessItemTransaction,
  deriveAccessItemState,
  type AccessItem,
  type AccessItemId,
  type AccessItemKind,
  type AccessItemTransaction,
  type PropertyId,
  type SpaceId,
  type Tenancy,
  type TenancyId,
  type UnitId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { ClockPort } from '../shared/clock.js';
import type { IdGenerator } from '../shared/id-generator.js';
import type { PortfolioRepository } from '../portfolio/portfolio-repository.js';
import type { TenancyRepository } from '../tenancy/tenancy-repository.js';
import type { AccessItemRepository } from './access-item-repository.js';

export interface AccessItemDependencies {
  accessItemRepository: AccessItemRepository;
  portfolioRepository: PortfolioRepository;
  tenancyRepository: TenancyRepository;
  idGenerator: IdGenerator;
  clock: ClockPort;
}

async function requireItem(
  repository: AccessItemRepository,
  id: AccessItemId,
): Promise<AccessItem> {
  const item = await repository.getItemById(id);
  if (!item) {
    throw new DomainError('ACCESS_ITEM_NOT_FOUND', 'AccessItem not found.');
  }
  return item;
}

async function requireTenancy(
  repository: TenancyRepository,
  id: TenancyId,
): Promise<Tenancy> {
  const tenancy = await repository.getById(id);
  if (!tenancy) {
    throw new DomainError('TENANCY_NOT_FOUND', 'Tenancy not found.');
  }
  return tenancy;
}

async function assertPhysicalScope(
  portfolioRepository: PortfolioRepository,
  scope: {
    readonly propertyId: PropertyId;
    readonly unitId: UnitId | null;
    readonly spaceId: SpaceId | null;
  },
): Promise<void> {
  if (!(await portfolioRepository.getPropertyById(scope.propertyId))) {
    throw new DomainError('PROPERTY_NOT_FOUND', 'Property not found.');
  }

  if (scope.unitId !== null) {
    const unit = await portfolioRepository.getUnitById(scope.unitId);
    if (!unit) throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
    if (unit.propertyId !== scope.propertyId) {
      throw new DomainError(
        'ACCESS_ITEM_UNIT_PROPERTY_MISMATCH',
        'AccessItem Unit must belong to its Property.',
      );
    }
  }

  if (scope.spaceId !== null) {
    const space = await portfolioRepository.getSpaceById(scope.spaceId);
    if (!space) throw new DomainError('SPACE_NOT_FOUND', 'Space not found.');
    if (scope.unitId === null || space.unitId !== scope.unitId) {
      throw new DomainError(
        'ACCESS_ITEM_SPACE_UNIT_MISMATCH',
        'AccessItem Space must belong to its Unit.',
      );
    }
  }
}

async function assertTenancyScope(
  deps: Pick<AccessItemDependencies, 'portfolioRepository'>,
  item: AccessItem,
  tenancy: Tenancy,
): Promise<void> {
  const tenancyUnit = await deps.portfolioRepository.getUnitById(tenancy.unitId);
  if (!tenancyUnit) {
    throw new DomainError('UNIT_NOT_FOUND', 'Tenancy Unit not found.');
  }

  if (tenancyUnit.propertyId !== item.propertyId) {
    throw new DomainError(
      'ACCESS_ITEM_TENANCY_PROPERTY_MISMATCH',
      'AccessItem and Tenancy must belong to the same Property.',
    );
  }

  if (item.unitId !== null && item.unitId !== tenancy.unitId) {
    throw new DomainError(
      'ACCESS_ITEM_TENANCY_UNIT_MISMATCH',
      'Unit-scoped AccessItem can only be issued to a Tenancy of that Unit.',
    );
  }
}

async function appendCustodyTransaction(
  deps: Pick<
    AccessItemDependencies,
    'accessItemRepository' | 'idGenerator' | 'clock'
  >,
  actor: Actor,
  item: AccessItem,
  tenancyId: TenancyId,
  type: 'issued' | 'returned' | 'lost',
  input: {
    readonly occurredAt: string;
    readonly note?: string | null;
  },
): Promise<AccessItemTransaction> {
  const previous = await deps.accessItemRepository.getLastTransaction(item.id);
  const transaction = createAccessItemTransaction({
    id: asAccessItemTransactionId(deps.idGenerator.next()),
    item,
    tenancyId,
    type,
    previous,
    occurredAt: input.occurredAt,
    recordedAt: deps.clock.now(),
    recordedByUserId: actor.userId,
    note: input.note,
  });
  await deps.accessItemRepository.appendTransaction(transaction);
  return transaction;
}

export async function createAccessItemCommand(
  deps: AccessItemDependencies,
  actor: Actor,
  input: {
    readonly code: string;
    readonly kind: AccessItemKind;
    readonly propertyId: PropertyId;
    readonly unitId?: UnitId | null;
    readonly spaceId?: SpaceId | null;
    readonly label: string;
  },
): Promise<AccessItem> {
  requireCapability(actor, 'access_items:write');

  const item = createAccessItem({
    id: asAccessItemId(deps.idGenerator.next()),
    code: input.code,
    kind: input.kind,
    propertyId: input.propertyId,
    unitId: input.unitId,
    spaceId: input.spaceId,
    label: input.label,
    recordedAt: deps.clock.now(),
    recordedByUserId: actor.userId,
  });

  await assertPhysicalScope(deps.portfolioRepository, item);

  if (await deps.accessItemRepository.codeExists(item.code)) {
    throw new DomainError(
      'ACCESS_ITEM_CODE_ALREADY_EXISTS',
      `AccessItem code '${item.code}' already exists.`,
    );
  }

  await deps.accessItemRepository.insertItem(item);
  return item;
}

export async function issueAccessItemCommand(
  deps: AccessItemDependencies,
  actor: Actor,
  accessItemId: AccessItemId,
  input: {
    readonly tenancyId: TenancyId;
    readonly occurredAt: string;
    readonly note?: string | null;
  },
): Promise<AccessItemTransaction> {
  requireCapability(actor, 'access_items:write');

  const item = await requireItem(deps.accessItemRepository, accessItemId);
  const tenancy = await requireTenancy(deps.tenancyRepository, input.tenancyId);

  if (
    tenancy.status !== 'planned' &&
    tenancy.status !== 'active' &&
    tenancy.status !== 'notice_given' &&
    tenancy.status !== 'move_out_pending'
  ) {
    throw new DomainError(
      'ACCESS_ITEM_TENANCY_NOT_ELIGIBLE',
      'AccessItem can only be issued to a planned or current Tenancy.',
    );
  }

  await assertTenancyScope(deps, item, tenancy);

  return appendCustodyTransaction(
    deps,
    actor,
    item,
    tenancy.id,
    'issued',
    input,
  );
}

export async function returnAccessItemCommand(
  deps: AccessItemDependencies,
  actor: Actor,
  accessItemId: AccessItemId,
  input: {
    readonly occurredAt: string;
    readonly note?: string | null;
  },
): Promise<AccessItemTransaction> {
  requireCapability(actor, 'access_items:write');
  const item = await requireItem(deps.accessItemRepository, accessItemId);
  const previous = await deps.accessItemRepository.getLastTransaction(item.id);
  const state = deriveAccessItemState(previous);

  if (state.tenancyId === null) {
    throw new DomainError(
      'ACCESS_ITEM_NOT_ASSIGNED',
      'Available AccessItem cannot be returned.',
    );
  }

  return appendCustodyTransaction(
    deps,
    actor,
    item,
    state.tenancyId,
    'returned',
    input,
  );
}

export async function reportAccessItemLostCommand(
  deps: AccessItemDependencies,
  actor: Actor,
  accessItemId: AccessItemId,
  input: {
    readonly occurredAt: string;
    readonly note?: string | null;
  },
): Promise<AccessItemTransaction> {
  requireCapability(actor, 'access_items:write');
  const item = await requireItem(deps.accessItemRepository, accessItemId);
  const previous = await deps.accessItemRepository.getLastTransaction(item.id);
  const state = deriveAccessItemState(previous);

  if (state.kind !== 'issued' || state.tenancyId === null) {
    throw new DomainError(
      state.kind === 'lost' ? 'ACCESS_ITEM_ALREADY_LOST' : 'ACCESS_ITEM_NOT_ASSIGNED',
      state.kind === 'lost'
        ? 'AccessItem is already reported lost.'
        : 'Only an issued AccessItem can be reported lost.',
    );
  }

  return appendCustodyTransaction(
    deps,
    actor,
    item,
    state.tenancyId,
    'lost',
    input,
  );
}
