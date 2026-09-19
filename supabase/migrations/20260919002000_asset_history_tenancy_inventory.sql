begin;

create extension if not exists btree_gist;

create table public.asset_location_history (
  id uuid primary key,
  asset_id uuid not null references public.assets(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid,
  space_id uuid,
  valid_from timestamptz not null,
  valid_to timestamptz,
  change_type text not null,
  changed_by_user_id uuid references public.app_users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),

  constraint asset_location_history_change_type_valid check (
    change_type in (
      'registry_bootstrap', 'asset_created',
      'replacement_created', 'moved'
    )
  ),
  constraint asset_location_history_space_requires_unit
    check (space_id is null or unit_id is not null),
  constraint asset_location_history_interval_valid
    check (valid_to is null or valid_to > valid_from),
  constraint asset_location_history_reason_not_blank
    check (reason is null or btrim(reason) <> ''),
  constraint asset_location_history_unit_same_property_fk
    foreign key (unit_id, property_id)
    references public.units(id, property_id)
    on delete restrict,
  constraint asset_location_history_space_same_unit_fk
    foreign key (space_id, unit_id)
    references public.spaces(id, unit_id)
    on delete restrict
);

alter table public.asset_location_history
  add constraint asset_location_history_no_overlap
  exclude using gist (
    asset_id with =,
    tstzrange(valid_from, valid_to, '[)') with &&
  );

create unique index asset_location_history_one_open_uq
  on public.asset_location_history (asset_id)
  where valid_to is null;

create index asset_location_history_asset_time_idx
  on public.asset_location_history (asset_id, valid_from desc);

insert into public.asset_location_history (
  id,
  asset_id,
  property_id,
  unit_id,
  space_id,
  valid_from,
  valid_to,
  change_type,
  changed_by_user_id,
  reason
)
select
  gen_random_uuid(),
  a.id,
  a.property_id,
  a.unit_id,
  a.space_id,
  a.created_at,
  null,
  'registry_bootstrap',
  null,
  'Backfilled from Asset Registry current placement'
from public.assets a;

create table public.asset_condition_assessments (
  id uuid primary key,
  asset_id uuid not null references public.assets(id) on delete restrict,
  condition text not null,
  assessed_at timestamptz not null,
  assessed_by_user_id uuid not null references public.app_users(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),

  constraint asset_condition_assessments_condition_valid check (
    condition in (
      'excellent', 'good', 'fair', 'poor', 'damaged', 'not_working'
    )
  ),
  constraint asset_condition_assessments_notes_not_blank
    check (notes is null or btrim(notes) <> '')
);

create index asset_condition_assessments_asset_time_idx
  on public.asset_condition_assessments (asset_id, assessed_at desc, id);

create table public.tenancy_asset_assignments (
  id uuid primary key,
  tenancy_id uuid not null references public.tenancies(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  assigned_at timestamptz not null,
  assigned_by_user_id uuid not null references public.app_users(id) on delete restrict,
  version integer not null default 1,

  move_in_presence text,
  move_in_condition_assessment_id uuid
    references public.asset_condition_assessments(id) on delete restrict,
  move_in_recorded_at timestamptz,
  move_in_recorded_by_user_id uuid
    references public.app_users(id) on delete restrict,
  move_in_notes text,

  move_out_presence text,
  move_out_condition_assessment_id uuid
    references public.asset_condition_assessments(id) on delete restrict,
  move_out_recorded_at timestamptz,
  move_out_recorded_by_user_id uuid
    references public.app_users(id) on delete restrict,
  move_out_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tenancy_asset_assignments_tenancy_asset_uq
    unique (tenancy_id, asset_id),
  constraint tenancy_asset_assignments_version_positive
    check (version > 0),
  constraint tenancy_asset_assignments_move_in_presence_valid
    check (move_in_presence is null or move_in_presence in ('present', 'missing')),
  constraint tenancy_asset_assignments_move_out_presence_valid
    check (move_out_presence is null or move_out_presence in ('present', 'missing')),
  constraint tenancy_asset_assignments_move_in_shape check (
    (
      move_in_presence is null
      and move_in_condition_assessment_id is null
      and move_in_recorded_at is null
      and move_in_recorded_by_user_id is null
      and move_in_notes is null
    )
    or
    (
      move_in_presence is not null
      and move_in_recorded_at is not null
      and move_in_recorded_by_user_id is not null
      and (
        move_in_presence <> 'missing'
        or move_in_condition_assessment_id is null
      )
    )
  ),
  constraint tenancy_asset_assignments_move_out_shape check (
    (
      move_out_presence is null
      and move_out_condition_assessment_id is null
      and move_out_recorded_at is null
      and move_out_recorded_by_user_id is null
      and move_out_notes is null
    )
    or
    (
      move_out_presence is not null
      and move_out_recorded_at is not null
      and move_out_recorded_by_user_id is not null
      and (
        move_out_presence <> 'missing'
        or move_out_condition_assessment_id is null
      )
    )
  ),
  constraint tenancy_asset_assignments_move_out_requires_move_in
    check (move_out_presence is null or move_in_presence is not null),
  constraint tenancy_asset_assignments_snapshot_order
    check (
      move_out_recorded_at is null
      or move_in_recorded_at is null
      or move_out_recorded_at >= move_in_recorded_at
    ),
  constraint tenancy_asset_assignments_move_in_notes_not_blank
    check (move_in_notes is null or btrim(move_in_notes) <> ''),
  constraint tenancy_asset_assignments_move_out_notes_not_blank
    check (move_out_notes is null or btrim(move_out_notes) <> '')
);

create index tenancy_asset_assignments_tenancy_idx
  on public.tenancy_asset_assignments (tenancy_id, assigned_at, id);
create index tenancy_asset_assignments_asset_idx
  on public.tenancy_asset_assignments (asset_id, assigned_at, id);

create or replace function public.guard_asset_location_history_mutation()
returns trigger
language plpgsql
as $asset_location_history_guard$
begin
  if tg_op = 'DELETE' then
    raise exception 'Asset location history is append-only.'
      using errcode = '23514',
            constraint = 'asset_location_history_delete_forbidden';
  end if;

  if old.valid_to is not null then
    raise exception 'Closed Asset location history is immutable.'
      using errcode = '23514',
            constraint = 'asset_location_history_closed_immutable';
  end if;

  if new.id is distinct from old.id
     or new.asset_id is distinct from old.asset_id
     or new.property_id is distinct from old.property_id
     or new.unit_id is distinct from old.unit_id
     or new.space_id is distinct from old.space_id
     or new.valid_from is distinct from old.valid_from
     or new.change_type is distinct from old.change_type
     or new.changed_by_user_id is distinct from old.changed_by_user_id
     or new.reason is distinct from old.reason
     or new.valid_to is null
  then
    raise exception 'An open Asset location interval may only be closed once.'
      using errcode = '23514',
            constraint = 'asset_location_history_update_invalid';
  end if;

  return new;
end;
$asset_location_history_guard$;

create trigger asset_location_history_guard_trg
before update or delete on public.asset_location_history
for each row execute function public.guard_asset_location_history_mutation();

create or replace function public.guard_asset_condition_assessment()
returns trigger
language plpgsql
as $asset_condition_guard$
begin
  raise exception 'Asset condition assessments are append-only.'
    using errcode = '23514',
          constraint = 'asset_condition_assessment_immutable';
end;
$asset_condition_guard$;

create trigger asset_condition_assessment_guard_trg
before update or delete on public.asset_condition_assessments
for each row execute function public.guard_asset_condition_assessment();

create or replace function public.guard_tenancy_asset_assignment()
returns trigger
language plpgsql
as $tenancy_asset_assignment_guard$
declare
  tenancy_unit_id uuid;
  asset_unit_id uuid;
  assessment_asset_id uuid;
  move_in_changed boolean;
  move_out_changed boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Tenancy Asset assignments preserve inventory history.'
      using errcode = '23514',
            constraint = 'tenancy_asset_assignment_delete_forbidden';
  end if;

  if tg_op = 'INSERT' then
    select unit_id into tenancy_unit_id
    from public.tenancies
    where id = new.tenancy_id;

    select unit_id into asset_unit_id
    from public.assets
    where id = new.asset_id;

    if asset_unit_id is null or asset_unit_id <> tenancy_unit_id then
      raise exception 'Tenancy inventory Asset must belong to the Tenancy Unit.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_unit_mismatch';
    end if;

    if new.version <> 1
       or new.move_in_presence is not null
       or new.move_out_presence is not null
    then
      raise exception 'New Tenancy Asset assignments start empty at version 1.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_initial_state';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
     or new.tenancy_id is distinct from old.tenancy_id
     or new.asset_id is distinct from old.asset_id
     or new.assigned_at is distinct from old.assigned_at
     or new.assigned_by_user_id is distinct from old.assigned_by_user_id
  then
    raise exception 'Tenancy Asset assignment identity is immutable.'
      using errcode = '23514',
            constraint = 'tenancy_asset_assignment_identity_immutable';
  end if;

  move_in_changed :=
    new.move_in_presence is distinct from old.move_in_presence
    or new.move_in_condition_assessment_id is distinct from old.move_in_condition_assessment_id
    or new.move_in_recorded_at is distinct from old.move_in_recorded_at
    or new.move_in_recorded_by_user_id is distinct from old.move_in_recorded_by_user_id
    or new.move_in_notes is distinct from old.move_in_notes;

  move_out_changed :=
    new.move_out_presence is distinct from old.move_out_presence
    or new.move_out_condition_assessment_id is distinct from old.move_out_condition_assessment_id
    or new.move_out_recorded_at is distinct from old.move_out_recorded_at
    or new.move_out_recorded_by_user_id is distinct from old.move_out_recorded_by_user_id
    or new.move_out_notes is distinct from old.move_out_notes;

  if move_in_changed = move_out_changed then
    raise exception 'Exactly one inventory phase may be appended per mutation.'
      using errcode = '23514',
            constraint = 'tenancy_asset_assignment_phase_mutation_invalid';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'Tenancy Asset inventory mutation must advance version by one.'
      using errcode = '23514',
            constraint = 'tenancy_asset_assignment_version_step';
  end if;

  if move_in_changed then
    if old.move_in_presence is not null or new.move_in_presence is null then
      raise exception 'Move-in inventory is append-once.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_move_in_immutable';
    end if;
  end if;

  if move_out_changed then
    if old.move_in_presence is null
       or old.move_out_presence is not null
       or new.move_out_presence is null
    then
      raise exception 'Move-out inventory is append-once and requires move-in.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_move_out_immutable';
    end if;
  end if;

  if new.move_in_condition_assessment_id is not null then
    select asset_id into assessment_asset_id
    from public.asset_condition_assessments
    where id = new.move_in_condition_assessment_id;

    if assessment_asset_id is distinct from new.asset_id then
      raise exception 'Move-in condition assessment must belong to assigned Asset.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_condition_asset_mismatch';
    end if;
  end if;

  if new.move_out_condition_assessment_id is not null then
    select asset_id into assessment_asset_id
    from public.asset_condition_assessments
    where id = new.move_out_condition_assessment_id;

    if assessment_asset_id is distinct from new.asset_id then
      raise exception 'Move-out condition assessment must belong to assigned Asset.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_condition_asset_mismatch';
    end if;
  end if;

  return new;
end;
$tenancy_asset_assignment_guard$;

create trigger tenancy_asset_assignment_guard_trg
before insert or update or delete on public.tenancy_asset_assignments
for each row execute function public.guard_tenancy_asset_assignment();

create or replace function public.assert_asset_location_projection(target_asset_id uuid)
returns void
language plpgsql
as $asset_location_projection_guard$
declare
  open_count integer;
  asset_property_id uuid;
  asset_unit_id uuid;
  asset_space_id uuid;
  location_property_id uuid;
  location_unit_id uuid;
  location_space_id uuid;
begin
  select property_id, unit_id, space_id
    into asset_property_id, asset_unit_id, asset_space_id
  from public.assets
  where id = target_asset_id;

  if not found then
    return;
  end if;

  select
    count(*)::integer,
    max(property_id),
    max(unit_id),
    max(space_id)
  into
    open_count,
    location_property_id,
    location_unit_id,
    location_space_id
  from public.asset_location_history
  where asset_id = target_asset_id
    and valid_to is null;

  if open_count <> 1 then
    raise exception 'Asset must have exactly one open location interval.'
      using errcode = '23514',
            constraint = 'asset_location_open_interval_required';
  end if;

  if asset_property_id is distinct from location_property_id
     or asset_unit_id is distinct from location_unit_id
     or asset_space_id is distinct from location_space_id
  then
    raise exception 'Asset current placement must match its open location interval.'
      using errcode = '23514',
            constraint = 'asset_location_projection_mismatch';
  end if;
end;
$asset_location_projection_guard$;

create or replace function public.guard_asset_location_projection_from_asset()
returns trigger
language plpgsql
as $asset_location_projection_asset_trigger$
begin
  perform public.assert_asset_location_projection(new.id);
  return null;
end;
$asset_location_projection_asset_trigger$;

create constraint trigger asset_location_projection_asset_guard_trg
after insert or update on public.assets
deferrable initially deferred
for each row execute function public.guard_asset_location_projection_from_asset();

create or replace function public.guard_asset_location_projection_from_history()
returns trigger
language plpgsql
as $asset_location_projection_history_trigger$
begin
  perform public.assert_asset_location_projection(
    case when tg_op = 'DELETE' then old.asset_id else new.asset_id end
  );
  return null;
end;
$asset_location_projection_history_trigger$;

create constraint trigger asset_location_projection_history_guard_trg
after insert or update or delete on public.asset_location_history
deferrable initially deferred
for each row execute function public.guard_asset_location_projection_from_history();

create or replace function public.guard_asset_mutation()
returns trigger
language plpgsql
as $asset_mutation_guard$
declare
  metadata_changed boolean;
  placement_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active' or new.version <> 1 then
      raise exception 'New Assets must start active at version 1.'
        using errcode = '23514',
              constraint = 'asset_initial_state';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Asset physical identity cannot be deleted.'
      using errcode = '23514',
            constraint = 'asset_delete_forbidden';
  end if;

  if new.code is distinct from old.code then
    raise exception 'Asset business identity code is immutable.'
      using errcode = '23514',
            constraint = 'asset_identity_immutable';
  end if;

  metadata_changed :=
    new.name is distinct from old.name
    or new.manufacturer is distinct from old.manufacturer
    or new.model is distinct from old.model;

  placement_changed :=
    new.property_id is distinct from old.property_id
    or new.unit_id is distinct from old.unit_id
    or new.space_id is distinct from old.space_id;

  if placement_changed then
    if metadata_changed or new.status is distinct from old.status then
      raise exception 'Asset movement is a separate aggregate mutation.'
        using errcode = '23514',
              constraint = 'asset_move_mixed_mutation_forbidden';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'Asset movement must advance version by one.'
        using errcode = '23514',
              constraint = 'asset_version_step';
    end if;

    if not exists (
      select 1
      from public.asset_location_history h
      where h.asset_id = old.id
        and h.valid_to is null
        and h.property_id = new.property_id
        and h.unit_id is not distinct from new.unit_id
        and h.space_id is not distinct from new.space_id
    ) then
      raise exception 'Asset movement requires a matching open location interval.'
        using errcode = '23514',
              constraint = 'asset_move_location_required';
    end if;

    return new;
  end if;

  if new.status = old.status then
    if metadata_changed and new.version <> old.version + 1 then
      raise exception 'Asset metadata correction must advance version by one.'
        using errcode = '23514',
              constraint = 'asset_version_step';
    end if;
    if not metadata_changed and new.version <> old.version then
      raise exception 'Asset version may advance only with a supported mutation.'
        using errcode = '23514',
              constraint = 'asset_version_step';
    end if;
    return new;
  end if;

  if metadata_changed then
    raise exception 'Asset metadata correction and lifecycle transition are separate commands.'
      using errcode = '23514',
            constraint = 'asset_mixed_mutation_forbidden';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'Asset lifecycle transition must advance version by one.'
      using errcode = '23514',
            constraint = 'asset_version_step';
  end if;

  if old.status = 'active' and new.status in ('inactive', 'retired') then
    return new;
  end if;

  if old.status = 'inactive' and new.status in ('active', 'retired') then
    return new;
  end if;

  if old.status in ('active', 'inactive') and new.status = 'replaced' then
    if not exists (
      select 1
      from public.asset_replacements r
      where r.replaced_asset_id = old.id
    ) then
      raise exception 'Asset can become replaced only with a replacement relationship.'
        using errcode = '23514',
              constraint = 'asset_replacement_required';
    end if;
    return new;
  end if;

  raise exception 'Invalid Asset lifecycle transition.'
    using errcode = '23514',
          constraint = 'asset_lifecycle_transition_invalid';
end;
$asset_mutation_guard$;

alter table public.asset_location_history enable row level security;
alter table public.asset_condition_assessments enable row level security;
alter table public.tenancy_asset_assignments enable row level security;

comment on table public.asset_location_history is
  'Authoritative temporal Asset placement. assets.property_id/unit_id/space_id are only the current projection.';
comment on table public.asset_condition_assessments is
  'Append-only Asset condition history.';
comment on table public.tenancy_asset_assignments is
  'Stable Tenancy↔Asset inventory assignment with append-once move-in/move-out snapshots.';

commit;
