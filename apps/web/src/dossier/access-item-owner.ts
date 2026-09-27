import type {
  AccessItemEntryResponse,
  AccessItemResponse,
  AccessItemTransactionResponse,
} from '@portfolio/contracts';

function sameImmutableIdentity(
  left: AccessItemResponse,
  right: AccessItemResponse,
): boolean {
  return (
    left.id === right.id &&
    left.code === right.code &&
    left.kind === right.kind &&
    left.propertyId === right.propertyId &&
    left.unitId === right.unitId &&
    left.spaceId === right.spaceId &&
    left.recordedAt === right.recordedAt &&
    left.recordedByUserId === right.recordedByUserId
  );
}

export function assertUnitAccessItemsOwner(
  propertyId: string,
  unitId: string,
  entries: readonly AccessItemEntryResponse[],
): void {
  for (const entry of entries) {
    if (
      entry.item.propertyId !== propertyId ||
      entry.item.unitId !== unitId
    ) {
      throw new Error(
        'Unit Keys list contains an AccessItem owned by another Property/Unit.',
      );
    }
    const last = entry.state.lastTransaction;
    if (last !== null && last.accessItemId !== entry.item.id) {
      throw new Error(
        'Unit Keys list contains custody state owned by another AccessItem.',
      );
    }
    if (
      entry.state.kind === 'available'
        ? entry.state.tenancyId !== null
        : entry.state.tenancyId === null ||
          last === null ||
          last.tenancyId !== entry.state.tenancyId
    ) {
      throw new Error('Unit Keys list contains inconsistent custody state.');
    }
  }
}

export function assertCreatedAccessItem(
  expected: {
    readonly code: string;
    readonly kind: AccessItemResponse['kind'];
    readonly propertyId: string;
    readonly unitId: string;
    readonly spaceId: string | null;
    readonly label: string;
  },
  item: AccessItemResponse,
): void {
  if (
    item.code !== expected.code ||
    item.kind !== expected.kind ||
    item.propertyId !== expected.propertyId ||
    item.unitId !== expected.unitId ||
    item.spaceId !== expected.spaceId ||
    item.label !== expected.label ||
    item.status !== 'active' ||
    item.version !== 1
  ) {
    throw new Error(
      'Created AccessItem response does not match the submitted Unit key.',
    );
  }
}

export function assertAccessItemLabelMutationOwner(
  current: AccessItemResponse,
  label: string,
  response: AccessItemResponse,
): void {
  if (!sameImmutableIdentity(current, response)) {
    throw new Error('AccessItem label response changed immutable identity.');
  }
  const expectedVersion =
    label === current.label ? current.version : current.version + 1;
  if (
    response.label !== label ||
    response.status !== current.status ||
    response.version !== expectedVersion
  ) {
    throw new Error('AccessItem label response does not match the correction.');
  }
}

export function assertAccessItemRetirementOwner(
  current: AccessItemResponse,
  reason: string,
  response: AccessItemResponse,
): void {
  if (!sameImmutableIdentity(current, response)) {
    throw new Error('AccessItem retirement response changed immutable identity.');
  }
  if (
    response.label !== current.label ||
    response.status !== 'retired' ||
    response.retiredAt === null ||
    response.retiredByUserId === null ||
    response.retirementReason !== reason ||
    response.version !== current.version + 1
  ) {
    throw new Error(
      'AccessItem retirement response does not match the terminal transition.',
    );
  }
}

export function assertAccessItemTransactionOwner(
  accessItemId: string,
  expected: {
    readonly tenancyId: string;
    readonly type: AccessItemTransactionResponse['type'];
    readonly occurredAt: string;
    readonly note: string | null;
  },
  transaction: AccessItemTransactionResponse,
): void {
  if (
    transaction.accessItemId !== accessItemId ||
    transaction.tenancyId !== expected.tenancyId ||
    transaction.type !== expected.type ||
    transaction.occurredAt !== expected.occurredAt ||
    transaction.note !== expected.note
  ) {
    throw new Error(
      'AccessItem custody response does not match the command owner/state.',
    );
  }
}
