import type postgres from 'postgres';
import type { AccessItemRepository } from '@portfolio/application';
import {
  DomainError,
  asAccessItemId,
  asAccessItemTransactionId,
  asPropertyId,
  asSpaceId,
  asTenancyId,
  asUnitId,
  asUserId,
  type AccessItem,
  type AccessItemId,
  type AccessItemKind,
  type AccessItemStatus,
  type AccessItemTransaction,
  type AccessItemTransactionType,
  type PropertyId,
  type TenancyId,
  type UnitId,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PgErrorLike {
  code?: string;
  constraint_name?: string;
}

interface AccessItemRow {
  id: string;
  code: string;
  kind: AccessItemKind;
  property_id: string;
  unit_id: string | null;
  space_id: string | null;
  label: string;
  status: AccessItemStatus;
  retired_at: string | Date | null;
  retired_by_user_id: string | null;
  retirement_reason: string | null;
  version: number;
  recorded_at: string | Date;
  recorded_by_user_id: string;
}

interface AccessItemTransactionRow {
  id: string;
  access_item_id: string;
  tenancy_id: string;
  type: AccessItemTransactionType;
  sequence: number;
  occurred_at: string | Date;
  recorded_at: string | Date;
  recorded_by_user_id: string;
  note: string | null;
}

function instant(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableInstant(value: string | Date | null): string | null {
  return value === null ? null : instant(value);
}

function mapItem(row: AccessItemRow): AccessItem {
  return {
    id: asAccessItemId(row.id),
    code: row.code,
    kind: row.kind,
    propertyId: asPropertyId(row.property_id),
    unitId: row.unit_id === null ? null : asUnitId(row.unit_id),
    spaceId: row.space_id === null ? null : asSpaceId(row.space_id),
    label: row.label,
    status: row.status,
    retiredAt: nullableInstant(row.retired_at),
    retiredByUserId:
      row.retired_by_user_id === null ? null : asUserId(row.retired_by_user_id),
    retirementReason: row.retirement_reason,
    version: row.version,
    recordedAt: instant(row.recorded_at),
    recordedByUserId: asUserId(row.recorded_by_user_id),
  };
}

function mapTransaction(row: AccessItemTransactionRow): AccessItemTransaction {
  return {
    id: asAccessItemTransactionId(row.id),
    accessItemId: asAccessItemId(row.access_item_id),
    tenancyId: asTenancyId(row.tenancy_id),
    type: row.type,
    sequence: row.sequence,
    occurredAt: instant(row.occurred_at),
    recordedAt: instant(row.recorded_at),
    recordedByUserId: asUserId(row.recorded_by_user_id),
    note: row.note,
  };
}

function translate(error: unknown): DomainError | null {
  const pg = error as PgErrorLike;

  if (pg.code === '23505') {
    switch (pg.constraint_name) {
      case 'access_items_code_uq':
        return new DomainError(
          'ACCESS_ITEM_CODE_ALREADY_EXISTS',
          'AccessItem code already exists.',
        );
      case 'access_item_transactions_item_sequence_uq':
        return new DomainError(
          'ACCESS_ITEM_TRANSACTION_CONFLICT',
          'AccessItem custody history changed concurrently.',
        );
      default:
        return null;
    }
  }

  if (pg.code !== '23514') return null;

  switch (pg.constraint_name) {
    case 'access_item_transaction_tenancy_not_eligible':
      return new DomainError(
        'ACCESS_ITEM_TENANCY_NOT_ELIGIBLE',
        'AccessItem can only be issued to a current Tenancy.',
      );
    case 'access_item_transaction_before_tenancy_start':
      return new DomainError(
        'ACCESS_ITEM_ISSUE_BEFORE_TENANCY_START',
        'AccessItem issue occurrence cannot predate the Tenancy actualStart UTC calendar date.',
      );
    case 'access_item_transaction_item_not_active':
      return new DomainError(
        'ACCESS_ITEM_RETIRED',
        'A retired AccessItem cannot be issued.',
      );
    case 'access_item_transaction_property_mismatch':
      return new DomainError(
        'ACCESS_ITEM_TENANCY_PROPERTY_MISMATCH',
        'AccessItem and Tenancy must belong to the same Property.',
      );
    case 'access_item_transaction_unit_mismatch':
      return new DomainError(
        'ACCESS_ITEM_TENANCY_UNIT_MISMATCH',
        'Unit-scoped AccessItem can only be issued to a Tenancy of that Unit.',
      );
    case 'access_item_transaction_before_item_recorded':
    case 'access_item_transaction_time_order_invalid':
      return new DomainError(
        'ACCESS_ITEM_TIMESTAMP_ORDER_INVALID',
        'AccessItem transaction chronology is invalid.',
      );
    case 'access_item_transaction_not_available':
      return new DomainError(
        'ACCESS_ITEM_NOT_AVAILABLE',
        'Only an available AccessItem can be issued.',
      );
    case 'access_item_transaction_return_invalid_state':
      return new DomainError(
        'ACCESS_ITEM_NOT_ASSIGNED',
        'Only an issued or lost AccessItem can be returned.',
      );
    case 'access_item_transaction_loss_invalid_state':
      return new DomainError(
        'ACCESS_ITEM_INVALID_TRANSITION',
        'Only an issued AccessItem can be reported lost.',
      );
    case 'access_item_transaction_tenancy_mismatch':
      return new DomainError(
        'ACCESS_ITEM_TENANCY_MISMATCH',
        'AccessItem transaction must reference the current holding Tenancy.',
      );
    case 'access_item_transaction_sequence_invalid':
      return new DomainError(
        'ACCESS_ITEM_TRANSACTION_CONFLICT',
        'AccessItem custody history changed concurrently.',
      );
    case 'access_item_transaction_immutable':
      return new DomainError(
        'ACCESS_ITEM_TRANSACTION_IMMUTABLE',
        'AccessItem transactions are append-only.',
      );
    case 'access_item_retirement_before_custody':
      return new DomainError(
        'ACCESS_ITEM_RETIREMENT_BEFORE_CUSTODY',
        'AccessItem retirement cannot predate existing custody history.',
      );
    case 'access_item_invalid_transition':
    case 'access_item_lifecycle_mutation_invalid':
    case 'access_item_retirement_provenance_required':
      return new DomainError(
        'ACCESS_ITEM_INVALID_TRANSITION',
        'AccessItem lifecycle transition is invalid.',
      );
    case 'access_item_retirement_immutable':
      return new DomainError(
        'ACCESS_ITEM_ALREADY_RETIRED',
        'AccessItem retirement provenance is immutable.',
      );
    case 'access_item_version_step_invalid':
      return new DomainError(
        'ACCESS_ITEM_VERSION_CONFLICT',
        'AccessItem version must advance exactly once.',
      );
    case 'access_item_immutable':
    case 'access_item_delete_forbidden':
      return new DomainError(
        'ACCESS_ITEM_IMMUTABLE',
        'AccessItem identity, kind, scope and recording provenance are immutable.',
      );
    default:
      return null;
  }
}

async function translated<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = translate(error);
    if (mapped) throw mapped;
    throw error;
  }
}

const itemSelect = `
  select
    id, code, kind, property_id, unit_id, space_id, label,
    status, retired_at, retired_by_user_id, retirement_reason, version,
    recorded_at, recorded_by_user_id
  from public.access_items
`;

const transactionSelect = `
  select
    id, access_item_id, tenancy_id, type, sequence,
    occurred_at, recorded_at, recorded_by_user_id, note
  from public.access_item_transactions
`;

export class PostgresAccessItemRepository implements AccessItemRepository {
  constructor(private readonly sql: Sql) {}

  async getItemById(id: AccessItemId): Promise<AccessItem | null> {
    const rows = await this.sql<AccessItemRow[]>`
      ${this.sql.unsafe(itemSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapItem(rows[0]!);
  }

  async listItemsByProperty(
    propertyId: PropertyId,
  ): Promise<readonly AccessItem[]> {
    const rows = await this.sql<AccessItemRow[]>`
      ${this.sql.unsafe(itemSelect)}
      where property_id = ${propertyId}
      order by lower(code), id
    `;
    return rows.map(mapItem);
  }

  async listItemsByUnit(unitId: UnitId): Promise<readonly AccessItem[]> {
    const rows = await this.sql<AccessItemRow[]>`
      ${this.sql.unsafe(itemSelect)}
      where unit_id = ${unitId}
      order by lower(code), id
    `;
    return rows.map(mapItem);
  }

  async listCurrentItemsByTenancy(
    tenancyId: TenancyId,
  ): Promise<readonly AccessItem[]> {
    const rows = await this.sql<AccessItemRow[]>`
      select
        i.id, i.code, i.kind, i.property_id, i.unit_id, i.space_id, i.label,
        i.status, i.retired_at, i.retired_by_user_id, i.retirement_reason,
        i.version, i.recorded_at, i.recorded_by_user_id
      from public.access_items i
      join lateral (
        select t.tenancy_id, t.type
        from public.access_item_transactions t
        where t.access_item_id = i.id
        order by t.sequence desc
        limit 1
      ) latest on true
      where latest.tenancy_id = ${tenancyId}
        and latest.type in ('issued', 'lost')
      order by lower(i.code), i.id
    `;
    return rows.map(mapItem);
  }

  async codeExists(code: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from public.access_items
        where lower(btrim(code)) = lower(btrim(${code}))
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  }

  async insertItem(item: AccessItem): Promise<void> {
    await translated(async () => {
      await this.sql`
        insert into public.access_items (
          id, code, kind, property_id, unit_id, space_id, label,
          status, retired_at, retired_by_user_id, retirement_reason, version,
          recorded_at, recorded_by_user_id
        ) values (
          ${item.id}, ${item.code}, ${item.kind}, ${item.propertyId},
          ${item.unitId}, ${item.spaceId}, ${item.label},
          ${item.status}, ${item.retiredAt}, ${item.retiredByUserId},
          ${item.retirementReason}, ${item.version},
          ${item.recordedAt}, ${item.recordedByUserId}
        )
      `;
    });
  }

  async updateItem(item: AccessItem, expectedVersion: number): Promise<void> {
    await translated(async () => {
      const rows = await this.sql<{ id: string }[]>`
        update public.access_items
        set
          label = ${item.label},
          status = ${item.status},
          retired_at = ${item.retiredAt},
          retired_by_user_id = ${item.retiredByUserId},
          retirement_reason = ${item.retirementReason},
          version = ${item.version}
        where id = ${item.id}
          and version = ${expectedVersion}
        returning id
      `;

      if (rows.length === 0) {
        throw new DomainError(
          'ACCESS_ITEM_VERSION_CONFLICT',
          'AccessItem was modified concurrently.',
        );
      }
    });
  }

  async getLastTransaction(
    accessItemId: AccessItemId,
  ): Promise<AccessItemTransaction | null> {
    const rows = await this.sql<AccessItemTransactionRow[]>`
      ${this.sql.unsafe(transactionSelect)}
      where access_item_id = ${accessItemId}
      order by sequence desc
      limit 1
    `;
    return rows.length === 0 ? null : mapTransaction(rows[0]!);
  }

  async listTransactions(
    accessItemId: AccessItemId,
  ): Promise<readonly AccessItemTransaction[]> {
    const rows = await this.sql<AccessItemTransactionRow[]>`
      ${this.sql.unsafe(transactionSelect)}
      where access_item_id = ${accessItemId}
      order by sequence, id
    `;
    return rows.map(mapTransaction);
  }

  async appendTransaction(transaction: AccessItemTransaction): Promise<void> {
    await translated(async () => {
      await this.sql`
        insert into public.access_item_transactions (
          id, access_item_id, tenancy_id, type, sequence,
          occurred_at, recorded_at, recorded_by_user_id, note
        ) values (
          ${transaction.id}, ${transaction.accessItemId},
          ${transaction.tenancyId}, ${transaction.type},
          ${transaction.sequence}, ${transaction.occurredAt},
          ${transaction.recordedAt}, ${transaction.recordedByUserId},
          ${transaction.note}
        )
      `;
    });
  }
}
