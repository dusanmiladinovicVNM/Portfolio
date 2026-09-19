begin;

create table public.maintenance_issues (
  id uuid primary key,
  code text not null,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid,
  space_id uuid,
  asset_id uuid references public.assets(id) on delete restrict,
  inspection_finding_id uuid references public.inspection_findings(id) on delete restrict,
  title text not null,
  description text,
  priority text not null,
  status text not null default 'open',
  reported_at timestamptz not null,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  version integer not null default 1,
  recorded_at timestamptz not null,
  recorded_by_user_id uuid not null references public.app_users(id) on delete restrict,

  constraint maintenance_issues_code_not_blank check (btrim(code) <> ''),
  constraint maintenance_issues_code_canonical check (code = btrim(code)),
  constraint maintenance_issues_title_not_blank check (btrim(title) <> ''),
  constraint maintenance_issues_title_canonical check (title = btrim(title)),
  constraint maintenance_issues_description_not_blank
    check (description is null or btrim(description) <> ''),
  constraint maintenance_issues_description_canonical
    check (description is null or description = btrim(description)),
  constraint maintenance_issues_priority_valid
    check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint maintenance_issues_status_valid
    check (status in ('open', 'resolved', 'cancelled')),
  constraint maintenance_issues_version_positive check (version > 0),
  constraint maintenance_issues_space_requires_unit
    check (space_id is null or unit_id is not null),
  constraint maintenance_issues_unit_same_property_fk
    foreign key (unit_id, property_id)
    references public.units(id, property_id)
    on delete restrict,
  constraint maintenance_issues_space_same_unit_fk
    foreign key (space_id, unit_id)
    references public.spaces(id, unit_id)
    on delete restrict,
  constraint maintenance_issues_reported_before_recorded
    check (reported_at <= recorded_at),
  constraint maintenance_issues_lifecycle_shape check (
    (status = 'open' and resolved_at is null and cancelled_at is null)
    or
    (status = 'resolved' and resolved_at is not null and cancelled_at is null)
    or
    (status = 'cancelled' and resolved_at is null and cancelled_at is not null)
  )
);

create unique index maintenance_issues_code_uq
  on public.maintenance_issues (lower(btrim(code)));
create unique index maintenance_issues_finding_uq
  on public.maintenance_issues (inspection_finding_id)
  where inspection_finding_id is not null;
create index maintenance_issues_property_idx
  on public.maintenance_issues (property_id, status, reported_at desc, id);
create index maintenance_issues_unit_idx
  on public.maintenance_issues (unit_id, status, reported_at desc, id)
  where unit_id is not null;
create index maintenance_issues_asset_idx
  on public.maintenance_issues (asset_id, status, reported_at desc, id)
  where asset_id is not null;

create or replace function public.guard_maintenance_issue_asset_history()
returns trigger
language plpgsql
as $maintenance_issue_asset_history_guard$
begin
  if old.valid_to is null
     and new.valid_to is not null
     and exists (
       select 1
       from public.maintenance_issues mi
       where mi.asset_id = old.asset_id
         and mi.property_id = old.property_id
         and mi.unit_id is not distinct from old.unit_id
         and mi.space_id is not distinct from old.space_id
         and mi.reported_at >= old.valid_from
         and mi.reported_at >= new.valid_to
     )
  then
    raise exception 'Asset location history cannot be closed before an existing Maintenance Issue occurrence.'
      using errcode = '23514',
            constraint = 'maintenance_issue_asset_history_snapshot_conflict';
  end if;

  return new;
end;
$maintenance_issue_asset_history_guard$;

create trigger maintenance_issue_asset_history_guard_trg
before update on public.asset_location_history
for each row execute function public.guard_maintenance_issue_asset_history();

create table public.maintenance_work_orders (
  id uuid primary key,
  issue_id uuid not null references public.maintenance_issues(id) on delete restrict,
  code text not null,
  title text not null,
  description text,
  assignee_kind text,
  assigned_user_id uuid references public.app_users(id) on delete restrict,
  assigned_party_id uuid references public.parties(id) on delete restrict,
  status text not null default 'draft',
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null,
  created_by_user_id uuid not null references public.app_users(id) on delete restrict,

  constraint maintenance_work_orders_code_not_blank check (btrim(code) <> ''),
  constraint maintenance_work_orders_code_canonical check (code = btrim(code)),
  constraint maintenance_work_orders_title_not_blank check (btrim(title) <> ''),
  constraint maintenance_work_orders_title_canonical check (title = btrim(title)),
  constraint maintenance_work_orders_description_not_blank
    check (description is null or btrim(description) <> ''),
  constraint maintenance_work_orders_description_canonical
    check (description is null or description = btrim(description)),
  constraint maintenance_work_orders_status_valid
    check (status in ('draft', 'assigned', 'in_progress', 'completed', 'cancelled')),
  constraint maintenance_work_orders_version_positive check (version > 0),
  constraint maintenance_work_orders_assignee_shape check (
    (assignee_kind is null and assigned_user_id is null and assigned_party_id is null)
    or
    (assignee_kind = 'user' and assigned_user_id is not null and assigned_party_id is null)
    or
    (assignee_kind = 'party' and assigned_user_id is null and assigned_party_id is not null)
  ),
  constraint maintenance_work_orders_lifecycle_shape check (
    (
      status = 'draft'
      and assignee_kind is null
      and assigned_at is null
      and started_at is null
      and completed_at is null
      and cancelled_at is null
    )
    or
    (
      status = 'assigned'
      and assignee_kind is not null
      and assigned_at is not null
      and started_at is null
      and completed_at is null
      and cancelled_at is null
    )
    or
    (
      status = 'in_progress'
      and assignee_kind is not null
      and assigned_at is not null
      and started_at is not null
      and completed_at is null
      and cancelled_at is null
    )
    or
    (
      status = 'completed'
      and assignee_kind is not null
      and assigned_at is not null
      and started_at is not null
      and completed_at is not null
      and cancelled_at is null
    )
    or
    (
      status = 'cancelled'
      and completed_at is null
      and cancelled_at is not null
      and (
        (
          assigned_at is null
          and assignee_kind is null
          and assigned_user_id is null
          and assigned_party_id is null
          and started_at is null
        )
        or
        (
          assigned_at is not null
          and assignee_kind is not null
        )
      )
    )
  ),
  constraint maintenance_work_orders_assignment_time
    check (assigned_at is null or assigned_at >= created_at),
  constraint maintenance_work_orders_start_time
    check (started_at is null or (assigned_at is not null and started_at >= assigned_at)),
  constraint maintenance_work_orders_completion_time
    check (completed_at is null or (started_at is not null and completed_at >= started_at)),
  constraint maintenance_work_orders_cancellation_time check (
    cancelled_at is null
    or cancelled_at >= coalesce(started_at, assigned_at, created_at)
  )
);

create unique index maintenance_work_orders_code_uq
  on public.maintenance_work_orders (lower(btrim(code)));
create index maintenance_work_orders_issue_idx
  on public.maintenance_work_orders (issue_id, created_at, id);

create table public.maintenance_work_order_service_events (
  work_order_id uuid not null
    references public.maintenance_work_orders(id) on delete restrict,
  service_event_id uuid not null
    references public.asset_service_events(id) on delete restrict,
  linked_at timestamptz not null,
  linked_by_user_id uuid not null
    references public.app_users(id) on delete restrict,

  constraint maintenance_work_order_service_events_pk
    primary key (work_order_id, service_event_id),
  constraint maintenance_service_event_once_uq unique (service_event_id)
);

create index maintenance_work_order_service_events_order_idx
  on public.maintenance_work_order_service_events (work_order_id, service_event_id);

create or replace function public.guard_maintenance_issue_insert()
returns trigger
language plpgsql
as $maintenance_issue_insert_guard$
declare
  asset_property_id uuid;
  asset_unit_id uuid;
  asset_space_id uuid;
  finding_unit_id uuid;
  finding_created_at timestamptz;
begin
  if new.status <> 'open'
     or new.version <> 1
     or new.resolved_at is not null
     or new.cancelled_at is not null
  then
    raise exception 'New Maintenance Issue must start open at version 1.'
      using errcode = '23514',
            constraint = 'maintenance_issue_initial_state';
  end if;

  if new.asset_id is not null then
    select property_id, unit_id, space_id
      into asset_property_id, asset_unit_id, asset_space_id
    from public.asset_location_history
    where asset_id = new.asset_id
      and valid_from <= new.reported_at
      and (valid_to is null or new.reported_at < valid_to)
    order by valid_from desc, id desc
    limit 1
    for share;

    if not found then
      raise exception 'Asset has no managed location at Maintenance Issue reportedAt.'
        using errcode = '23514',
              constraint = 'maintenance_issue_asset_location_missing';
    end if;

    if asset_property_id is distinct from new.property_id
       or asset_unit_id is distinct from new.unit_id
       or asset_space_id is distinct from new.space_id
    then
      raise exception 'Maintenance Issue scope must match Asset placement at reportedAt.'
        using errcode = '23514',
              constraint = 'maintenance_issue_asset_scope_mismatch';
    end if;
  end if;

  if new.inspection_finding_id is not null then
    select i.unit_id, f.created_at
      into finding_unit_id, finding_created_at
    from public.inspection_findings f
    join public.inspections i on i.id = f.inspection_id
    where f.id = new.inspection_finding_id
    for share of f;

    if not found
       or new.unit_id is null
       or finding_unit_id is distinct from new.unit_id
    then
      raise exception 'Inspection Finding must belong to the Maintenance Issue Unit.'
        using errcode = '23514',
              constraint = 'maintenance_issue_finding_scope_mismatch';
    end if;

    if new.reported_at < finding_created_at then
      raise exception 'Maintenance Issue cannot be reported before its originating Inspection Finding.'
        using errcode = '23514',
              constraint = 'maintenance_issue_finding_temporal_invalid';
    end if;
  end if;

  return new;
end;
$maintenance_issue_insert_guard$;

create trigger maintenance_issue_insert_guard_trg
before insert on public.maintenance_issues
for each row execute function public.guard_maintenance_issue_insert();


create or replace function public.guard_maintenance_origin_finding_mutation()
returns trigger
language plpgsql
as $maintenance_origin_finding_guard$
begin
  if new.created_at is distinct from old.created_at
     and exists (
       select 1
       from public.maintenance_issues
       where inspection_finding_id = old.id
     )
  then
    raise exception 'Originating Inspection Finding createdAt is immutable once linked to Maintenance.'
      using errcode = '23514',
            constraint = 'maintenance_origin_finding_created_at_immutable';
  end if;

  return new;
end;
$maintenance_origin_finding_guard$;

create trigger maintenance_origin_finding_guard_trg
before update on public.inspection_findings
for each row execute function public.guard_maintenance_origin_finding_mutation();

create or replace function public.guard_maintenance_work_order()
returns trigger
language plpgsql
as $maintenance_work_order_guard$
declare
  issue_status text;
  issue_recorded_at timestamptz;
  assignee_status text;
  linked_service_events integer;
  latest_service_performed_at timestamptz;
begin
  if tg_op = 'DELETE' then
    raise exception 'Maintenance WorkOrder history cannot be deleted.'
      using errcode = '23514',
            constraint = 'maintenance_work_order_immutable';
  end if;

  select status, recorded_at
    into issue_status, issue_recorded_at
  from public.maintenance_issues
  where id = new.issue_id
  for share;

  if issue_status is distinct from 'open' then
    raise exception 'Maintenance WorkOrder requires an open Issue.'
      using errcode = '23514',
            constraint = 'maintenance_work_order_parent_terminal';
  end if;

  if tg_op = 'INSERT' then
    if new.created_at < issue_recorded_at then
      raise exception 'Maintenance WorkOrder cannot be created before its parent Issue was recorded.'
        using errcode = '23514',
              constraint = 'maintenance_work_order_before_issue_recorded';
    end if;

    if new.status <> 'draft'
       or new.version <> 1
       or new.assignee_kind is not null
       or new.assigned_user_id is not null
       or new.assigned_party_id is not null
       or new.assigned_at is not null
       or new.started_at is not null
       or new.completed_at is not null
       or new.cancelled_at is not null
    then
      raise exception 'New Maintenance WorkOrder must start draft at version 1.'
        using errcode = '23514',
              constraint = 'maintenance_work_order_initial_state';
    end if;

    return new;
  end if;

  if new.issue_id is distinct from old.issue_id
     or new.code is distinct from old.code
     or new.created_at is distinct from old.created_at
     or new.created_by_user_id is distinct from old.created_by_user_id
  then
    raise exception 'Maintenance WorkOrder identity and provenance are immutable.'
      using errcode = '23514',
            constraint = 'maintenance_work_order_immutable';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'Maintenance WorkOrder version must advance exactly once.'
      using errcode = '23514',
            constraint = 'maintenance_work_order_version_step';
  end if;

  if old.status in ('completed', 'cancelled') then
    raise exception 'Terminal Maintenance WorkOrder cannot change.'
      using errcode = '23514',
            constraint = 'maintenance_work_order_terminal';
  end if;

  if old.status = 'draft' then
    if new.status not in ('draft', 'assigned', 'cancelled') then
      raise exception 'Invalid Maintenance WorkOrder transition.'
        using errcode = '23514',
              constraint = 'maintenance_work_order_invalid_transition';
    end if;
  elsif old.status = 'assigned' then
    if new.status not in ('assigned', 'in_progress', 'cancelled') then
      raise exception 'Invalid Maintenance WorkOrder transition.'
        using errcode = '23514',
              constraint = 'maintenance_work_order_invalid_transition';
    end if;
  elsif old.status = 'in_progress' then
    if new.status not in ('completed', 'cancelled') then
      raise exception 'Invalid Maintenance WorkOrder transition.'
        using errcode = '23514',
              constraint = 'maintenance_work_order_invalid_transition';
    end if;
  end if;

  if old.status = 'in_progress'
     and new.status = 'in_progress'
     and (
       new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.assignee_kind is distinct from old.assignee_kind
       or new.assigned_user_id is distinct from old.assigned_user_id
       or new.assigned_party_id is distinct from old.assigned_party_id
       or new.assigned_at is distinct from old.assigned_at
       or new.started_at is distinct from old.started_at
     )
  then
    raise exception 'Maintenance WorkOrder definition and assignment freeze after start.'
      using errcode = '23514',
            constraint = 'maintenance_work_order_definition_frozen';
  end if;

  if old.status = 'assigned'
     and new.status = 'assigned'
     and new.assigned_at < old.assigned_at
  then
    raise exception 'WorkOrder reassignment cannot move assignedAt backwards.'
      using errcode = '23514',
            constraint = 'maintenance_work_order_assignment_time_order';
  end if;

  if new.status <> old.status
     and (
       new.title is distinct from old.title
       or new.description is distinct from old.description
       or (
         not (old.status = 'draft' and new.status = 'assigned')
         and (
           new.assignee_kind is distinct from old.assignee_kind
           or new.assigned_user_id is distinct from old.assigned_user_id
           or new.assigned_party_id is distinct from old.assigned_party_id
           or new.assigned_at is distinct from old.assigned_at
         )
       )
     )
  then
    raise exception 'WorkOrder definition cannot change during lifecycle transition.'
      using errcode = '23514',
            constraint = 'maintenance_work_order_transition_mutation';
  end if;

  if new.status = 'assigned'
     and (
       old.status = 'draft'
       or new.assignee_kind is distinct from old.assignee_kind
       or new.assigned_user_id is distinct from old.assigned_user_id
       or new.assigned_party_id is distinct from old.assigned_party_id
       or new.assigned_at is distinct from old.assigned_at
     )
  then
    if new.assignee_kind = 'user' then
      select status into assignee_status
      from public.app_users
      where id = new.assigned_user_id
      for share;

      if assignee_status is distinct from 'active' then
        raise exception 'Assigned internal User must be active.'
          using errcode = '23514',
                constraint = 'maintenance_work_order_assignee_inactive';
      end if;
    elsif new.assignee_kind = 'party' then
      select status into assignee_status
      from public.parties
      where id = new.assigned_party_id
      for share;

      if assignee_status is distinct from 'active' then
        raise exception 'Assigned Party must be active.'
          using errcode = '23514',
                constraint = 'maintenance_work_order_assignee_inactive';
      end if;
    end if;
  end if;

  if new.status = 'cancelled' then
    select count(*)
      into linked_service_events
    from public.maintenance_work_order_service_events
    where work_order_id = old.id;

    if linked_service_events > 0 then
      raise exception 'WorkOrder with linked ServiceEvents cannot be cancelled.'
        using errcode = '23514',
              constraint = 'maintenance_work_order_has_service_events';
    end if;
  end if;

  if new.status = 'completed' then
    select max(e.performed_at)
      into latest_service_performed_at
    from public.maintenance_work_order_service_events l
    join public.asset_service_events e on e.id = l.service_event_id
    where l.work_order_id = old.id;

    if latest_service_performed_at is not null
       and new.completed_at < latest_service_performed_at
    then
      raise exception 'WorkOrder completion cannot predate linked ServiceEvent work.'
        using errcode = '23514',
              constraint = 'maintenance_work_order_completion_before_service';
    end if;
  end if;

  return new;
end;
$maintenance_work_order_guard$;

create trigger maintenance_work_order_guard_trg
before insert or update or delete on public.maintenance_work_orders
for each row execute function public.guard_maintenance_work_order();

create or replace function public.guard_maintenance_issue_update()
returns trigger
language plpgsql
as $maintenance_issue_update_guard$
declare
  total_orders integer;
  completed_orders integer;
  cancelled_orders integer;
  nonterminal_orders integer;
  latest_child_terminal timestamptz;
begin
  if tg_op = 'DELETE' then
    raise exception 'Maintenance Issue history cannot be deleted.'
      using errcode = '23514',
            constraint = 'maintenance_issue_immutable';
  end if;

  if new.id is distinct from old.id
     or new.code is distinct from old.code
     or new.property_id is distinct from old.property_id
     or new.unit_id is distinct from old.unit_id
     or new.space_id is distinct from old.space_id
     or new.asset_id is distinct from old.asset_id
     or new.inspection_finding_id is distinct from old.inspection_finding_id
     or new.reported_at is distinct from old.reported_at
     or new.recorded_at is distinct from old.recorded_at
     or new.recorded_by_user_id is distinct from old.recorded_by_user_id
  then
    raise exception 'Maintenance Issue scope, origin and provenance are immutable.'
      using errcode = '23514',
            constraint = 'maintenance_issue_immutable';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'Maintenance Issue version must advance exactly once.'
      using errcode = '23514',
            constraint = 'maintenance_issue_version_step';
  end if;

  if old.status <> 'open' then
    raise exception 'Terminal Maintenance Issue cannot change.'
      using errcode = '23514',
            constraint = 'maintenance_issue_terminal';
  end if;

  if new.status not in ('open', 'resolved', 'cancelled') then
    raise exception 'Invalid Maintenance Issue transition.'
      using errcode = '23514',
            constraint = 'maintenance_issue_invalid_transition';
  end if;

  if new.status = 'open' then
    if new.resolved_at is not null or new.cancelled_at is not null then
      raise exception 'Open Maintenance Issue cannot carry terminal timestamps.'
        using errcode = '23514',
              constraint = 'maintenance_issue_invalid_transition';
    end if;
    return new;
  end if;

  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.priority is distinct from old.priority
  then
    raise exception 'Issue metadata cannot change during terminal transition.'
      using errcode = '23514',
            constraint = 'maintenance_issue_transition_mutation';
  end if;

  select
    count(*),
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'cancelled'),
    count(*) filter (where status not in ('completed', 'cancelled')),
    max(coalesce(completed_at, cancelled_at))
  into
    total_orders,
    completed_orders,
    cancelled_orders,
    nonterminal_orders,
    latest_child_terminal
  from public.maintenance_work_orders
  where issue_id = old.id;

  if new.status = 'resolved' then
    if completed_orders = 0 then
      raise exception 'Resolving Maintenance Issue requires completed work.'
        using errcode = '23514',
              constraint = 'maintenance_issue_completed_work_required';
    end if;
    if nonterminal_orders > 0 then
      raise exception 'All WorkOrders must be terminal before Issue resolution.'
        using errcode = '23514',
              constraint = 'maintenance_issue_open_work_orders';
    end if;
    if new.resolved_at < old.recorded_at
       or (
         latest_child_terminal is not null
         and new.resolved_at < latest_child_terminal
       )
    then
      raise exception 'Issue resolution cannot predate Maintenance history.'
        using errcode = '23514',
              constraint = 'maintenance_issue_terminal_time_invalid';
    end if;
  elsif new.status = 'cancelled' then
    if cancelled_orders <> total_orders then
      raise exception 'Every WorkOrder must be cancelled before Issue cancellation.'
        using errcode = '23514',
              constraint = 'maintenance_issue_non_cancelled_work_orders';
    end if;
    if new.cancelled_at < old.recorded_at
       or (
         latest_child_terminal is not null
         and new.cancelled_at < latest_child_terminal
       )
    then
      raise exception 'Issue cancellation cannot predate Maintenance history.'
        using errcode = '23514',
              constraint = 'maintenance_issue_terminal_time_invalid';
    end if;
  end if;

  return new;
end;
$maintenance_issue_update_guard$;

create trigger maintenance_issue_update_guard_trg
before update or delete on public.maintenance_issues
for each row execute function public.guard_maintenance_issue_update();

create or replace function public.guard_maintenance_service_event_link()
returns trigger
language plpgsql
as $maintenance_service_event_link_guard$
declare
  work_order_status text;
  work_order_started_at timestamptz;
  work_order_completed_at timestamptz;
  issue_asset_id uuid;
  service_asset_id uuid;
  service_performed_at timestamptz;
  service_recorded_at timestamptz;
  work_order_created_at timestamptz;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Maintenance ServiceEvent links are append-only.'
      using errcode = '23514',
            constraint = 'maintenance_service_event_link_immutable';
  end if;

  select w.status, w.started_at, w.completed_at, w.created_at, i.asset_id
    into work_order_status, work_order_started_at, work_order_completed_at, work_order_created_at, issue_asset_id
  from public.maintenance_work_orders w
  join public.maintenance_issues i on i.id = w.issue_id
  where w.id = new.work_order_id
  for share of w;

  if work_order_status not in ('in_progress', 'completed')
     or work_order_started_at is null
  then
    raise exception 'ServiceEvent link requires an in-progress or completed WorkOrder.'
      using errcode = '23514',
            constraint = 'maintenance_service_event_work_order_state_invalid';
  end if;

  if issue_asset_id is null then
    raise exception 'ServiceEvent link requires an Asset-scoped Issue.'
      using errcode = '23514',
            constraint = 'maintenance_service_event_asset_required';
  end if;

  select asset_id, performed_at, recorded_at
    into service_asset_id, service_performed_at, service_recorded_at
  from public.asset_service_events
  where id = new.service_event_id;

  if service_asset_id is distinct from issue_asset_id then
    raise exception 'ServiceEvent Asset must match the Maintenance Issue Asset.'
      using errcode = '23514',
            constraint = 'maintenance_service_event_asset_mismatch';
  end if;

  if new.linked_at < work_order_created_at
     or new.linked_at < service_recorded_at
  then
    raise exception 'Maintenance ServiceEvent link recording time is invalid.'
      using errcode = '23514',
            constraint = 'maintenance_service_event_link_time_invalid';
  end if;

  if service_performed_at < work_order_started_at then
    raise exception 'ServiceEvent cannot predate WorkOrder start.'
      using errcode = '23514',
            constraint = 'maintenance_service_event_before_work_order';
  end if;

  if work_order_completed_at is not null
     and service_performed_at > work_order_completed_at
  then
    raise exception 'ServiceEvent cannot occur after WorkOrder completion.'
      using errcode = '23514',
            constraint = 'maintenance_service_event_after_work_order';
  end if;

  return new;
end;
$maintenance_service_event_link_guard$;

create trigger maintenance_service_event_link_guard_trg
before insert or update or delete
on public.maintenance_work_order_service_events
for each row execute function public.guard_maintenance_service_event_link();

alter table public.costs
  add column maintenance_issue_id uuid
    references public.maintenance_issues(id) on delete restrict,
  add column maintenance_work_order_id uuid
    references public.maintenance_work_orders(id) on delete restrict;

alter table public.costs
  drop constraint costs_source_kind_valid,
  drop constraint costs_exactly_one_source,
  drop constraint costs_source_kind_matches_target;

alter table public.costs
  add constraint costs_source_kind_valid check (
    source_kind in (
      'property',
      'unit',
      'space',
      'asset',
      'warranty_claim',
      'service_event',
      'improvement_project',
      'work_item',
      'work_record',
      'work_material',
      'maintenance_issue',
      'maintenance_work_order'
    )
  ),
  add constraint costs_exactly_one_source check (
    num_nonnulls(
      property_id,
      unit_id,
      space_id,
      asset_id,
      warranty_claim_id,
      service_event_id,
      improvement_project_id,
      work_item_id,
      work_record_id,
      work_material_id,
      maintenance_issue_id,
      maintenance_work_order_id
    ) = 1
  ),
  add constraint costs_source_kind_matches_target check (
    (source_kind = 'property' and property_id is not null)
    or (source_kind = 'unit' and unit_id is not null)
    or (source_kind = 'space' and space_id is not null)
    or (source_kind = 'asset' and asset_id is not null)
    or (source_kind = 'warranty_claim' and warranty_claim_id is not null)
    or (source_kind = 'service_event' and service_event_id is not null)
    or (
      source_kind = 'improvement_project'
      and improvement_project_id is not null
    )
    or (source_kind = 'work_item' and work_item_id is not null)
    or (source_kind = 'work_record' and work_record_id is not null)
    or (source_kind = 'work_material' and work_material_id is not null)
    or (source_kind = 'maintenance_issue' and maintenance_issue_id is not null)
    or (
      source_kind = 'maintenance_work_order'
      and maintenance_work_order_id is not null
    )
  );

create index costs_maintenance_issue_source_idx
  on public.costs (maintenance_issue_id, incurred_on, id)
  where maintenance_issue_id is not null;
create index costs_maintenance_work_order_source_idx
  on public.costs (maintenance_work_order_id, incurred_on, id)
  where maintenance_work_order_id is not null;

alter table public.maintenance_issues enable row level security;
alter table public.maintenance_work_orders enable row level security;
alter table public.maintenance_work_order_service_events enable row level security;

comment on table public.maintenance_issues is
  'One reported maintenance problem with immutable physical scope and optional InspectionFinding origin.';
comment on table public.maintenance_work_orders is
  'One operational task addressing one Maintenance Issue. It does not duplicate ServiceEvent or Cost truth.';
comment on table public.maintenance_work_order_service_events is
  'Append-only link from Maintenance execution to Asset/Service completed-work history.';

commit;
