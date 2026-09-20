import { DomainError } from '../shared/domain-error.js';
import { asInstant } from '../shared/instant.js';
import type {
  AccessItemId,
  AccessItemTransactionId,
  PropertyId,
  SpaceId,
  TenancyId,
  UnitId,
  UserId,
} from '../shared/entity-id.js';

export const ACCESS_ITEM_KINDS = ['key', 'card', 'remote'] as const;
export const ACCESS_ITEM_STATUSES = ['active', 'retired'] as const;
export const ACCESS_ITEM_TRANSACTION_TYPES = ['issued', 'returned', 'lost'] as const;

export type AccessItemKind = (typeof ACCESS_ITEM_KINDS)[number];
export type AccessItemStatus = (typeof ACCESS_ITEM_STATUSES)[number];
export type AccessItemTransactionType =
  (typeof ACCESS_ITEM_TRANSACTION_TYPES)[number];
export type AccessItemStateKind = 'available' | 'issued' | 'lost';

export interface AccessItem {
  readonly id: AccessItemId;
  readonly code: string;
  readonly kind: AccessItemKind;
  readonly propertyId: PropertyId;
  readonly unitId: UnitId | null;
  readonly spaceId: SpaceId | null;
  readonly label: string;
  readonly status: AccessItemStatus;
  readonly retiredAt: string | null;
  readonly retiredByUserId: UserId | null;
  readonly retirementReason: string | null;
  readonly version: number;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}

export interface AccessItemTransaction {
  readonly id: AccessItemTransactionId;
  readonly accessItemId: AccessItemId;
  readonly tenancyId: TenancyId;
  readonly type: AccessItemTransactionType;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
  readonly note: string | null;
}

export interface AccessItemState {
  readonly kind: AccessItemStateKind;
  readonly tenancyId: TenancyId | null;
  readonly lastTransaction: AccessItemTransaction | null;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError('ACCESS_ITEM_REQUIRED_FIELD', `${field} is required.`);
  }
  return normalized;
}

function optional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function assertNotBefore(
  value: string,
  notBefore: string,
  field: string,
  predecessor: string,
): void {
  if (Date.parse(value) < Date.parse(notBefore)) {
    throw new DomainError(
      'ACCESS_ITEM_TIMESTAMP_ORDER_INVALID',
      `${field} cannot be before ${predecessor}.`,
    );
  }
}

export function accessItemUtcCalendarDate(value: string, field: string): string {
  const parsed = asInstant(value, field, 'ACCESS_ITEM_INVALID_TIMESTAMP');
  return new Date(parsed).toISOString().slice(0, 10);
}

export function createAccessItem(input: {
  readonly id: AccessItemId;
  readonly code: string;
  readonly kind: AccessItemKind;
  readonly propertyId: PropertyId;
  readonly unitId?: UnitId | null;
  readonly spaceId?: SpaceId | null;
  readonly label: string;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
}): AccessItem {
  if (input.spaceId != null && input.unitId == null) {
    throw new DomainError(
      'ACCESS_ITEM_SPACE_REQUIRES_UNIT',
      'AccessItem Space scope requires Unit scope.',
    );
  }

  return {
    id: input.id,
    code: required(input.code, 'code'),
    kind: input.kind,
    propertyId: input.propertyId,
    unitId: input.unitId ?? null,
    spaceId: input.spaceId ?? null,
    label: required(input.label, 'label'),
    status: 'active',
    retiredAt: null,
    retiredByUserId: null,
    retirementReason: null,
    version: 1,
    recordedAt: asInstant(input.recordedAt, 'recordedAt', 'ACCESS_ITEM_INVALID_TIMESTAMP'),
    recordedByUserId: input.recordedByUserId,
  };
}

export function updateAccessItemLabel(
  item: AccessItem,
  labelValue: string,
): AccessItem {
  const label = required(labelValue, 'label');
  if (label === item.label) return item;
  return {
    ...item,
    label,
    version: item.version + 1,
  };
}

export function retireAccessItem(
  item: AccessItem,
  input: {
    readonly retiredAt: string;
    readonly retiredByUserId: UserId;
    readonly retirementReason: string;
    readonly lastTransaction?: AccessItemTransaction | null;
  },
): AccessItem {
  if (item.status === 'retired') {
    throw new DomainError(
      'ACCESS_ITEM_ALREADY_RETIRED',
      'AccessItem is already retired.',
    );
  }

  const retiredAt = asInstant(input.retiredAt, 'retiredAt', 'ACCESS_ITEM_INVALID_TIMESTAMP');
  assertNotBefore(retiredAt, item.recordedAt, 'retiredAt', 'recordedAt');

  const lastTransaction = input.lastTransaction ?? null;
  if (lastTransaction !== null) {
    if (lastTransaction.accessItemId !== item.id) {
      throw new DomainError(
        'ACCESS_ITEM_TRANSACTION_PARENT_MISMATCH',
        'Last transaction belongs to another AccessItem.',
      );
    }
    if (Date.parse(retiredAt) < Date.parse(lastTransaction.occurredAt)) {
      throw new DomainError(
        'ACCESS_ITEM_RETIREMENT_BEFORE_CUSTODY',
        'AccessItem retirement cannot predate existing custody history.',
      );
    }
  }

  return {
    ...item,
    status: 'retired',
    retiredAt,
    retiredByUserId: input.retiredByUserId,
    retirementReason: required(input.retirementReason, 'retirementReason'),
    version: item.version + 1,
  };
}

export function deriveAccessItemState(
  lastTransaction: AccessItemTransaction | null,
): AccessItemState {
  if (lastTransaction === null || lastTransaction.type === 'returned') {
    return {
      kind: 'available',
      tenancyId: null,
      lastTransaction,
    };
  }

  return {
    kind: lastTransaction.type === 'issued' ? 'issued' : 'lost',
    tenancyId: lastTransaction.tenancyId,
    lastTransaction,
  };
}

export function createAccessItemTransaction(input: {
  readonly id: AccessItemTransactionId;
  readonly item: AccessItem;
  readonly tenancyId: TenancyId;
  readonly type: AccessItemTransactionType;
  readonly previous: AccessItemTransaction | null;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly recordedByUserId: UserId;
  readonly note?: string | null;
}): AccessItemTransaction {
  const occurredAt = asInstant(input.occurredAt, 'occurredAt', 'ACCESS_ITEM_INVALID_TIMESTAMP');
  const recordedAt = asInstant(input.recordedAt, 'recordedAt', 'ACCESS_ITEM_INVALID_TIMESTAMP');

  if (input.type === 'issued' && input.item.status !== 'active') {
    throw new DomainError(
      'ACCESS_ITEM_RETIRED',
      'A retired AccessItem cannot be issued.',
    );
  }

  assertNotBefore(
    occurredAt,
    input.item.recordedAt,
    'occurredAt',
    'AccessItem.recordedAt',
  );
  assertNotBefore(recordedAt, occurredAt, 'recordedAt', 'occurredAt');

  const previous = input.previous;
  if (previous !== null) {
    if (previous.accessItemId !== input.item.id) {
      throw new DomainError(
        'ACCESS_ITEM_TRANSACTION_PARENT_MISMATCH',
        'Previous transaction belongs to another AccessItem.',
      );
    }

    assertNotBefore(
      occurredAt,
      previous.occurredAt,
      'occurredAt',
      'previous transaction occurredAt',
    );
    assertNotBefore(
      recordedAt,
      previous.recordedAt,
      'recordedAt',
      'previous transaction recordedAt',
    );
  }

  const state = deriveAccessItemState(previous);

  if (input.type === 'issued') {
    if (state.kind !== 'available') {
      throw new DomainError(
        'ACCESS_ITEM_NOT_AVAILABLE',
        'Only an available AccessItem can be issued.',
      );
    }
  } else {
    if (state.kind === 'available' || state.tenancyId === null) {
      throw new DomainError(
        'ACCESS_ITEM_NOT_ASSIGNED',
        'Only an issued or lost AccessItem can be returned or reported lost.',
      );
    }

    if (input.tenancyId !== state.tenancyId) {
      throw new DomainError(
        'ACCESS_ITEM_TENANCY_MISMATCH',
        'AccessItem transaction must reference the current holding Tenancy.',
      );
    }

    if (input.type === 'lost' && state.kind !== 'issued') {
      throw new DomainError(
        'ACCESS_ITEM_ALREADY_LOST',
        'A lost AccessItem cannot be reported lost again.',
      );
    }
  }

  return {
    id: input.id,
    accessItemId: input.item.id,
    tenancyId: input.tenancyId,
    type: input.type,
    sequence: (previous?.sequence ?? 0) + 1,
    occurredAt,
    recordedAt,
    recordedByUserId: input.recordedByUserId,
    note: optional(input.note),
  };
}
