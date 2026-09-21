begin;

create or replace function public.reporting_unit_snapshots(p_as_of date)
returns table (
  unit_id uuid,
  property_id uuid,
  property_code text,
  property_name text,
  unit_code text,
  unit_number text,
  unit_type text,
  floor text,
  area_m2 numeric,
  rooms numeric,
  occupancy_status text,
  tenancy_id uuid,
  tenancy_code text,
  tenancy_status text,
  tenancy_planned_start date,
  tenancy_planned_end date,
  tenancy_actual_start date,
  tenancy_actual_end date,
  contract_coverage_status text,
  agreement_id uuid,
  agreement_code text,
  agreement_status text,
  agreement_effective_from date,
  agreement_effective_to date,
  agreement_signed_at date,
  term_version_id uuid,
  term_source_type text,
  term_effective_from date,
  term_currency text,
  term_base_rent numeric,
  term_service_charge numeric,
  term_utilities_advance numeric,
  term_parking_rent numeric,
  term_other_recurring_charge numeric,
  term_recurring_total numeric,
  term_deposit_required numeric,
  term_billing_frequency text,
  open_maintenance_issue_count bigint,
  urgent_maintenance_issue_count bigint,
  open_maintenance_work_order_count bigint,
  located_asset_count bigint,
  active_asset_count bigint,
  inactive_asset_count bigint,
  active_service_plan_count bigint,
  open_warranty_claim_count bigint,
  active_meter_count bigint
)
language sql
stable
strict
as $reporting_unit_snapshots$
with unit_base as (
  select
    u.id as unit_id,
    u.property_id,
    p.code as property_code,
    p.name as property_name,
    u.code as unit_code,
    u.unit_number,
    u.unit_type,
    u.floor,
    u.area_m2,
    u.rooms
  from public.units u
  join public.properties p on p.id = u.property_id
),
selected_tenancy as (
  select
    ub.*,
    coalesce(actual_t.id, planned_t.id) as tenancy_id,
    coalesce(actual_t.code, planned_t.code) as tenancy_code,
    coalesce(actual_t.status, planned_t.status) as tenancy_status,
    coalesce(actual_t.planned_start, planned_t.planned_start) as tenancy_planned_start,
    coalesce(actual_t.planned_end, planned_t.planned_end) as tenancy_planned_end,
    coalesce(actual_t.actual_start, planned_t.actual_start) as tenancy_actual_start,
    coalesce(actual_t.actual_end, planned_t.actual_end) as tenancy_actual_end,
    case
      when actual_t.id is not null then 'occupied'
      when planned_t.id is not null then 'planned'
      else 'vacant'
    end as occupancy_status
  from unit_base ub
  left join lateral (
    select t.*
    from public.tenancies t
    where t.unit_id = ub.unit_id
      and t.actual_start is not null
      and t.actual_start <= p_as_of
      and (t.actual_end is null or t.actual_end >= p_as_of)
      and t.status in ('active', 'notice_given', 'move_out_pending', 'ended')
    order by t.actual_start desc, t.id
    limit 1
  ) actual_t on true
  left join lateral (
    select t.*
    from public.tenancies t
    where actual_t.id is null
      and t.unit_id = ub.unit_id
      and t.status = 'planned'
      and t.planned_start is not null
      and t.planned_start <= p_as_of
      and (t.planned_end is null or t.planned_end >= p_as_of)
    order by t.planned_start, t.id
    limit 1
  ) planned_t on true
),
contract_selection as (
  select
    st.*,
    agreement.id as agreement_id,
    agreement.code as agreement_code,
    agreement.status as agreement_status,
    agreement.effective_from as agreement_effective_from,
    agreement.effective_to as agreement_effective_to,
    agreement.signed_at as agreement_signed_at,
    coalesce(agreement.coverage_status, 'missing') as contract_coverage_status
  from selected_tenancy st
  left join lateral (
    select
      a.id,
      a.code,
      a.status,
      a.effective_from,
      a.effective_to,
      a.signed_at,
      case
        when a.signed_at is not null
          and a.effective_from <= p_as_of
          and (a.effective_to is null or a.effective_to >= p_as_of)
          and a.status in ('signed', 'superseded', 'terminated')
          then 'effective'
        when a.status = 'signed'
          and a.signed_at is not null
          and a.effective_from > p_as_of
          then 'future_signed'
        when a.status = 'draft'
          then 'draft_only'
        else null
      end as coverage_status,
      case
        when a.signed_at is not null
          and a.effective_from <= p_as_of
          and (a.effective_to is null or a.effective_to >= p_as_of)
          and a.status in ('signed', 'superseded', 'terminated')
          then 1
        when a.status = 'signed'
          and a.signed_at is not null
          and a.effective_from > p_as_of
          then 2
        when a.status = 'draft'
          then 3
        else 99
      end as coverage_rank
    from public.lease_agreements a
    where a.tenancy_id = st.tenancy_id
      and (
        (
          a.signed_at is not null
          and a.effective_from <= p_as_of
          and (a.effective_to is null or a.effective_to >= p_as_of)
          and a.status in ('signed', 'superseded', 'terminated')
        )
        or (
          a.status = 'signed'
          and a.signed_at is not null
          and a.effective_from > p_as_of
        )
        or a.status = 'draft'
      )
    order by
      coverage_rank,
      case when a.effective_from <= p_as_of then a.effective_from end desc nulls last,
      case when a.effective_from > p_as_of then a.effective_from end asc nulls last,
      a.id
    limit 1
  ) agreement on st.tenancy_id is not null
),
with_terms as (
  select
    cs.*,
    terms.id as term_version_id,
    terms.source_type as term_source_type,
    terms.effective_from as term_effective_from,
    terms.currency::text as term_currency,
    terms.base_rent as term_base_rent,
    terms.service_charge as term_service_charge,
    terms.utilities_advance as term_utilities_advance,
    terms.parking_rent as term_parking_rent,
    terms.other_recurring_charge as term_other_recurring_charge,
    (
      terms.base_rent
      + terms.service_charge
      + terms.utilities_advance
      + terms.parking_rent
      + terms.other_recurring_charge
    ) as term_recurring_total,
    terms.deposit_required as term_deposit_required,
    terms.billing_frequency as term_billing_frequency
  from contract_selection cs
  left join lateral (
    select tv.*
    from public.tenancy_term_versions tv
    where tv.tenancy_id = cs.tenancy_id
      and tv.effective_from <= p_as_of
    order by tv.effective_from desc, tv.id
    limit 1
  ) terms on cs.tenancy_id is not null
    and cs.contract_coverage_status = 'effective'
),
maintenance_ops as (
  select
    u.id as unit_id,
    count(mi.id) filter (where mi.status = 'open')::bigint
      as open_maintenance_issue_count,
    count(mi.id) filter (
      where mi.status = 'open' and mi.priority = 'urgent'
    )::bigint as urgent_maintenance_issue_count
  from public.units u
  left join public.maintenance_issues mi on mi.unit_id = u.id
  group by u.id
),
work_order_ops as (
  select
    u.id as unit_id,
    count(mwo.id) filter (
      where mwo.status not in ('completed', 'cancelled')
    )::bigint as open_maintenance_work_order_count
  from public.units u
  left join public.maintenance_issues mi on mi.unit_id = u.id
  left join public.maintenance_work_orders mwo on mwo.issue_id = mi.id
  group by u.id
),
asset_ops as (
  select
    u.id as unit_id,
    count(a.id)::bigint as located_asset_count,
    count(a.id) filter (where a.status = 'active')::bigint
      as active_asset_count,
    count(a.id) filter (where a.status = 'inactive')::bigint
      as inactive_asset_count
  from public.units u
  left join public.assets a on a.unit_id = u.id
  group by u.id
),
service_plan_ops as (
  select
    u.id as unit_id,
    count(sp.id) filter (
      where sp.status = 'active'
        and a.status not in ('retired', 'replaced')
    )::bigint as active_service_plan_count
  from public.units u
  left join public.assets a on a.unit_id = u.id
  left join public.asset_service_plans sp on sp.asset_id = a.id
  group by u.id
),
warranty_claim_ops as (
  select
    u.id as unit_id,
    count(c.id) filter (
      where c.status in ('draft', 'submitted', 'approved')
    )::bigint as open_warranty_claim_count
  from public.units u
  left join public.assets a on a.unit_id = u.id
  left join public.asset_warranties w on w.asset_id = a.id
  left join public.asset_warranty_claims c on c.warranty_id = w.id
  group by u.id
),
meter_ops as (
  select
    u.id as unit_id,
    count(m.id) filter (where m.status = 'active')::bigint
      as active_meter_count
  from public.units u
  left join public.meters m on m.unit_id = u.id
  group by u.id
)
select
  wt.unit_id,
  wt.property_id,
  wt.property_code,
  wt.property_name,
  wt.unit_code,
  wt.unit_number,
  wt.unit_type,
  wt.floor,
  wt.area_m2,
  wt.rooms,
  wt.occupancy_status,
  wt.tenancy_id,
  wt.tenancy_code,
  wt.tenancy_status,
  wt.tenancy_planned_start,
  wt.tenancy_planned_end,
  wt.tenancy_actual_start,
  wt.tenancy_actual_end,
  wt.contract_coverage_status,
  wt.agreement_id,
  wt.agreement_code,
  wt.agreement_status,
  wt.agreement_effective_from,
  wt.agreement_effective_to,
  wt.agreement_signed_at,
  wt.term_version_id,
  wt.term_source_type,
  wt.term_effective_from,
  wt.term_currency,
  wt.term_base_rent,
  wt.term_service_charge,
  wt.term_utilities_advance,
  wt.term_parking_rent,
  wt.term_other_recurring_charge,
  wt.term_recurring_total,
  wt.term_deposit_required,
  wt.term_billing_frequency,
  coalesce(mo.open_maintenance_issue_count, 0),
  coalesce(mo.urgent_maintenance_issue_count, 0),
  coalesce(wo.open_maintenance_work_order_count, 0),
  coalesce(ao.located_asset_count, 0),
  coalesce(ao.active_asset_count, 0),
  coalesce(ao.inactive_asset_count, 0),
  coalesce(sp.active_service_plan_count, 0),
  coalesce(wc.open_warranty_claim_count, 0),
  coalesce(me.active_meter_count, 0)
from with_terms wt
left join maintenance_ops mo on mo.unit_id = wt.unit_id
left join work_order_ops wo on wo.unit_id = wt.unit_id
left join asset_ops ao on ao.unit_id = wt.unit_id
left join service_plan_ops sp on sp.unit_id = wt.unit_id
left join warranty_claim_ops wc on wc.unit_id = wt.unit_id
left join meter_ops me on me.unit_id = wt.unit_id
order by lower(wt.property_code), lower(wt.unit_number), wt.unit_id;
$reporting_unit_snapshots$;

comment on function public.reporting_unit_snapshots(date) is
  'Read-only Unit reporting snapshot. Occupancy/contract use explicit asOf; operational counts are current state and intentionally not historical reconstruction.';

create or replace function public.reporting_unit_cost_summaries(p_as_of date)
returns table (
  unit_id uuid,
  currency text,
  capex numeric,
  opex numeric,
  unclassified numeric,
  total numeric
)
language sql
stable
strict
as $reporting_unit_cost_summaries$
with resolved_costs as (
  select
    c.id,
    c.currency,
    c.amount,
    c.reporting_class,
    c.incurred_on,
    case c.source_kind
      when 'unit' then c.unit_id
      when 'space' then s.unit_id
      when 'improvement_project' then ip.unit_id
      when 'work_item' then wip.unit_id
      when 'work_record' then wrp.unit_id
      when 'work_material' then wmp.unit_id
      when 'maintenance_issue' then mi.unit_id
      when 'maintenance_work_order' then mii.unit_id
      else null
    end as resolved_unit_id
  from public.costs c
  left join public.spaces s
    on c.source_kind = 'space'
   and s.id = c.space_id
  left join public.improvement_projects ip
    on c.source_kind = 'improvement_project'
   and ip.id = c.improvement_project_id
  left join public.improvement_work_items wi
    on c.source_kind = 'work_item'
   and wi.id = c.work_item_id
  left join public.improvement_projects wip
    on wip.id = wi.project_id
  left join public.improvement_work_records wr
    on c.source_kind = 'work_record'
   and wr.id = c.work_record_id
  left join public.improvement_projects wrp
    on wrp.id = wr.project_id
  left join public.improvement_work_materials wm
    on c.source_kind = 'work_material'
   and wm.id = c.work_material_id
  left join public.improvement_work_records wmr
    on wmr.id = wm.work_record_id
  left join public.improvement_projects wmp
    on wmp.id = wmr.project_id
  left join public.maintenance_issues mi
    on c.source_kind = 'maintenance_issue'
   and mi.id = c.maintenance_issue_id
  left join public.maintenance_work_orders mwo
    on c.source_kind = 'maintenance_work_order'
   and mwo.id = c.maintenance_work_order_id
  left join public.maintenance_issues mii
    on mii.id = mwo.issue_id
  where c.incurred_on <= p_as_of
    and not exists (
      select 1
      from public.cost_reversals r
      where r.cost_id = c.id
    )
)
select
  rc.resolved_unit_id as unit_id,
  rc.currency::text,
  coalesce(sum(rc.amount) filter (where rc.reporting_class = 'capex'), 0),
  coalesce(sum(rc.amount) filter (where rc.reporting_class = 'opex'), 0),
  coalesce(sum(rc.amount) filter (where rc.reporting_class = 'unclassified'), 0),
  coalesce(sum(rc.amount), 0)
from resolved_costs rc
where rc.resolved_unit_id is not null
group by rc.resolved_unit_id, rc.currency
order by rc.resolved_unit_id, rc.currency;
$reporting_unit_cost_summaries$;

comment on function public.reporting_unit_cost_summaries(date) is
  'Current-effective Cost ledger through incurredOn asOf, grouped by currency and only deterministically attributable Unit sources.';

create or replace function public.reporting_portfolio_cost_summaries(p_as_of date)
returns table (
  currency text,
  capex numeric,
  opex numeric,
  unclassified numeric,
  total numeric
)
language sql
stable
strict
as $reporting_portfolio_cost_summaries$
select
  c.currency::text,
  coalesce(sum(c.amount) filter (where c.reporting_class = 'capex'), 0),
  coalesce(sum(c.amount) filter (where c.reporting_class = 'opex'), 0),
  coalesce(sum(c.amount) filter (where c.reporting_class = 'unclassified'), 0),
  coalesce(sum(c.amount), 0)
from public.costs c
where c.incurred_on <= p_as_of
  and not exists (
    select 1
    from public.cost_reversals r
    where r.cost_id = c.id
  )
group by c.currency
order by c.currency;
$reporting_portfolio_cost_summaries$;

comment on function public.reporting_portfolio_cost_summaries(date) is
  'Current-effective Portfolio Cost ledger through incurredOn asOf. Includes every source because no Unit allocation is required; currencies remain separate.';

create or replace function public.reporting_property_summaries(p_as_of date)
returns table (
  property_id uuid,
  property_code text,
  property_name text,
  unit_count bigint,
  occupied_unit_count bigint,
  planned_unit_count bigint,
  vacant_unit_count bigint,
  current_open_maintenance_issue_count bigint,
  current_urgent_maintenance_issue_count bigint,
  current_located_asset_count bigint,
  current_active_asset_count bigint,
  current_active_meter_count bigint
)
language sql
stable
strict
as $reporting_property_summaries$
with unit_snapshot as (
  select *
  from public.reporting_unit_snapshots(p_as_of)
),
unit_counts as (
  select
    us.property_id,
    count(*)::bigint as unit_count,
    count(*) filter (where us.occupancy_status = 'occupied')::bigint
      as occupied_unit_count,
    count(*) filter (where us.occupancy_status = 'planned')::bigint
      as planned_unit_count,
    count(*) filter (where us.occupancy_status = 'vacant')::bigint
      as vacant_unit_count
  from unit_snapshot us
  group by us.property_id
),
maintenance_counts as (
  select
    p.id as property_id,
    count(mi.id) filter (where mi.status = 'open')::bigint
      as current_open_maintenance_issue_count,
    count(mi.id) filter (
      where mi.status = 'open' and mi.priority = 'urgent'
    )::bigint as current_urgent_maintenance_issue_count
  from public.properties p
  left join public.maintenance_issues mi on mi.property_id = p.id
  group by p.id
),
asset_counts as (
  select
    p.id as property_id,
    count(a.id)::bigint as current_located_asset_count,
    count(a.id) filter (where a.status = 'active')::bigint
      as current_active_asset_count
  from public.properties p
  left join public.assets a on a.property_id = p.id
  group by p.id
),
meter_counts as (
  select
    p.id as property_id,
    count(m.id) filter (where m.status = 'active')::bigint
      as current_active_meter_count
  from public.properties p
  left join public.units u on u.property_id = p.id
  left join public.meters m on m.unit_id = u.id
  group by p.id
)
select
  p.id,
  p.code,
  p.name,
  coalesce(uc.unit_count, 0),
  coalesce(uc.occupied_unit_count, 0),
  coalesce(uc.planned_unit_count, 0),
  coalesce(uc.vacant_unit_count, 0),
  coalesce(mc.current_open_maintenance_issue_count, 0),
  coalesce(mc.current_urgent_maintenance_issue_count, 0),
  coalesce(ac.current_located_asset_count, 0),
  coalesce(ac.current_active_asset_count, 0),
  coalesce(mec.current_active_meter_count, 0)
from public.properties p
left join unit_counts uc on uc.property_id = p.id
left join maintenance_counts mc on mc.property_id = p.id
left join asset_counts ac on ac.property_id = p.id
left join meter_counts mec on mec.property_id = p.id
order by lower(p.code), p.id;
$reporting_property_summaries$;

comment on function public.reporting_property_summaries(date) is
  'Per-Property portfolio dashboard summary. Occupancy is asOf; Maintenance/Asset/Meter counts are current operational state.';

commit;
