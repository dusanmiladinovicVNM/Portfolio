import type postgres from 'postgres';
import type {
  OperationalWorkProjection,
  WorkRepository,
} from '@portfolio/application';
import {
  asInspectionId,
  asLeaseAgreementId,
  asMaintenanceIssueId,
  asPropertyId,
  asTenancyId,
  asUnitId,
  asUserId,
  type DateOnly,
  type InspectionStatus,
  type InspectionType,
  type MaintenanceIssuePriority,
  type TenancyStatus,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;
type DateValue = string | Date | null;

interface InspectionWorkRow {
  inspection_id: string;
  inspection_code: string;
  inspection_type: InspectionType;
  inspection_status: InspectionStatus;
  scheduled_for: DateValue;
  assigned_to_user_id: string;
  assigned_to_display_name: string | null;
  assigned_to_role: 'admin' | 'manager' | 'inspector' | null;
  property_id: string;
  property_code: string;
  property_name: string;
  unit_id: string;
  unit_code: string;
  unit_number: string;
}

interface MaintenanceWorkRow {
  issue_id: string;
  issue_code: string;
  title: string;
  priority: MaintenanceIssuePriority;
  reported_at: string | Date;
  property_id: string;
  property_code: string;
  property_name: string;
  unit_id: string | null;
  unit_code: string | null;
  unit_number: string | null;
  active_work_order_count: string | number | bigint;
  assigned_user_ids: string[];
}

interface OccupancyWorkRow {
  reason: 'contract_missing' | 'contract_draft' | 'move_out';
  tenancy_id: string;
  tenancy_code: string;
  tenancy_status: TenancyStatus;
  agreement_id: string | null;
  agreement_code: string | null;
  due_date: DateValue;
  property_id: string;
  property_code: string;
  property_name: string;
  unit_id: string;
  unit_code: string;
  unit_number: string;
}

function dateOnly(value: DateValue): DateOnly | null {
  if (value === null) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10) as DateOnly;
  }
  return value.slice(0, 10) as DateOnly;
}

function instant(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export class PostgresWorkRepository implements WorkRepository {
  constructor(private readonly sql: Sql) {}

  async getOperationalWork(
    operationalDate: DateOnly,
  ): Promise<OperationalWorkProjection> {
    return this.sql.begin(
      'isolation level repeatable read read only',
      async (tx) => {
        const inspectionRows = await tx<InspectionWorkRow[]>`
          select
            i.id as inspection_id,
            i.code as inspection_code,
            i.inspection_type,
            i.status as inspection_status,
            i.scheduled_for,
            i.assigned_to_user_id,
            staff.display_name as assigned_to_display_name,
            staff.role as assigned_to_role,
            p.id as property_id,
            p.code as property_code,
            p.name as property_name,
            u.id as unit_id,
            u.code as unit_code,
            u.unit_number
          from public.inspections i
          join public.units u on u.id = i.unit_id
          join public.properties p on p.id = u.property_id
          left join public.app_users staff
            on staff.id = i.assigned_to_user_id
           and staff.status = 'active'
          where i.status in ('draft', 'in_progress', 'locked')
          order by
            i.scheduled_for asc nulls last,
            lower(p.code),
            lower(u.code),
            lower(i.code),
            i.id
        `;

        const maintenanceRows = await tx<MaintenanceWorkRow[]>`
          select
            mi.id as issue_id,
            mi.code as issue_code,
            mi.title,
            mi.priority,
            mi.reported_at,
            p.id as property_id,
            p.code as property_code,
            p.name as property_name,
            u.id as unit_id,
            u.code as unit_code,
            u.unit_number,
            count(wo.id) filter (
              where wo.status not in ('completed', 'cancelled')
            )::bigint as active_work_order_count,
            coalesce(
              array_agg(distinct wo.assigned_user_id) filter (
                where wo.status in ('assigned', 'in_progress')
                  and wo.assigned_user_id is not null
              ),
              '{}'::uuid[]
            ) as assigned_user_ids
          from public.maintenance_issues mi
          join public.properties p on p.id = mi.property_id
          left join public.units u on u.id = mi.unit_id
          left join public.maintenance_work_orders wo on wo.issue_id = mi.id
          where mi.status = 'open'
          group by
            mi.id,
            mi.code,
            mi.title,
            mi.priority,
            mi.reported_at,
            p.id,
            p.code,
            p.name,
            u.id,
            u.code,
            u.unit_number
          order by
            case mi.priority
              when 'urgent' then 0
              when 'high' then 1
              when 'normal' then 2
              else 3
            end,
            mi.reported_at,
            lower(mi.code),
            mi.id
        `;

        const occupancyRows = await tx<OccupancyWorkRow[]>`
          with operational_tenancies as (
            select
              t.*,
              p.id as property_id,
              p.code as property_code,
              p.name as property_name,
              u.code as unit_code,
              u.unit_number,
              case
                when t.status = 'planned' then t.planned_start
                else ${operationalDate}::date
              end as coverage_date
            from public.tenancies t
            join public.units u on u.id = t.unit_id
            join public.properties p on p.id = u.property_id
            where t.status in (
              'planned',
              'active',
              'notice_given',
              'move_out_pending'
            )
          ),
          contract_drafts as (
            select
              'contract_draft'::text as reason,
              t.id as tenancy_id,
              t.code as tenancy_code,
              t.status as tenancy_status,
              a.id as agreement_id,
              a.code as agreement_code,
              a.effective_from as due_date,
              t.property_id,
              t.property_code,
              t.property_name,
              t.unit_id,
              t.unit_code,
              t.unit_number
            from operational_tenancies t
            join public.lease_agreements a
              on a.tenancy_id = t.id
             and a.status = 'draft'
          ),
          missing_contracts as (
            select
              'contract_missing'::text as reason,
              t.id as tenancy_id,
              t.code as tenancy_code,
              t.status as tenancy_status,
              null::uuid as agreement_id,
              null::text as agreement_code,
              coalesce(t.planned_start, t.actual_start) as due_date,
              t.property_id,
              t.property_code,
              t.property_name,
              t.unit_id,
              t.unit_code,
              t.unit_number
            from operational_tenancies t
            where t.status in ('planned', 'active')
              and not exists (
                select 1
                from public.lease_agreements draft
                where draft.tenancy_id = t.id
                  and draft.status = 'draft'
              )
              and not exists (
                select 1
                from public.lease_agreements signed
                where signed.tenancy_id = t.id
                  and signed.signed_at is not null
                  and signed.status in ('signed', 'superseded', 'terminated')
                  and signed.effective_from <= t.coverage_date
                  and (
                    signed.effective_to is null
                    or signed.effective_to >= t.coverage_date
                  )
                  and not exists (
                    select 1
                    from public.lease_agreements successor
                    where successor.predecessor_agreement_id = signed.id
                      and successor.signed_at is not null
                      and successor.status in (
                        'signed',
                        'superseded',
                        'terminated'
                      )
                      and successor.effective_from <= t.coverage_date
                  )
              )
          ),
          move_out as (
            select
              'move_out'::text as reason,
              t.id as tenancy_id,
              t.code as tenancy_code,
              t.status as tenancy_status,
              null::uuid as agreement_id,
              null::text as agreement_code,
              t.termination_effective_at as due_date,
              t.property_id,
              t.property_code,
              t.property_name,
              t.unit_id,
              t.unit_code,
              t.unit_number
            from operational_tenancies t
            where t.status in ('notice_given', 'move_out_pending')
          )
          select *
          from (
            select * from contract_drafts
            union all
            select * from missing_contracts
            union all
            select * from move_out
          ) operational_work
          order by
            due_date asc nulls last,
            lower(property_code),
            lower(unit_code),
            lower(tenancy_code),
            reason,
            tenancy_id
        `;

        return {
          inspections: inspectionRows.map((row) => ({
            kind: 'inspection' as const,
            inspectionId: asInspectionId(row.inspection_id),
            inspectionCode: row.inspection_code,
            inspectionType: row.inspection_type,
            inspectionStatus: row.inspection_status,
            scheduledFor: dateOnly(row.scheduled_for),
            assignedToUserId: asUserId(row.assigned_to_user_id),
            assignedToDisplayName: row.assigned_to_display_name,
            assignedToRole: row.assigned_to_role,
            propertyId: asPropertyId(row.property_id),
            propertyCode: row.property_code,
            propertyName: row.property_name,
            unitId: asUnitId(row.unit_id),
            unitCode: row.unit_code,
            unitNumber: row.unit_number,
          })),
          maintenance: maintenanceRows.map((row) => ({
            kind: 'maintenance' as const,
            issueId: asMaintenanceIssueId(row.issue_id),
            issueCode: row.issue_code,
            title: row.title,
            priority: row.priority,
            reportedAt: instant(row.reported_at),
            propertyId: asPropertyId(row.property_id),
            propertyCode: row.property_code,
            propertyName: row.property_name,
            unitId: row.unit_id === null ? null : asUnitId(row.unit_id),
            unitCode: row.unit_code,
            unitNumber: row.unit_number,
            activeWorkOrderCount: Number(row.active_work_order_count),
            assignedUserIds: row.assigned_user_ids.map(asUserId),
          })),
          occupancy: occupancyRows.map((row) => ({
            kind: 'occupancy' as const,
            reason: row.reason,
            tenancyId: asTenancyId(row.tenancy_id),
            tenancyCode: row.tenancy_code,
            tenancyStatus: row.tenancy_status,
            agreementId:
              row.agreement_id === null
                ? null
                : asLeaseAgreementId(row.agreement_id),
            agreementCode: row.agreement_code,
            dueDate: dateOnly(row.due_date),
            propertyId: asPropertyId(row.property_id),
            propertyCode: row.property_code,
            propertyName: row.property_name,
            unitId: asUnitId(row.unit_id),
            unitCode: row.unit_code,
            unitNumber: row.unit_number,
          })),
        };
      },
    );
  }
}
