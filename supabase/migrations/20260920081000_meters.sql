begin;

create table public.meters (
  id uuid primary key,
  code text not null,
  serial_number text not null,
  utility_type text not null,
  measurement_unit text not null,
  unit_id uuid not null references public.units(id) on delete restrict,
  space_id uuid,
  label text not null,
  installed_at timestamptz not null,
  status text not null default 'active',
  retired_at timestamptz,
  retirement_recorded_at timestamptz,
  retired_by_user_id uuid references public.app_users(id) on delete restrict,
  retirement_reason text,
  version integer not null default 1,
  recorded_at timestamptz not null,
  recorded_by_user_id uuid not null references public.app_users(id) on delete restrict,

  constraint meters_code_not_blank check (btrim(code) <> ''),
  constraint meters_code_canonical check (code = btrim(code)),
  constraint meters_serial_not_blank check (btrim(serial_number) <> ''),
  constraint meters_serial_canonical check (serial_number = btrim(serial_number)),
  constraint meters_label_not_blank check (btrim(label) <> ''),
  constraint meters_label_canonical check (label = btrim(label)),
  constraint meters_utility_type_valid
    check (utility_type in ('electricity', 'gas', 'water', 'heat')),
  constraint meters_measurement_unit_valid
    check (measurement_unit in ('kwh', 'm3')),
  constraint meters_utility_measurement_pair_valid check (
    (utility_type in ('electricity', 'heat') and measurement_unit = 'kwh')
    or (utility_type = 'water' and measurement_unit = 'm3')
    or (utility_type = 'gas' and measurement_unit in ('m3', 'kwh'))
  ),
  constraint meters_version_positive check (version > 0),
  constraint meters_recorded_after_installation check (recorded_at >= installed_at),
  constraint meters_retirement_reason_not_blank
    check (retirement_reason is null or btrim(retirement_reason) <> ''),
  constraint meters_retirement_reason_canonical
    check (retirement_reason is null or retirement_reason = btrim(retirement_reason)),
  constraint meters_retirement_time_valid check (
    retired_at is null
    or (
      retired_at >= installed_at
      and retirement_recorded_at >= retired_at
    )
  ),
  constraint meters_retirement_recorded_after_registration check (
    retirement_recorded_at is null
    or retirement_recorded_at >= recorded_at
  ),
  constraint meters_lifecycle_shape check (
    (
      status = 'active'
      and retired_at is null
      and retirement_recorded_at is null
      and retired_by_user_id is null
      and retirement_reason is null
    )
    or
    (
      status = 'retired'
      and retired_at is not null
      and retirement_recorded_at is not null
      and retired_by_user_id is not null
      and retirement_reason is not null
    )
  ),
  constraint meters_status_valid check (status in ('active', 'retired')),
  constraint meters_space_same_unit_fk
    foreign key (space_id, unit_id)
    references public.spaces(id, unit_id)
    on delete restrict
);

create unique index meters_code_uq on public.meters (lower(btrim(code)));
create index meters_unit_idx on public.meters (unit_id, utility_type, status, code);

create table public.meter_readings (
  id uuid primary key,
  meter_id uuid not null references public.meters(id) on delete restrict,
  value numeric not null,
  read_at timestamptz not null,
  recorded_at timestamptz not null,
  recorded_by_user_id uuid not null references public.app_users(id) on delete restrict,
  note text,

  constraint meter_readings_value_nonnegative check (value >= 0),
  constraint meter_readings_value_scale_valid check (scale(value) <= 6),
  constraint meter_readings_value_range_valid
    check (value < 1000000000000000000::numeric),
  constraint meter_readings_recorded_after_read check (recorded_at >= read_at),
  constraint meter_readings_note_not_blank
    check (note is null or btrim(note) <> ''),
  constraint meter_readings_note_canonical
    check (note is null or note = btrim(note)),
  constraint meter_readings_meter_time_uq unique (meter_id, read_at)
);

create index meter_readings_meter_history_idx
  on public.meter_readings (meter_id, read_at, recorded_at, id);

create table public.meter_reading_boundaries (
  id uuid primary key,
  reading_id uuid not null references public.meter_readings(id) on delete restrict,
  tenancy_id uuid not null references public.tenancies(id) on delete restrict,
  boundary_type text not null,
  recorded_at timestamptz not null,
  recorded_by_user_id uuid not null references public.app_users(id) on delete restrict,

  constraint meter_reading_boundaries_type_valid
    check (boundary_type in ('move_in', 'move_out')),
  constraint meter_reading_boundaries_exact_link_uq
    unique (reading_id, tenancy_id, boundary_type)
);

create index meter_reading_boundaries_tenancy_idx
  on public.meter_reading_boundaries (tenancy_id, boundary_type, reading_id);

create or replace function public.guard_meter_mutation()
returns trigger
language plpgsql
as $meter_guard$
declare
  latest_reading_at timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active'
       or new.version <> 1
       or new.retired_at is not null
       or new.retirement_recorded_at is not null
       or new.retired_by_user_id is not null
       or new.retirement_reason is not null
    then
      raise exception 'New Meter must start active at version 1 without retirement provenance.'
        using errcode = '23514',
              constraint = 'meter_initial_state';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Meter physical identity cannot be deleted.'
      using errcode = '23514',
            constraint = 'meter_delete_forbidden';
  end if;

  if new.id is distinct from old.id
     or new.code is distinct from old.code
     or new.serial_number is distinct from old.serial_number
     or new.utility_type is distinct from old.utility_type
     or new.measurement_unit is distinct from old.measurement_unit
     or new.unit_id is distinct from old.unit_id
     or new.space_id is distinct from old.space_id
     or new.installed_at is distinct from old.installed_at
     or new.recorded_at is distinct from old.recorded_at
     or new.recorded_by_user_id is distinct from old.recorded_by_user_id
  then
    raise exception 'Meter identity, utility, placement, installation and original recording provenance are immutable.'
      using errcode = '23514',
            constraint = 'meter_identity_immutable';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'Meter version must advance exactly once.'
      using errcode = '23514',
            constraint = 'meter_version_step_invalid';
  end if;

  if old.status = 'active' and new.status = 'active' then
    if new.retired_at is distinct from old.retired_at
       or new.retirement_recorded_at is distinct from old.retirement_recorded_at
       or new.retired_by_user_id is distinct from old.retired_by_user_id
       or new.retirement_reason is distinct from old.retirement_reason
    then
      raise exception 'Active Meter cannot carry retirement provenance.'
        using errcode = '23514',
              constraint = 'meter_lifecycle_mutation_invalid';
    end if;

    return new;
  end if;

  if old.status = 'active' and new.status = 'retired' then
    if new.retired_at is null
       or new.retirement_recorded_at is null
       or new.retired_by_user_id is null
       or new.retirement_reason is null
    then
      raise exception 'Retired Meter requires complete retirement provenance.'
        using errcode = '23514',
              constraint = 'meter_retirement_provenance_required';
    end if;

    select max(read_at)
      into latest_reading_at
    from public.meter_readings
    where meter_id = old.id;

    if latest_reading_at is not null
       and new.retired_at < latest_reading_at
    then
      raise exception 'Meter retirement cannot predate an existing reading occurrence.'
        using errcode = '23514',
              constraint = 'meter_retirement_before_reading';
    end if;

    return new;
  end if;

  if old.status = 'retired' and new.status = 'retired' then
    if new.retired_at is distinct from old.retired_at
       or new.retirement_recorded_at is distinct from old.retirement_recorded_at
       or new.retired_by_user_id is distinct from old.retired_by_user_id
       or new.retirement_reason is distinct from old.retirement_reason
    then
      raise exception 'Meter retirement provenance is immutable.'
        using errcode = '23514',
              constraint = 'meter_retirement_immutable';
    end if;

    return new;
  end if;

  raise exception 'Meter lifecycle transition is invalid.'
    using errcode = '23514',
          constraint = 'meter_invalid_transition';
end;
$meter_guard$;

create trigger meter_guard_trg
before insert or update or delete on public.meters
for each row execute function public.guard_meter_mutation();

create or replace function public.guard_meter_reading_insert()
returns trigger
language plpgsql
as $meter_reading_insert_guard$
declare
  meter_installed_at timestamptz;
  meter_status text;
  meter_retired_at timestamptz;
  meter_recorded_at timestamptz;
begin
  select installed_at, status, retired_at, recorded_at
    into meter_installed_at, meter_status, meter_retired_at, meter_recorded_at
  from public.meters
  where id = new.meter_id
  for share;

  if meter_installed_at is null then
    raise exception 'Meter does not exist.'
      using errcode = '23514',
            constraint = 'meter_reading_meter_missing';
  end if;

  if new.read_at < meter_installed_at then
    raise exception 'Meter reading cannot predate Meter installation.'
      using errcode = '23514',
            constraint = 'meter_reading_before_installation';
  end if;

  if new.recorded_at < meter_recorded_at then
    raise exception 'Meter reading cannot be recorded before its parent Meter was registered.'
      using errcode = '23514',
            constraint = 'meter_reading_recorded_before_meter_registration';
  end if;

  if meter_status = 'retired'
     and new.read_at > meter_retired_at
  then
    raise exception 'Meter reading cannot occur after Meter retirement.'
      using errcode = '23514',
            constraint = 'meter_reading_after_retirement';
  end if;

  return new;
end;
$meter_reading_insert_guard$;

create trigger meter_reading_insert_guard_trg
before insert on public.meter_readings
for each row execute function public.guard_meter_reading_insert();

create or replace function public.guard_meter_reading_mutation()
returns trigger
language plpgsql
as $meter_reading_mutation_guard$
begin
  raise exception 'Meter readings are append-only observations.'
    using errcode = '23514',
          constraint = 'meter_reading_immutable';
end;
$meter_reading_mutation_guard$;

create trigger meter_reading_mutation_guard_trg
before update or delete on public.meter_readings
for each row execute function public.guard_meter_reading_mutation();

create or replace function public.guard_meter_reading_boundary_insert()
returns trigger
language plpgsql
as $meter_boundary_insert_guard$
declare
  target_meter_id uuid;
  meter_unit_id uuid;
  reading_read_at timestamptz;
  reading_recorded_at timestamptz;
  tenancy_unit_id uuid;
  tenancy_actual_start date;
  tenancy_actual_end date;
begin
  select r.meter_id, m.unit_id, r.read_at, r.recorded_at
    into target_meter_id, meter_unit_id, reading_read_at, reading_recorded_at
  from public.meter_readings r
  join public.meters m on m.id = r.meter_id
  where r.id = new.reading_id
  for update of m;

  if target_meter_id is null then
    raise exception 'Meter reading does not exist.'
      using errcode = '23514',
            constraint = 'meter_boundary_reading_missing';
  end if;

  if new.recorded_at < reading_recorded_at then
    raise exception 'Meter reading boundary cannot be recorded before the reading.'
      using errcode = '23514',
            constraint = 'meter_boundary_before_reading_recorded';
  end if;

  select unit_id, actual_start, actual_end
    into tenancy_unit_id, tenancy_actual_start, tenancy_actual_end
  from public.tenancies
  where id = new.tenancy_id
  for share;

  if tenancy_unit_id is null then
    raise exception 'Tenancy does not exist.'
      using errcode = '23514',
            constraint = 'meter_boundary_tenancy_missing';
  end if;

  if tenancy_unit_id is distinct from meter_unit_id then
    raise exception 'Meter reading boundary Tenancy must belong to the Meter Unit.'
      using errcode = '23514',
            constraint = 'meter_boundary_tenancy_unit_mismatch';
  end if;

  if new.boundary_type = 'move_in' then
    if tenancy_actual_start is null then
      raise exception 'Move-in reading requires Tenancy actualStart.'
        using errcode = '23514',
              constraint = 'meter_boundary_move_in_start_missing';
    end if;

    if (timezone('UTC', reading_read_at))::date <> tenancy_actual_start then
      raise exception 'Move-in reading UTC date must equal Tenancy actualStart.'
        using errcode = '23514',
              constraint = 'meter_boundary_move_in_date_mismatch';
    end if;
  elsif new.boundary_type = 'move_out' then
    if tenancy_actual_end is null then
      raise exception 'Move-out reading requires Tenancy actualEnd.'
        using errcode = '23514',
              constraint = 'meter_boundary_move_out_end_missing';
    end if;

    if (timezone('UTC', reading_read_at))::date <> tenancy_actual_end then
      raise exception 'Move-out reading UTC date must equal Tenancy actualEnd.'
        using errcode = '23514',
              constraint = 'meter_boundary_move_out_date_mismatch';
    end if;
  else
    return new;
  end if;

  if exists (
    select 1
    from public.meter_reading_boundaries b
    join public.meter_readings existing_reading
      on existing_reading.id = b.reading_id
    where existing_reading.meter_id = target_meter_id
      and b.tenancy_id = new.tenancy_id
      and b.boundary_type = new.boundary_type
  ) then
    raise exception 'Meter already has this Tenancy boundary reading.'
      using errcode = '23514',
            constraint = 'meter_boundary_already_exists';
  end if;

  return new;
end;
$meter_boundary_insert_guard$;

create trigger meter_boundary_insert_guard_trg
before insert on public.meter_reading_boundaries
for each row execute function public.guard_meter_reading_boundary_insert();

create or replace function public.guard_meter_reading_boundary_mutation()
returns trigger
language plpgsql
as $meter_boundary_mutation_guard$
begin
  raise exception 'Meter reading boundaries are append-only.'
    using errcode = '23514',
          constraint = 'meter_boundary_immutable';
end;
$meter_boundary_mutation_guard$;

create trigger meter_boundary_mutation_guard_trg
before update or delete on public.meter_reading_boundaries
for each row execute function public.guard_meter_reading_boundary_mutation();

alter table public.meters enable row level security;
alter table public.meter_readings enable row level security;
alter table public.meter_reading_boundaries enable row level security;

comment on table public.meters is
  'Exact physical cumulative utility Meter identity for one Unit and optional Space. Placement is immutable in canonical #21.';
comment on table public.meter_readings is
  'Append-only exact physical register observations. A lower later value is preserved as evidence; consumption projection marks the interval discontinuous instead of inventing negative consumption.';
comment on table public.meter_reading_boundaries is
  'Append-only Tenancy move-in/move-out semantic roles for physical MeterReadings. One reading may serve multiple Tenancy boundaries during turnover.';

commit;
