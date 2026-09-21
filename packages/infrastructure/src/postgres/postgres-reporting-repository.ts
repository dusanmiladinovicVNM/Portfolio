import type postgres from 'postgres';
import type { ReportingRepository } from '@portfolio/application';
import {
  asLeaseAgreementId,
  asPropertyId,
  asTenancyId,
  asTenancyTermVersionId,
  asUnitId,
  createPortfolioDashboard,
  createReportingTermSummary,
  createUnitReportingOverview,
  type DateOnly,
  type LeaseAgreementStatus,
  type PortfolioDashboard,
  type ReportingContractCoverageStatus,
  type ReportingCurrentOperations,
  type ReportingOccupancyStatus,
  type TermSourceType,
  type TenancyStatus,
  type UnitId,
  type UnitReportingOverview,
  type UnitType,
  type BillingFrequency,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

type DateValue = string | Date | null;
type NumericValue = string | number | bigint;

interface UnitSnapshotRow {
  unit_id: string;
  property_id: string;
  property_code: string;
  property_name: string;
  unit_code: string;
  unit_number: string;
  unit_type: UnitType;
  floor: string | null;
  area_m2: NumericValue | null;
  rooms: NumericValue | null;
  occupancy_status: ReportingOccupancyStatus;
  tenancy_id: string | null;
  tenancy_code: string | null;
  tenancy_status: TenancyStatus | null;
  tenancy_planned_start: DateValue;
  tenancy_planned_end: DateValue;
  tenancy_actual_start: DateValue;
  tenancy_actual_end: DateValue;
  contract_coverage_status: ReportingContractCoverageStatus;
  current_draft_agreement_count: NumericValue;
  agreement_id: string | null;
  agreement_code: string | null;
  agreement_status: LeaseAgreementStatus | null;
  agreement_effective_from: DateValue;
  agreement_effective_to: DateValue;
  agreement_signed_at: DateValue;
  term_version_id: string | null;
  term_source_type: TermSourceType | null;
  term_effective_from: DateValue;
  term_currency: string | null;
  term_base_rent: NumericValue | null;
  term_service_charge: NumericValue | null;
  term_utilities_advance: NumericValue | null;
  term_parking_rent: NumericValue | null;
  term_other_recurring_charge: NumericValue | null;
  term_recurring_total: NumericValue | null;
  term_deposit_required: NumericValue | null;
  term_billing_frequency: BillingFrequency | null;
  open_maintenance_issue_count: NumericValue;
  urgent_maintenance_issue_count: NumericValue;
  open_maintenance_work_order_count: NumericValue;
  located_asset_count: NumericValue;
  active_asset_count: NumericValue;
  inactive_asset_count: NumericValue;
  active_service_plan_count: NumericValue;
  open_warranty_claim_count: NumericValue;
  active_meter_count: NumericValue;
}

interface CostSummaryRow {
  currency: string;
  capex: NumericValue;
  opex: NumericValue;
  unclassified: NumericValue;
  total: NumericValue;
}

interface PropertySummaryRow {
  property_id: string;
  property_code: string;
  property_name: string;
  unit_count: NumericValue;
  occupied_unit_count: NumericValue;
  planned_unit_count: NumericValue;
  vacant_unit_count: NumericValue;
  current_open_maintenance_issue_count: NumericValue;
  current_urgent_maintenance_issue_count: NumericValue;
  current_located_asset_count: NumericValue;
  current_active_asset_count: NumericValue;
  current_active_meter_count: NumericValue;
}

interface OperationsRow {
  open_maintenance_issue_count: NumericValue;
  urgent_maintenance_issue_count: NumericValue;
  open_maintenance_work_order_count: NumericValue;
  located_asset_count: NumericValue;
  active_asset_count: NumericValue;
  inactive_asset_count: NumericValue;
  active_service_plan_count: NumericValue;
  open_warranty_claim_count: NumericValue;
  active_meter_count: NumericValue;
}

function dateOnly(value: DateValue): DateOnly | null {
  if (value === null) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10) as DateOnly;
  }
  return value.slice(0, 10) as DateOnly;
}

function count(value: NumericValue): number {
  return Number(value);
}

function decimal(value: NumericValue): string {
  return String(value);
}

function operations(row: {
  open_maintenance_issue_count: NumericValue;
  urgent_maintenance_issue_count: NumericValue;
  open_maintenance_work_order_count: NumericValue;
  located_asset_count: NumericValue;
  active_asset_count: NumericValue;
  inactive_asset_count: NumericValue;
  active_service_plan_count: NumericValue;
  open_warranty_claim_count: NumericValue;
  active_meter_count: NumericValue;
}): ReportingCurrentOperations {
  return {
    openMaintenanceIssueCount: count(row.open_maintenance_issue_count),
    urgentMaintenanceIssueCount: count(row.urgent_maintenance_issue_count),
    openMaintenanceWorkOrderCount: count(row.open_maintenance_work_order_count),
    locatedAssetCount: count(row.located_asset_count),
    activeAssetCount: count(row.active_asset_count),
    inactiveAssetCount: count(row.inactive_asset_count),
    activeServicePlanCount: count(row.active_service_plan_count),
    openWarrantyClaimCount: count(row.open_warranty_claim_count),
    activeMeterCount: count(row.active_meter_count),
  };
}

function costSummary(row: CostSummaryRow) {
  return {
    currency: row.currency,
    capex: decimal(row.capex),
    opex: decimal(row.opex),
    unclassified: decimal(row.unclassified),
    total: decimal(row.total),
  };
}

export class PostgresReportingRepository implements ReportingRepository {
  constructor(private readonly sql: Sql) {}

  async getUnitOverview(
    unitId: UnitId,
    asOf: DateOnly,
  ): Promise<UnitReportingOverview | null> {
    return this.sql.begin(
      'isolation level repeatable read read only',
      async (tx) => {
        const snapshotRows = await tx<UnitSnapshotRow[]>`
          select *
          from public.reporting_unit_snapshots(${asOf}::date)
          where unit_id = ${unitId}
          limit 1
        `;

        const row = snapshotRows[0];
        if (!row) return null;

        const costRows = await tx<CostSummaryRow[]>`
          select currency, capex, opex, unclassified, total
          from public.reporting_unit_cost_summaries(${asOf}::date)
          where unit_id = ${unitId}
          order by currency
        `;

        const tenancy =
          row.tenancy_id === null
            ? null
            : {
                id: asTenancyId(row.tenancy_id),
                code: row.tenancy_code!,
                currentStatus: row.tenancy_status!,
                plannedStart: dateOnly(row.tenancy_planned_start),
                plannedEnd: dateOnly(row.tenancy_planned_end),
                actualStart: dateOnly(row.tenancy_actual_start),
                actualEnd: dateOnly(row.tenancy_actual_end),
              };

        const effectiveTerms =
          row.term_version_id === null
            ? null
            : createReportingTermSummary({
                id: asTenancyTermVersionId(row.term_version_id),
                sourceType: row.term_source_type!,
                effectiveFrom: dateOnly(row.term_effective_from)!,
                currency: row.term_currency!,
                baseRent: decimal(row.term_base_rent!),
                serviceCharge: decimal(row.term_service_charge!),
                utilitiesAdvance: decimal(row.term_utilities_advance!),
                parkingRent: decimal(row.term_parking_rent!),
                otherRecurringCharge: decimal(row.term_other_recurring_charge!),
                recurringTotal: decimal(row.term_recurring_total!),
                depositRequired: decimal(row.term_deposit_required!),
                billingFrequency: row.term_billing_frequency!,
              });

        return createUnitReportingOverview({
          asOf,
          unitId: asUnitId(row.unit_id),
          propertyId: asPropertyId(row.property_id),
          propertyCode: row.property_code,
          propertyName: row.property_name,
          unitCode: row.unit_code,
          unitNumber: row.unit_number,
          unitType: row.unit_type,
          floor: row.floor,
          areaM2: row.area_m2 === null ? null : Number(row.area_m2),
          rooms: row.rooms === null ? null : Number(row.rooms),
          occupancyStatus: row.occupancy_status,
          tenancy,
          contract: {
            coverageStatus: row.contract_coverage_status,
            currentDraftAgreementCount: count(row.current_draft_agreement_count),
            agreementId:
              row.agreement_id === null
                ? null
                : asLeaseAgreementId(row.agreement_id),
            agreementCode: row.agreement_code,
            agreementCurrentStatus: row.agreement_status,
            effectiveFrom: dateOnly(row.agreement_effective_from),
            effectiveTo: dateOnly(row.agreement_effective_to),
            signedAt: dateOnly(row.agreement_signed_at),
            effectiveTerms,
          },
          currentOperations: operations(row),
          unitAttributedCostsByCurrency: costRows.map(costSummary),
        });
      },
    );
  }

  async getPortfolioDashboard(asOf: DateOnly): Promise<PortfolioDashboard> {
    return this.sql.begin(
      'isolation level repeatable read read only',
      async (tx) => {
        const propertyRows = await tx<PropertySummaryRow[]>`
          select *
          from public.reporting_property_summaries(${asOf}::date)
          order by lower(property_code), property_id
        `;

        const costRows = await tx<CostSummaryRow[]>`
          select currency, capex, opex, unclassified, total
          from public.reporting_portfolio_cost_summaries(${asOf}::date)
          order by currency
        `;

        const operationRows = await tx<OperationsRow[]>`
          select
            (
              select count(*)
              from public.maintenance_issues
              where status = 'open'
            )::bigint as open_maintenance_issue_count,
            (
              select count(*)
              from public.maintenance_issues
              where status = 'open' and priority = 'urgent'
            )::bigint as urgent_maintenance_issue_count,
            (
              select count(*)
              from public.maintenance_work_orders
              where status not in ('completed', 'cancelled')
            )::bigint as open_maintenance_work_order_count,
            (
              select count(*)
              from public.assets
              where property_id is not null
            )::bigint as located_asset_count,
            (
              select count(*)
              from public.assets
              where status = 'active'
            )::bigint as active_asset_count,
            (
              select count(*)
              from public.assets
              where status = 'inactive'
            )::bigint as inactive_asset_count,
            (
              select count(*)
              from public.asset_service_plans sp
              join public.assets a on a.id = sp.asset_id
              where sp.status = 'active'
                and a.status not in ('retired', 'replaced')
            )::bigint as active_service_plan_count,
            (
              select count(*)
              from public.asset_warranty_claims
              where status in ('draft', 'submitted', 'approved')
            )::bigint as open_warranty_claim_count,
            (
              select count(*)
              from public.meters
              where status = 'active'
            )::bigint as active_meter_count
        `;

        const properties = propertyRows.map((row) => ({
          propertyId: asPropertyId(row.property_id),
          propertyCode: row.property_code,
          propertyName: row.property_name,
          unitCount: count(row.unit_count),
          occupiedUnitCount: count(row.occupied_unit_count),
          plannedUnitCount: count(row.planned_unit_count),
          vacantUnitCount: count(row.vacant_unit_count),
          currentOpenMaintenanceIssueCount: count(
            row.current_open_maintenance_issue_count,
          ),
          currentUrgentMaintenanceIssueCount: count(
            row.current_urgent_maintenance_issue_count,
          ),
          currentLocatedAssetCount: count(row.current_located_asset_count),
          currentActiveAssetCount: count(row.current_active_asset_count),
          currentActiveMeterCount: count(row.current_active_meter_count),
        }));

        const totals = properties.reduce(
          (acc, property) => ({
            unitCount: acc.unitCount + property.unitCount,
            occupiedUnitCount:
              acc.occupiedUnitCount + property.occupiedUnitCount,
            plannedUnitCount:
              acc.plannedUnitCount + property.plannedUnitCount,
            vacantUnitCount: acc.vacantUnitCount + property.vacantUnitCount,
          }),
          {
            unitCount: 0,
            occupiedUnitCount: 0,
            plannedUnitCount: 0,
            vacantUnitCount: 0,
          },
        );

        const ops = operationRows[0];
        if (!ops) {
          throw new Error(
            'Portfolio reporting operations projection returned no row.',
          );
        }

        return createPortfolioDashboard({
          asOf,
          propertyCount: properties.length,
          ...totals,
          currentOperations: operations(ops),
          portfolioCostsByCurrency: costRows.map(costSummary),
          properties,
        });
      },
    );
  }
}
