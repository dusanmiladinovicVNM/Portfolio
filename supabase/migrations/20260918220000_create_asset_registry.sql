begin;

alter table public.units
  add constraint units_id_property_uq unique (id, property_id);

alter table public.spaces
  add constraint spaces_id_unit_uq unique (id, unit_id);

create table public.assets (
  id uuid primary key,
  code text not null,
  name text not null,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid,
  space_id uuid,
  manufacturer text,
  model text,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assets_code_not_blank check (btrim(code) <> ''),
  constraint assets_code_canonical check (code = btrim(code)),
  constraint assets_name_not_blank check (btrim(name) <> ''),
  constraint assets_name_canonical check (name = btrim(name)),
  constraint assets_manufacturer_not_blank
    check (manufacturer is null or btrim(manufacturer) <> ''),
  constraint assets_manufacturer_canonical
    check (manufacturer is null or manufacturer = btrim(manufacturer)),
  constraint assets_model_not_blank
    check (model is null or btrim(model) <> ''),
  constraint assets_model_canonical
    check (model is null or model = btrim(model)),
  constraint assets_status_valid
    check (status in ('active', 'inactive', 'retired', 'replaced')),
  constraint assets_version_positive check (version > 0),
  constraint assets_space_requires_unit
    check (space_id is null or unit_id is not null),
  constraint assets_unit_same_property_fk
    foreign key (unit_id, property_id)
    references public.units(id, property_id)
    on delete restrict,
  constraint assets_space_same_unit_fk
    foreign key (space_id, unit_id)
    references public.spaces(id, unit_id)
    on delete restrict
);

create unique index assets_code_uq
  on public.assets (lower(btrim(code)));
create index assets_property_id_idx on public.assets (property_id);
create index assets_unit_id_idx on public.assets (unit_id)
  where unit_id is not null;
create index assets_space_id_idx on public.assets (space_id)
  where space_id is not null;

create table public.asset_identifiers (
  id uuid primary key,
  asset_id uuid not null references public.assets(id) on delete restrict,
  identifier_type text not null,
  value text not null,
  label text,
  created_at timestamptz not null default now(),

  constraint asset_identifiers_type_valid check (
    identifier_type in (
      'serial_number', 'product_number', 'inventory_tag',
      'barcode', 'imei', 'mac_address', 'other'
    )
  ),
  constraint asset_identifiers_value_not_blank check (btrim(value) <> ''),
  constraint asset_identifiers_value_canonical check (value = btrim(value)),
  constraint asset_identifiers_label_not_blank
    check (label is null or btrim(label) <> ''),
  constraint asset_identifiers_label_canonical
    check (label is null or label = btrim(label))
);

create unique index asset_identifiers_identity_uq
  on public.asset_identifiers (
    asset_id,
    identifier_type,
    lower(btrim(value))
  );
create unique index asset_identifiers_inventory_tag_uq
  on public.asset_identifiers (lower(btrim(value)))
  where identifier_type = 'inventory_tag';
create unique index asset_identifiers_imei_uq
  on public.asset_identifiers (lower(btrim(value)))
  where identifier_type = 'imei';
create unique index asset_identifiers_mac_address_uq
  on public.asset_identifiers (lower(btrim(value)))
  where identifier_type = 'mac_address';
create index asset_identifiers_asset_id_idx
  on public.asset_identifiers (asset_id);

create table public.asset_replacements (
  id uuid primary key,
  replaced_asset_id uuid not null
    references public.assets(id) on delete restrict,
  replacement_asset_id uuid not null
    references public.assets(id) on delete restrict,
  replaced_by_user_id uuid not null
    references public.app_users(id) on delete restrict,
  replaced_at timestamptz not null,

  constraint asset_replacements_distinct
    check (replaced_asset_id <> replacement_asset_id),
  constraint asset_replacements_replaced_uq
    unique (replaced_asset_id),
  constraint asset_replacements_replacement_uq
    unique (replacement_asset_id)
);

create or replace function public.guard_asset_identifier()
returns trigger
language plpgsql
as $asset_identifier_guard$
begin
  raise exception 'Asset identifiers are append-only identity data.'
    using errcode = '23514',
          constraint = 'asset_identifier_immutable';
end;
$asset_identifier_guard$;

create trigger asset_identifier_guard_trg
before update or delete on public.asset_identifiers
for each row execute function public.guard_asset_identifier();

create or replace function public.guard_asset_replacement()
returns trigger
language plpgsql
as $asset_replacement_guard$
declare
  replaced_property_id uuid;
  replacement_property_id uuid;
  replaced_unit_id uuid;
  replacement_unit_id uuid;
  replaced_space_id uuid;
  replacement_space_id uuid;
  replaced_status text;
  replacement_status text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Asset replacement relationships are append-only.'
      using errcode = '23514',
            constraint = 'asset_replacement_immutable';
  end if;

  select property_id, unit_id, space_id, status
    into replaced_property_id, replaced_unit_id, replaced_space_id, replaced_status
  from public.assets
  where id = new.replaced_asset_id;

  select property_id, unit_id, space_id, status
    into replacement_property_id, replacement_unit_id, replacement_space_id, replacement_status
  from public.assets
  where id = new.replacement_asset_id;

  if replaced_property_id is distinct from replacement_property_id
     or replaced_unit_id is distinct from replacement_unit_id
     or replaced_space_id is distinct from replacement_space_id
  then
    raise exception 'Replacement Asset must inherit the exact predecessor placement.'
      using errcode = '23514',
            constraint = 'asset_replacement_placement_mismatch';
  end if;

  if replaced_status not in ('active', 'inactive') then
    raise exception 'Only an active/inactive Asset can be replaced.'
      using errcode = '23514',
            constraint = 'asset_replacement_predecessor_state';
  end if;

  if replacement_status <> 'active' then
    raise exception 'Replacement Asset must start active.'
      using errcode = '23514',
            constraint = 'asset_replacement_successor_state';
  end if;

  if exists (
    with recursive successors(asset_id) as (
      select new.replacement_asset_id
      union all
      select r.replacement_asset_id
      from public.asset_replacements r
      join successors s on r.replaced_asset_id = s.asset_id
    )
    select 1
    from successors
    where asset_id = new.replaced_asset_id
  ) then
    raise exception 'Asset replacement lineage cannot contain a cycle.'
      using errcode = '23514',
            constraint = 'asset_replacement_cycle';
  end if;

  return new;
end;
$asset_replacement_guard$;

create trigger asset_replacement_guard_trg
before insert or update or delete on public.asset_replacements
for each row execute function public.guard_asset_replacement();

create or replace function public.guard_asset_replacement_commit()
returns trigger
language plpgsql
as $asset_replacement_commit_guard$
begin
  if not exists (
    select 1
    from public.assets a
    where a.id = new.replaced_asset_id
      and a.status = 'replaced'
  ) then
    raise exception 'Replacement relationship and predecessor replaced status must commit together.'
      using errcode = '23514',
            constraint = 'asset_replacement_status_required';
  end if;

  return null;
end;
$asset_replacement_commit_guard$;

create constraint trigger asset_replacement_commit_guard_trg
after insert on public.asset_replacements
deferrable initially deferred
for each row execute function public.guard_asset_replacement_commit();

create or replace function public.guard_asset_mutation()
returns trigger
language plpgsql
as $asset_mutation_guard$
declare
  metadata_changed boolean;
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

  if new.code is distinct from old.code
     or new.property_id is distinct from old.property_id
     or new.unit_id is distinct from old.unit_id
     or new.space_id is distinct from old.space_id
  then
    raise exception 'Asset business identity and current placement are protected in Asset Registry.'
      using errcode = '23514',
            constraint = 'asset_identity_placement_immutable';
  end if;

  metadata_changed :=
    new.name is distinct from old.name
    or new.manufacturer is distinct from old.manufacturer
    or new.model is distinct from old.model;

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

create trigger asset_mutation_guard_trg
before insert or update or delete on public.assets
for each row execute function public.guard_asset_mutation();

alter table public.assets enable row level security;
alter table public.asset_identifiers enable row level security;
alter table public.asset_replacements enable row level security;

comment on table public.assets is
  'Stable physical Asset identity with Property-scoped current placement. Unit/Space are optional placement and become historical in canonical PR #15.';
comment on table public.asset_identifiers is
  'Append-only structured Asset identifiers. inventory_tag, imei and mac_address are globally unique.';
comment on table public.asset_replacements is
  'Append-only predecessor/successor relationship between physical Assets at the same current placement.';

commit;
