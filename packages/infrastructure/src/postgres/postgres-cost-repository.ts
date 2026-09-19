import type postgres from 'postgres';
import type { CostRepository } from '@portfolio/application';
import {
  DomainError,
  asAssetId,
  asCostId,
  asCostReversalId,
  asCostCurrency,
  asDateOnly,
  asImprovementProjectId,
  asMaintenanceIssueId,
  asMaintenanceWorkOrderId,
  asMoneyAmount,
  asPartyId,
  asPropertyId,
  asServiceEventId,
  asSpaceId,
  asUnitId,
  asUserId,
  asWarrantyClaimId,
  asWorkItemId,
  asWorkMaterialId,
  asWorkRecordId,
  type Cost,
  type CostId,
  type CostReportingClass,
  type CostReversal,
  type CostSource,
  type PartyId,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PgErrorLike {
  code?: string;
  constraint_name?: string;
}

interface CostRow {
  id: string;
  source_kind: CostSource['kind'];
  property_id: string | null;
  unit_id: string | null;
  space_id: string | null;
  asset_id: string | null;
  warranty_claim_id: string | null;
  service_event_id: string | null;
  improvement_project_id: string | null;
  work_item_id: string | null;
  work_record_id: string | null;
  work_material_id: string | null;
  maintenance_issue_id: string | null;
  maintenance_work_order_id: string | null;
  description: string;
  amount: string | number;
  currency: string;
  incurred_on: string | Date;
  reporting_class: CostReportingClass;
  supplier_party_id: string | null;
  invoice_reference: string | null;
  recorded_at: string | Date;
  recorded_by_user_id: string;
}

interface ReversalRow {
  id: string;
  cost_id: string;
  replacement_cost_id: string | null;
  reason: string;
  recorded_at: string | Date;
  recorded_by_user_id: string;
}

function instant(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function dateOnly(value: string | Date): ReturnType<typeof asDateOnly> {
  return asDateOnly(
    value instanceof Date ? value.toISOString().slice(0, 10) : value,
  );
}

function moneyText(value: string | number): string {
  const raw = String(value);
  const [whole, fraction = ''] = raw.split('.');
  return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

function sourceFromRow(row: CostRow): CostSource {
  switch (row.source_kind) {
    case 'property':
      return { kind: 'property', propertyId: asPropertyId(row.property_id!) };
    case 'unit':
      return { kind: 'unit', unitId: asUnitId(row.unit_id!) };
    case 'space':
      return { kind: 'space', spaceId: asSpaceId(row.space_id!) };
    case 'asset':
      return { kind: 'asset', assetId: asAssetId(row.asset_id!) };
    case 'warranty_claim':
      return {
        kind: 'warranty_claim',
        warrantyClaimId: asWarrantyClaimId(row.warranty_claim_id!),
      };
    case 'service_event':
      return {
        kind: 'service_event',
        serviceEventId: asServiceEventId(row.service_event_id!),
      };
    case 'improvement_project':
      return {
        kind: 'improvement_project',
        improvementProjectId: asImprovementProjectId(
          row.improvement_project_id!,
        ),
      };
    case 'work_item':
      return { kind: 'work_item', workItemId: asWorkItemId(row.work_item_id!) };
    case 'work_record':
      return {
        kind: 'work_record',
        workRecordId: asWorkRecordId(row.work_record_id!),
      };
    case 'work_material':
      return {
        kind: 'work_material',
        workMaterialId: asWorkMaterialId(row.work_material_id!),
      };
    case 'maintenance_issue':
      return {
        kind: 'maintenance_issue',
        maintenanceIssueId: asMaintenanceIssueId(row.maintenance_issue_id!),
      };
    case 'maintenance_work_order':
      return {
        kind: 'maintenance_work_order',
        maintenanceWorkOrderId: asMaintenanceWorkOrderId(
          row.maintenance_work_order_id!,
        ),
      };
  }
}

function sourceColumns(source: CostSource): {
  propertyId: string | null;
  unitId: string | null;
  spaceId: string | null;
  assetId: string | null;
  warrantyClaimId: string | null;
  serviceEventId: string | null;
  improvementProjectId: string | null;
  workItemId: string | null;
  workRecordId: string | null;
  workMaterialId: string | null;
  maintenanceIssueId: string | null;
  maintenanceWorkOrderId: string | null;
} {
  return {
    propertyId: source.kind === 'property' ? source.propertyId : null,
    unitId: source.kind === 'unit' ? source.unitId : null,
    spaceId: source.kind === 'space' ? source.spaceId : null,
    assetId: source.kind === 'asset' ? source.assetId : null,
    warrantyClaimId:
      source.kind === 'warranty_claim' ? source.warrantyClaimId : null,
    serviceEventId:
      source.kind === 'service_event' ? source.serviceEventId : null,
    improvementProjectId:
      source.kind === 'improvement_project'
        ? source.improvementProjectId
        : null,
    workItemId: source.kind === 'work_item' ? source.workItemId : null,
    workRecordId: source.kind === 'work_record' ? source.workRecordId : null,
    workMaterialId:
      source.kind === 'work_material' ? source.workMaterialId : null,
    maintenanceIssueId:
      source.kind === 'maintenance_issue' ? source.maintenanceIssueId : null,
    maintenanceWorkOrderId:
      source.kind === 'maintenance_work_order'
        ? source.maintenanceWorkOrderId
        : null,
  };
}

function mapCost(row: CostRow): Cost {
  return {
    id: asCostId(row.id),
    source: sourceFromRow(row),
    description: row.description,
    amount: asMoneyAmount(moneyText(row.amount)),
    currency: asCostCurrency(row.currency),
    incurredOn: dateOnly(row.incurred_on),
    reportingClass: row.reporting_class,
    supplierPartyId:
      row.supplier_party_id === null ? null : asPartyId(row.supplier_party_id),
    invoiceReference: row.invoice_reference,
    recordedAt: instant(row.recorded_at),
    recordedByUserId: asUserId(row.recorded_by_user_id),
  };
}

function mapReversal(row: ReversalRow): CostReversal {
  return {
    id: asCostReversalId(row.id),
    costId: asCostId(row.cost_id),
    replacementCostId:
      row.replacement_cost_id === null
        ? null
        : asCostId(row.replacement_cost_id),
    reason: row.reason,
    recordedAt: instant(row.recorded_at),
    recordedByUserId: asUserId(row.recorded_by_user_id),
  };
}

function translate(error: unknown): DomainError | null {
  const pg = error as PgErrorLike;

  if (pg.code === '23505') {
    if (pg.constraint_name === 'cost_reversals_cost_uq') {
      return new DomainError(
        'COST_ALREADY_REVERSED',
        'Cost has already been reversed.',
      );
    }
    if (pg.constraint_name === 'cost_reversals_replacement_uq') {
      return new DomainError(
        'COST_REPLACEMENT_ALREADY_USED',
        'Replacement Cost already belongs to another correction.',
      );
    }
  }

  if (pg.code !== '23514') return null;

  switch (pg.constraint_name) {
    case 'cost_immutable':
      return new DomainError('COST_IMMUTABLE', 'Cost facts are append-only.');
    case 'cost_reversal_immutable':
      return new DomainError(
        'COST_REVERSAL_IMMUTABLE',
        'Cost reversal history is append-only.',
      );
    case 'cost_reversal_before_cost':
      return new DomainError(
        'COST_REVERSAL_BEFORE_COST',
        'Cost reversal cannot predate the original Cost.',
      );
    case 'cost_reversal_replacement_recording_mismatch':
      return new DomainError(
        'COST_REPLACEMENT_RECORDING_MISMATCH',
        'Replacement Cost and reversal must share recordedAt.',
      );
    case 'cost_reversal_replacement_recorder_mismatch':
      return new DomainError(
        'COST_REPLACEMENT_RECORDER_MISMATCH',
        'Replacement Cost and reversal must share recordedByUserId.',
      );
    case 'cost_reversal_replacement_already_reversed':
      return new DomainError(
        'COST_REPLACEMENT_ALREADY_REVERSED',
        'Replacement Cost is already reversed.',
      );
    case 'costs_amount_scale_valid':
      return new DomainError(
        'COST_AMOUNT_SCALE_INVALID',
        'Cost amount must have at most two decimal places.',
      );
    case 'costs_amount_range_valid':
      return new DomainError(
        'COST_AMOUNT_RANGE_INVALID',
        'Cost amount exceeds the supported money range.',
      );
    case 'costs_currency_supported':
      return new DomainError(
        'COST_CURRENCY_UNSUPPORTED',
        'Cost currency is not supported by this ledger.',
      );
    case 'costs_incurred_not_future':
      return new DomainError(
        'COST_INCURRED_IN_FUTURE',
        'Cost incurredOn cannot be after the UTC recording date.',
      );
    case 'costs_exactly_one_source':
    case 'costs_source_kind_matches_target':
      return new DomainError(
        'COST_SOURCE_INVALID',
        'Cost must reference exactly one source matching source kind.',
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

const costSelect = `
  select
    id, source_kind, property_id, unit_id, space_id, asset_id,
    warranty_claim_id, service_event_id, improvement_project_id,
    work_item_id, work_record_id, work_material_id,
    maintenance_issue_id, maintenance_work_order_id,
    description, amount, currency, incurred_on, reporting_class,
    supplier_party_id, invoice_reference, recorded_at, recorded_by_user_id
  from public.costs
`;

async function insertCostRow(sql: Sql, cost: Cost): Promise<void> {
  const source = sourceColumns(cost.source);
  await sql`
    insert into public.costs (
      id, source_kind,
      property_id, unit_id, space_id, asset_id,
      warranty_claim_id, service_event_id, improvement_project_id,
      work_item_id, work_record_id, work_material_id,
      maintenance_issue_id, maintenance_work_order_id,
      description, amount, currency, incurred_on, reporting_class,
      supplier_party_id, invoice_reference, recorded_at, recorded_by_user_id
    ) values (
      ${cost.id}, ${cost.source.kind},
      ${source.propertyId}, ${source.unitId}, ${source.spaceId},
      ${source.assetId}, ${source.warrantyClaimId}, ${source.serviceEventId},
      ${source.improvementProjectId}, ${source.workItemId},
      ${source.workRecordId}, ${source.workMaterialId},
      ${source.maintenanceIssueId}, ${source.maintenanceWorkOrderId},
      ${cost.description}, ${cost.amount}, ${cost.currency},
      ${cost.incurredOn}, ${cost.reportingClass}, ${cost.supplierPartyId},
      ${cost.invoiceReference}, ${cost.recordedAt}, ${cost.recordedByUserId}
    )
  `;
}

async function insertReversalRow(
  sql: Sql,
  reversal: CostReversal,
): Promise<void> {
  await sql`
    insert into public.cost_reversals (
      id, cost_id, replacement_cost_id, reason,
      recorded_at, recorded_by_user_id
    ) values (
      ${reversal.id}, ${reversal.costId}, ${reversal.replacementCostId},
      ${reversal.reason}, ${reversal.recordedAt},
      ${reversal.recordedByUserId}
    )
  `;
}

export class PostgresCostRepository implements CostRepository {
  constructor(private readonly sql: Sql) {}

  async getCostById(id: CostId): Promise<Cost | null> {
    const rows = await this.sql<CostRow[]>`
      ${this.sql.unsafe(costSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapCost(rows[0]!);
  }

  async listCostsBySource(source: CostSource): Promise<readonly Cost[]> {
    let rows: CostRow[];

    switch (source.kind) {
      case 'property':
        rows = await this.sql<CostRow[]>`
          ${this.sql.unsafe(costSelect)}
          where source_kind = 'property' and property_id = ${source.propertyId}
          order by incurred_on, id
        `;
        break;
      case 'unit':
        rows = await this.sql<CostRow[]>`
          ${this.sql.unsafe(costSelect)}
          where source_kind = 'unit' and unit_id = ${source.unitId}
          order by incurred_on, id
        `;
        break;
      case 'space':
        rows = await this.sql<CostRow[]>`
          ${this.sql.unsafe(costSelect)}
          where source_kind = 'space' and space_id = ${source.spaceId}
          order by incurred_on, id
        `;
        break;
      case 'asset':
        rows = await this.sql<CostRow[]>`
          ${this.sql.unsafe(costSelect)}
          where source_kind = 'asset' and asset_id = ${source.assetId}
          order by incurred_on, id
        `;
        break;
      case 'warranty_claim':
        rows = await this.sql<CostRow[]>`
          ${this.sql.unsafe(costSelect)}
          where source_kind = 'warranty_claim'
            and warranty_claim_id = ${source.warrantyClaimId}
          order by incurred_on, id
        `;
        break;
      case 'service_event':
        rows = await this.sql<CostRow[]>`
          ${this.sql.unsafe(costSelect)}
          where source_kind = 'service_event'
            and service_event_id = ${source.serviceEventId}
          order by incurred_on, id
        `;
        break;
      case 'improvement_project':
        rows = await this.sql<CostRow[]>`
          ${this.sql.unsafe(costSelect)}
          where source_kind = 'improvement_project'
            and improvement_project_id = ${source.improvementProjectId}
          order by incurred_on, id
        `;
        break;
      case 'work_item':
        rows = await this.sql<CostRow[]>`
          ${this.sql.unsafe(costSelect)}
          where source_kind = 'work_item'
            and work_item_id = ${source.workItemId}
          order by incurred_on, id
        `;
        break;
      case 'work_record':
        rows = await this.sql<CostRow[]>`
          ${this.sql.unsafe(costSelect)}
          where source_kind = 'work_record'
            and work_record_id = ${source.workRecordId}
          order by incurred_on, id
        `;
        break;
      case 'work_material':
        rows = await this.sql<CostRow[]>`
          ${this.sql.unsafe(costSelect)}
          where source_kind = 'work_material'
            and work_material_id = ${source.workMaterialId}
          order by incurred_on, id
        `;
        break;
      case 'maintenance_issue':
        rows = await this.sql<CostRow[]>`
          ${this.sql.unsafe(costSelect)}
          where source_kind = 'maintenance_issue'
            and maintenance_issue_id = ${source.maintenanceIssueId}
          order by incurred_on, id
        `;
        break;
      case 'maintenance_work_order':
        rows = await this.sql<CostRow[]>`
          ${this.sql.unsafe(costSelect)}
          where source_kind = 'maintenance_work_order'
            and maintenance_work_order_id = ${source.maintenanceWorkOrderId}
          order by incurred_on, id
        `;
        break;
    }

    return rows.map(mapCost);
  }

  async listCostsBySupplier(
    partyId: PartyId,
  ): Promise<readonly Cost[]> {
    const rows = await this.sql<CostRow[]>`
      ${this.sql.unsafe(costSelect)}
      where supplier_party_id = ${partyId}
      order by incurred_on, id
    `;
    return rows.map(mapCost);
  }

  async listCostsByInvoiceReference(
    invoiceReference: string,
  ): Promise<readonly Cost[]> {
    const rows = await this.sql<CostRow[]>`
      ${this.sql.unsafe(costSelect)}
      where invoice_reference = ${invoiceReference}
      order by incurred_on, id
    `;
    return rows.map(mapCost);
  }

  async getReversalByCostId(
    costId: CostId,
  ): Promise<CostReversal | null> {
    const rows = await this.sql<ReversalRow[]>`
      select
        id, cost_id, replacement_cost_id, reason,
        recorded_at, recorded_by_user_id
      from public.cost_reversals
      where cost_id = ${costId}
      limit 1
    `;
    return rows.length === 0 ? null : mapReversal(rows[0]!);
  }

  async getReversalByReplacementCostId(
    costId: CostId,
  ): Promise<CostReversal | null> {
    const rows = await this.sql<ReversalRow[]>`
      select
        id, cost_id, replacement_cost_id, reason,
        recorded_at, recorded_by_user_id
      from public.cost_reversals
      where replacement_cost_id = ${costId}
      limit 1
    `;
    return rows.length === 0 ? null : mapReversal(rows[0]!);
  }

  async insertCost(cost: Cost): Promise<void> {
    await translated(() => insertCostRow(this.sql, cost));
  }

  async insertReversal(reversal: CostReversal): Promise<void> {
    await translated(() => insertReversalRow(this.sql, reversal));
  }

  async insertCorrection(
    replacementCost: Cost,
    reversal: CostReversal,
  ): Promise<void> {
    await translated(async () => {
      await this.sql.begin(async (tx) => {
        await insertCostRow(tx as unknown as Sql, replacementCost);
        await insertReversalRow(tx as unknown as Sql, reversal);
      });
    });
  }
}
