begin;

create table public.improvement_projects (
  id uuid primary key,
  code text not null,
  name text not null,
  description text,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid,
  space_id uuid,
  planned_start_on date,
  planned_end_on date,
  status text not null default 'draft',
  planned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null,
  created_by_user_id uuid not null references public.app_users(id) on delete restrict,

  constraint improvement_projects_code_not_blank
    check (btrim(code) <> ''),
  constraint improvement_projects_code_canonical
    check (code = btrim(code)),
  constraint improvement_projects_name_not_blank
    check (btrim(name) <> ''),
  constraint improvement_projects_name_canonical
    check (name = btrim(name)),
  constraint improvement_projects_description_not_blank
    check (description is null or btrim(description) <> ''),
  constraint improvement_projects_description_canonical
    check (description is null or description = btrim(description)),
  constraint improvement_projects_space_requires_unit
    check (space_id is null or unit_id is not null),
  constraint improvement_projects_unit_same_property_fk
    foreign key (unit_id, property_id)
    references public.units(id, property_id)
    on delete restrict,
  constraint improvement_projects_space_same_unit_fk
    foreign key (space_id, unit_id)
    references public.spaces(id, unit_id)
    on delete restrict,
  constraint improvement_projects_plan_dates_valid check (
    (planned_end_on is null or planned_start_on is not null)
    and (
      planned_start_on is null
      or planned_end_on is null
      or planned_end_on >= planned_start_on
    )
  ),
  constraint improvement_projects_status_valid check (
    status in ('draft', 'planned', 'in_progress', 'completed', 'cancelled')
  ),
  constraint improvement_projects_version_positive check (version > 0),
  constraint improvement_projects_state_shape check (
    (
      status = 'draft'
      and planned_at is null
      and started_at is null
      and completed_at is null
      and cancelled_at is null
    )
    or
    (
      status = 'planned'
      and planned_at is not null
      and started_at is null
      and completed_at is null
      and cancelled_at is null
    )
    or
    (
      status = 'in_progress'
      and planned_at is not null
      and started_at is not null
      and completed_at is null
      and cancelled_at is null
    )
    or
    (
      status = 'completed'
      and planned_at is not null
      and started_at is not null
      and completed_at is not null
      and cancelled_at is null
    )
    or
    (
      status = 'cancelled'
      and completed_at is null
      and cancelled_at is not null
    )
  ),
  constraint improvement_projects_timestamp_order check (
    (planned_at is null or planned_at >= created_at)
    and (
      started_at is null
      or (planned_at is not null and started_at >= planned_at)
    )
    and (
      completed_at is null
      or (started_at is not null and completed_at >= started_at)
    )
    and (
      cancelled_at is null
      or cancelled_at >= coalesce(started_at, planned_at, created_at)
    )
  )
);

create unique index improvement_projects_code_uq
  on public.improvement_projects (lower(btrim(code)));
create index improvement_projects_property_idx
  on public.improvement_projects (property_id, created_at desc, id);
create index improvement_projects_unit_idx
  on public.improvement_projects (unit_id, created_at desc, id)
  where unit_id is not null;
create index improvement_projects_space_idx
  on public.improvement_projects (space_id, created_at desc, id)
  where space_id is not null;

create table public.improvement_work_items (
  id uuid primary key,
  project_id uuid not null
    references public.improvement_projects(id) on delete restrict,
  code text not null,
  title text not null,
  description text,
  status text not null default 'planned',
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null,
  created_by_user_id uuid not null references public.app_users(id) on delete restrict,

  constraint improvement_work_items_id_project_uq unique (id, project_id),
  constraint improvement_work_items_code_not_blank check (btrim(code) <> ''),
  constraint improvement_work_items_code_canonical check (code = btrim(code)),
  constraint improvement_work_items_title_not_blank check (btrim(title) <> ''),
  constraint improvement_work_items_title_canonical check (title = btrim(title)),
  constraint improvement_work_items_description_not_blank
    check (description is null or btrim(description) <> ''),
  constraint improvement_work_items_description_canonical
    check (description is null or description = btrim(description)),
  constraint improvement_work_items_status_valid
    check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  constraint improvement_work_items_version_positive check (version > 0),
  constraint improvement_work_items_state_shape check (
    (
      status = 'planned'
      and started_at is null
      and completed_at is null
      and cancelled_at is null
    )
    or
    (
      status = 'in_progress'
      and started_at is not null
      and completed_at is null
      and cancelled_at is null
    )
    or
    (
      status = 'completed'
      and started_at is not null
      and completed_at is not null
      and cancelled_at is null
    )
    or
    (
      status = 'cancelled'
      and completed_at is null
      and cancelled_at is not null
    )
  ),
  constraint improvement_work_items_timestamp_order check (
    (started_at is null or started_at >= created_at)
    and (
      completed_at is null
      or (started_at is not null and completed_at >= started_at)
    )
    and (
      cancelled_at is null
      or cancelled_at >= coalesce(started_at, created_at)
    )
  )
);

create unique index improvement_work_items_code_uq
  on public.improvement_work_items (project_id, lower(btrim(code)));
create index improvement_work_items_project_idx
  on public.improvement_work_items (project_id, created_at, id);

create table public.improvement_work_records (
  id uuid primary key,
  project_id uuid not null
    references public.improvement_projects(id) on delete restrict,
  work_item_id uuid not null,
  contractor_party_id uuid references public.parties(id) on delete restrict,
  performed_at timestamptz not null,
  description text not null,
  reference text,
  recorded_at timestamptz not null,
  recorded_by_user_id uuid not null references public.app_users(id) on delete restrict,
  sealed boolean not null default false,

  constraint improvement_work_records_item_project_fk
    foreign key (work_item_id, project_id)
    references public.improvement_work_items(id, project_id)
    on delete restrict,
  constraint improvement_work_records_description_not_blank
    check (btrim(description) <> ''),
  constraint improvement_work_records_description_canonical
    check (description = btrim(description)),
  constraint improvement_work_records_reference_not_blank
    check (reference is null or btrim(reference) <> ''),
  constraint improvement_work_records_reference_canonical
    check (reference is null or reference = btrim(reference)),
  constraint improvement_work_records_time_order
    check (performed_at <= recorded_at)
);

create index improvement_work_records_project_time_idx
  on public.improvement_work_records (project_id, performed_at desc, id);
create index improvement_work_records_item_time_idx
  on public.improvement_work_records (work_item_id, performed_at desc, id);
create index improvement_work_records_contractor_idx
  on public.improvement_work_records (contractor_party_id)
  where contractor_party_id is not null;

create table public.improvement_work_materials (
  id uuid primary key,
  work_record_id uuid not null
    references public.improvement_work_records(id) on delete restrict,
  name text not null,
  reference text,
  quantity numeric(24, 6) not null,
  unit text not null,
  notes text,

  constraint improvement_work_materials_name_not_blank check (btrim(name) <> ''),
  constraint improvement_work_materials_name_canonical check (name = btrim(name)),
  constraint improvement_work_materials_reference_not_blank
    check (reference is null or btrim(reference) <> ''),
  constraint improvement_work_materials_reference_canonical
    check (reference is null or reference = btrim(reference)),
  constraint improvement_work_materials_quantity_positive check (quantity > 0),
  constraint improvement_work_materials_unit_valid check (
    unit in ('piece', 'kg', 'g', 'm', 'm2', 'm3', 'l', 'ml', 'package', 'other')
  ),
  constraint improvement_work_materials_notes_not_blank
    check (notes is null or btrim(notes) <> ''),
  constraint improvement_work_materials_notes_canonical
    check (notes is null or notes = btrim(notes))
);

create index improvement_work_materials_record_idx
  on public.improvement_work_materials (work_record_id, id);

create table public.improvement_project_assets (
  id uuid primary key,
  work_record_id uuid not null
    references public.improvement_work_records(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  action text not null,
  notes text,

  constraint improvement_project_assets_action_valid
    check (action in ('affected', 'installed', 'removed')),
  constraint improvement_project_assets_notes_not_blank
    check (notes is null or btrim(notes) <> ''),
  constraint improvement_project_assets_notes_canonical
    check (notes is null or notes = btrim(notes)),
  constraint improvement_project_assets_record_asset_uq
    unique (work_record_id, asset_id)
);

create index improvement_project_assets_record_idx
  on public.improvement_project_assets (work_record_id, id);
create index improvement_project_assets_asset_idx
  on public.improvement_project_assets (asset_id, id);

create or replace function public.guard_improvement_project()
returns trigger
language plpgsql
as $improvement_project_guard$
declare
  plan_changed boolean;
  lifecycle_timestamp_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft'
       or new.version <> 1
       or new.planned_at is not null
       or new.started_at is not null
       or new.completed_at is not null
       or new.cancelled_at is not null
    then
      raise exception 'New ImprovementProject must start draft at version 1.'
        using errcode = '23514',
              constraint = 'improvement_project_initial_state';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'ImprovementProject cannot be deleted.'
      using errcode = '23514',
            constraint = 'improvement_project_delete_forbidden';
  end if;

  if new.id is distinct from old.id
     or new.code is distinct from old.code
     or new.property_id is distinct from old.property_id
     or new.unit_id is distinct from old.unit_id
     or new.space_id is distinct from old.space_id
     or new.created_at is distinct from old.created_at
     or new.created_by_user_id is distinct from old.created_by_user_id
  then
    raise exception 'ImprovementProject identity and scope are immutable.'
      using errcode = '23514',
            constraint = 'improvement_project_identity_scope_immutable';
  end if;

  plan_changed :=
    new.name is distinct from old.name
    or new.description is distinct from old.description
    or new.planned_start_on is distinct from old.planned_start_on
    or new.planned_end_on is distinct from old.planned_end_on;

  lifecycle_timestamp_changed :=
    new.planned_at is distinct from old.planned_at
    or new.started_at is distinct from old.started_at
    or new.completed_at is distinct from old.completed_at
    or new.cancelled_at is distinct from old.cancelled_at;

  if new.status = old.status then
    if lifecycle_timestamp_changed then
      raise exception 'ImprovementProject lifecycle timestamps change only with lifecycle transitions.'
        using errcode = '23514',
              constraint = 'improvement_project_lifecycle_timestamp_immutable';
    end if;

    if plan_changed then
      if old.status not in ('draft', 'planned') then
        raise exception 'ImprovementProject plan is frozen after work starts.'
          using errcode = '23514',
                constraint = 'improvement_project_plan_frozen';
      end if;
      if new.version <> old.version + 1 then
        raise exception 'ImprovementProject plan correction must advance version by one.'
          using errcode = '23514',
                constraint = 'improvement_project_version_step';
      end if;
      return new;
    end if;

    if new.version <> old.version then
      raise exception 'ImprovementProject version may advance only with a supported mutation.'
        using errcode = '23514',
              constraint = 'improvement_project_version_step';
    end if;
    return new;
  end if;

  if plan_changed then
    raise exception 'ImprovementProject plan correction and lifecycle transition are separate commands.'
      using errcode = '23514',
            constraint = 'improvement_project_mixed_mutation_forbidden';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'ImprovementProject lifecycle transition must advance version by one.'
      using errcode = '23514',
            constraint = 'improvement_project_version_step';
  end if;

  if old.status = 'draft' and new.status in ('planned', 'cancelled') then
    return new;
  end if;

  if old.status = 'planned' and new.status in ('in_progress', 'cancelled') then
    return new;
  end if;

  if old.status = 'in_progress' and new.status = 'completed' then
    if exists (
      select 1
      from public.improvement_work_items wi
      where wi.project_id = old.id
        and wi.status not in ('completed', 'cancelled')
    ) then
      raise exception 'ImprovementProject cannot complete with open WorkItems.'
        using errcode = '23514',
              constraint = 'improvement_project_open_work_items';
    end if;
    return new;
  end if;

  if old.status = 'in_progress' and new.status = 'cancelled' then
    return new;
  end if;

  raise exception 'Invalid ImprovementProject lifecycle transition.'
    using errcode = '23514',
          constraint = 'improvement_project_transition_invalid';
end;
$improvement_project_guard$;

create trigger improvement_project_guard_trg
before insert or update or delete on public.improvement_projects
for each row execute function public.guard_improvement_project();

create or replace function public.guard_improvement_work_item()
returns trigger
language plpgsql
as $improvement_work_item_guard$
declare
  project_status text;
  project_started_at timestamptz;
  lifecycle_timestamp_changed boolean;
begin
  select status, started_at
    into project_status, project_started_at
  from public.improvement_projects
  where id = coalesce(new.project_id, old.project_id);

  if tg_op = 'INSERT' then
    if project_status in ('completed', 'cancelled') then
      raise exception 'Cannot add WorkItem to terminal ImprovementProject.'
        using errcode = '23514',
              constraint = 'improvement_work_item_project_terminal';
    end if;
    if new.status <> 'planned'
       or new.version <> 1
       or new.started_at is not null
       or new.completed_at is not null
       or new.cancelled_at is not null
    then
      raise exception 'New WorkItem must start planned at version 1.'
        using errcode = '23514',
              constraint = 'improvement_work_item_initial_state';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'WorkItem cannot be deleted.'
      using errcode = '23514',
            constraint = 'improvement_work_item_delete_forbidden';
  end if;

  if new.id is distinct from old.id
     or new.project_id is distinct from old.project_id
     or new.code is distinct from old.code
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.created_at is distinct from old.created_at
     or new.created_by_user_id is distinct from old.created_by_user_id
  then
    raise exception 'WorkItem definition is immutable.'
      using errcode = '23514',
            constraint = 'improvement_work_item_definition_immutable';
  end if;

  lifecycle_timestamp_changed :=
    new.started_at is distinct from old.started_at
    or new.completed_at is distinct from old.completed_at
    or new.cancelled_at is distinct from old.cancelled_at;

  if new.status = old.status then
    if lifecycle_timestamp_changed or new.version <> old.version then
      raise exception 'WorkItem may change only through lifecycle transitions.'
        using errcode = '23514',
              constraint = 'improvement_work_item_version_step';
    end if;
    return new;
  end if;

  if new.version <> old.version + 1 then
    raise exception 'WorkItem lifecycle transition must advance version by one.'
      using errcode = '23514',
            constraint = 'improvement_work_item_version_step';
  end if;

  if old.status = 'planned' and new.status = 'in_progress' then
    if project_status <> 'in_progress' then
      raise exception 'WorkItem can start only while ImprovementProject is in progress.'
        using errcode = '23514',
              constraint = 'improvement_work_item_project_not_in_progress';
    end if;
    if project_started_at is null or new.started_at < project_started_at then
      raise exception 'WorkItem cannot start before ImprovementProject.'
        using errcode = '23514',
              constraint = 'improvement_work_item_start_before_project';
    end if;
    return new;
  end if;

  if old.status = 'in_progress' and new.status = 'completed' then
    if project_status <> 'in_progress' then
      raise exception 'WorkItem can complete only while ImprovementProject is in progress.'
        using errcode = '23514',
              constraint = 'improvement_work_item_project_not_in_progress';
    end if;
    return new;
  end if;

  if old.status in ('planned', 'in_progress') and new.status = 'cancelled' then
    return new;
  end if;

  raise exception 'Invalid WorkItem lifecycle transition.'
    using errcode = '23514',
          constraint = 'improvement_work_item_transition_invalid';
end;
$improvement_work_item_guard$;

create trigger improvement_work_item_guard_trg
before insert or update or delete on public.improvement_work_items
for each row execute function public.guard_improvement_work_item();

create or replace function public.guard_improvement_work_record()
returns trigger
language plpgsql
as $improvement_work_record_guard$
declare
  item_completed_at timestamptz;
  item_cancelled_at timestamptz;
  project_completed_at timestamptz;
  project_cancelled_at timestamptz;
  terminal_cutoff timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.sealed then
      raise exception 'New WorkRecord must be assembled unsealed inside one transaction.'
        using errcode = '23514',
              constraint = 'improvement_work_record_initially_unsealed';
    end if;

    select
      wi.completed_at,
      wi.cancelled_at,
      p.completed_at,
      p.cancelled_at
    into
      item_completed_at,
      item_cancelled_at,
      project_completed_at,
      project_cancelled_at
    from public.improvement_work_items wi
    join public.improvement_projects p on p.id = wi.project_id
    where wi.id = new.work_item_id
      and wi.project_id = new.project_id;

    select min(value)
      into terminal_cutoff
    from unnest(array[
      item_completed_at,
      item_cancelled_at,
      project_completed_at,
      project_cancelled_at
    ]) as cutoff(value)
    where value is not null;

    if terminal_cutoff is not null
       and new.performed_at > terminal_cutoff
    then
      raise exception 'WorkRecord cannot occur after WorkItem/Project terminal time.'
        using errcode = '23514',
              constraint = 'improvement_work_record_after_terminal_time';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'WorkRecord history cannot be deleted.'
      using errcode = '23514',
            constraint = 'improvement_work_record_delete_forbidden';
  end if;

  if not old.sealed
     and new.sealed
     and new.id is not distinct from old.id
     and new.project_id is not distinct from old.project_id
     and new.work_item_id is not distinct from old.work_item_id
     and new.contractor_party_id is not distinct from old.contractor_party_id
     and new.performed_at is not distinct from old.performed_at
     and new.description is not distinct from old.description
     and new.reference is not distinct from old.reference
     and new.recorded_at is not distinct from old.recorded_at
     and new.recorded_by_user_id is not distinct from old.recorded_by_user_id
  then
    return new;
  end if;

  raise exception 'WorkRecord history is immutable after assembly.'
    using errcode = '23514',
          constraint = 'improvement_work_record_immutable';
end;
$improvement_work_record_guard$;

create trigger improvement_work_record_guard_trg
before insert or update or delete on public.improvement_work_records
for each row execute function public.guard_improvement_work_record();

create or replace function public.guard_improvement_work_record_commit()
returns trigger
language plpgsql
as $improvement_work_record_commit_guard$
declare
  current_sealed boolean;
begin
  select sealed
    into current_sealed
  from public.improvement_work_records
  where id = new.id;

  if current_sealed is distinct from true then
    raise exception 'WorkRecord and its evidence children must commit as one sealed transaction.'
      using errcode = '23514',
            constraint = 'improvement_work_record_must_be_sealed';
  end if;

  return null;
end;
$improvement_work_record_commit_guard$;

create constraint trigger improvement_work_record_commit_guard_trg
after insert or update on public.improvement_work_records
deferrable initially deferred
for each row execute function public.guard_improvement_work_record_commit();

create or replace function public.guard_improvement_work_record_child()
returns trigger
language plpgsql
as $improvement_work_record_child_guard$
declare
  parent_sealed boolean;
begin
  if tg_op = 'INSERT' then
    select sealed
      into parent_sealed
    from public.improvement_work_records
    where id = new.work_record_id;

    if parent_sealed is distinct from false then
      raise exception 'WorkRecord evidence can be inserted only before the parent is sealed.'
        using errcode = '23514',
              constraint = 'improvement_work_record_child_after_seal';
    end if;

    return new;
  end if;

  raise exception 'WorkRecord evidence children are append-once and immutable.'
    using errcode = '23514',
          constraint = 'improvement_work_record_child_immutable';
end;
$improvement_work_record_child_guard$;

create trigger improvement_work_material_guard_trg
before insert or update or delete on public.improvement_work_materials
for each row execute function public.guard_improvement_work_record_child();

create trigger improvement_project_asset_guard_trg
before insert or update or delete on public.improvement_project_assets
for each row execute function public.guard_improvement_work_record_child();

alter table public.improvement_projects enable row level security;
alter table public.improvement_work_items enable row level security;
alter table public.improvement_work_records enable row level security;
alter table public.improvement_work_materials enable row level security;
alter table public.improvement_project_assets enable row level security;

comment on table public.improvement_projects is
  'One managed improvement/renovation initiative with immutable physical scope and optimistic lifecycle.';
comment on table public.improvement_work_items is
  'Planned work scope under an ImprovementProject; not proof that work occurred.';
comment on table public.improvement_work_records is
  'Sealed append-only historical work occurrence with performedAt distinct from recordedAt.';
comment on table public.improvement_work_materials is
  'Exact material/consumable evidence attached atomically to one WorkRecord; no financial Cost semantics.';
comment on table public.improvement_project_assets is
  'Append-only evidence that an existing Asset was affected/installed/removed by one WorkRecord; never Asset lifecycle truth.';

commit;
