begin;

-- Inspection schema sections are templates. Unit-scoped templates materialize
-- once per Inspection; Space-scoped templates materialize once for every
-- matching active Space and freeze the Space presentation context.
alter table public.inspection_schema_sections
  add column scope text not null default 'unit',
  add column space_types text[] not null default '{}'::text[];

create or replace function public.inspection_space_types_valid(space_types_input text[])
returns boolean
language sql
immutable
as $$
  select
    coalesce(cardinality(space_types_input), 0) =
      (select count(distinct value) from unnest(space_types_input) value)
    and not exists (
      select 1
      from unnest(space_types_input) value
      where value not in (
        'living_room', 'kitchen', 'bedroom', 'bathroom', 'hall',
        'balcony', 'terrace', 'cellar', 'storage', 'garage', 'parking', 'other'
      )
    );
$$;

alter table public.inspection_schema_sections
  add constraint inspection_schema_sections_scope_valid
    check (scope in ('unit', 'space')),
  add constraint inspection_schema_sections_space_types_valid
    check (public.inspection_space_types_valid(space_types)),
  add constraint inspection_schema_sections_scope_shape
    check (
      (scope = 'unit' and cardinality(space_types) = 0)
      or
      (scope = 'space' and cardinality(space_types) > 0)
    );

create table public.inspection_section_instances (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null,
  schema_version_id uuid not null,
  section_id uuid not null,
  scope text not null,
  space_id uuid references public.spaces(id) on delete restrict,
  space_code text,
  space_name text,
  space_type text,
  space_sort_order integer,
  created_at timestamptz not null default now(),

  constraint inspection_section_instances_scope_valid
    check (scope in ('unit', 'space')),
  constraint inspection_section_instances_space_type_valid
    check (
      space_type is null
      or space_type in (
        'living_room', 'kitchen', 'bedroom', 'bathroom', 'hall',
        'balcony', 'terrace', 'cellar', 'storage', 'garage', 'parking', 'other'
      )
    ),
  constraint inspection_section_instances_space_sort_nonnegative
    check (space_sort_order is null or space_sort_order >= 0),
  constraint inspection_section_instances_space_shape
    check (
      (
        scope = 'unit'
        and space_id is null
        and space_code is null
        and space_name is null
        and space_type is null
        and space_sort_order is null
      )
      or
      (
        scope = 'space'
        and space_id is not null
        and space_code is not null and btrim(space_code) <> ''
        and space_name is not null and btrim(space_name) <> ''
        and space_type is not null
        and space_sort_order is not null
      )
    ),
  constraint inspection_section_instances_inspection_fk
    foreign key (inspection_id, schema_version_id)
    references public.inspections(id, schema_version_id)
    on delete restrict,
  constraint inspection_section_instances_section_fk
    foreign key (section_id, schema_version_id)
    references public.inspection_schema_sections(id, schema_version_id)
    on delete restrict,
  constraint inspection_section_instances_identity_uq
    unique (id, inspection_id, schema_version_id, section_id)
);

create unique index inspection_section_instances_unit_uq
  on public.inspection_section_instances (inspection_id, section_id)
  where space_id is null;

create unique index inspection_section_instances_space_uq
  on public.inspection_section_instances (inspection_id, section_id, space_id)
  where space_id is not null;

create index inspection_section_instances_inspection_order_idx
  on public.inspection_section_instances (
    inspection_id, section_id, space_sort_order, id
  );

create or replace function public.guard_inspection_section_instance()
returns trigger
language plpgsql
as $inspection_section_instance_guard$
declare
  inspection_unit_id uuid;
  configured_scope text;
  configured_space_types text[];
  current_space_unit_id uuid;
  current_space_code text;
  current_space_name text;
  current_space_type text;
  current_space_sort_order integer;
  current_space_active boolean;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Inspection section instances are immutable.'
      using errcode = '23514',
            constraint = 'inspection_section_instance_immutable';
  end if;

  select i.unit_id, s.scope, s.space_types
    into inspection_unit_id, configured_scope, configured_space_types
  from public.inspections i
  join public.inspection_schema_sections s
    on s.schema_version_id = i.schema_version_id
   and s.id = new.section_id
  where i.id = new.inspection_id
    and i.schema_version_id = new.schema_version_id;

  if inspection_unit_id is null then
    raise exception 'Inspection section instance ownership is invalid.'
      using errcode = '23514',
            constraint = 'inspection_section_instance_owner_invalid';
  end if;

  if new.scope <> configured_scope then
    raise exception 'Inspection section instance scope must match its schema section.'
      using errcode = '23514',
            constraint = 'inspection_section_instance_scope_mismatch';
  end if;

  if configured_scope = 'unit' then
    return new;
  end if;

  select unit_id, code, name, space_type, sort_order, active
    into current_space_unit_id, current_space_code, current_space_name,
         current_space_type, current_space_sort_order, current_space_active
  from public.spaces
  where id = new.space_id;

  if current_space_unit_id is null
     or current_space_unit_id <> inspection_unit_id
     or not current_space_active
  then
    raise exception 'Inspection section Space must be an active Space of the Inspection Unit.'
      using errcode = '23514',
            constraint = 'inspection_section_instance_space_owner_invalid';
  end if;

  if not (current_space_type = any(configured_space_types)) then
    raise exception 'Inspection section does not apply to this Space type.'
      using errcode = '23514',
            constraint = 'inspection_section_instance_space_type_mismatch';
  end if;

  if new.space_code is distinct from current_space_code
     or new.space_name is distinct from current_space_name
     or new.space_type is distinct from current_space_type
     or new.space_sort_order is distinct from current_space_sort_order
  then
    raise exception 'Inspection section Space snapshot must match canonical Space at creation.'
      using errcode = '23514',
            constraint = 'inspection_section_instance_space_snapshot_mismatch';
  end if;

  return new;
end;
$inspection_section_instance_guard$;

create trigger inspection_section_instances_guard_trg
before insert or update or delete on public.inspection_section_instances
for each row execute function public.guard_inspection_section_instance();

-- Every pre-existing schema section is unit-scoped by the new defaults, so
-- every existing Inspection receives exactly one backward-compatible instance.
insert into public.inspection_section_instances (
  id, inspection_id, schema_version_id, section_id, scope
)
select
  gen_random_uuid(), i.id, i.schema_version_id, s.id, 'unit'
from public.inspections i
join public.inspection_schema_sections s
  on s.schema_version_id = i.schema_version_id;

alter table public.inspection_section_states
  add column section_instance_id uuid;

alter table public.inspection_section_states
  disable trigger inspection_section_states_editable_trg;

update public.inspection_section_states state
set section_instance_id = instance.id
from public.inspection_section_instances instance
where instance.inspection_id = state.inspection_id
  and instance.section_id = state.section_id;

alter table public.inspection_section_states
  enable trigger inspection_section_states_editable_trg;

alter table public.inspection_section_states
  alter column section_instance_id set not null,
  drop constraint inspection_section_states_pkey,
  add constraint inspection_section_states_instance_fk
    foreign key (
      section_instance_id, inspection_id, schema_version_id, section_id
    )
    references public.inspection_section_instances (
      id, inspection_id, schema_version_id, section_id
    )
    on delete restrict,
  add constraint inspection_section_states_pkey
    primary key (inspection_id, section_instance_id);

alter table public.inspection_responses
  add column section_instance_id uuid;

alter table public.inspection_responses
  disable trigger inspection_responses_validate_trg;

update public.inspection_responses response
set section_instance_id = instance.id
from public.inspection_section_instances instance
where instance.inspection_id = response.inspection_id
  and instance.section_id = response.section_id;

alter table public.inspection_responses
  enable trigger inspection_responses_validate_trg;

alter table public.inspection_responses
  alter column section_instance_id set not null,
  drop constraint inspection_responses_inspection_item_uq,
  add constraint inspection_responses_instance_fk
    foreign key (
      section_instance_id, inspection_id, schema_version_id, section_id
    )
    references public.inspection_section_instances (
      id, inspection_id, schema_version_id, section_id
    )
    on delete restrict,
  add constraint inspection_responses_inspection_instance_item_uq
    unique (inspection_id, section_instance_id, item_id);

alter table public.inspection_findings
  add column section_instance_id uuid;

alter table public.inspection_findings
  disable trigger inspection_findings_editable_trg;

update public.inspection_findings finding
set section_instance_id = instance.id
from public.inspection_section_instances instance
where instance.inspection_id = finding.inspection_id
  and instance.section_id = finding.section_id;

alter table public.inspection_findings
  enable trigger inspection_findings_editable_trg;

alter table public.inspection_findings
  alter column section_instance_id set not null,
  add constraint inspection_findings_instance_fk
    foreign key (
      section_instance_id, inspection_id, schema_version_id, section_id
    )
    references public.inspection_section_instances (
      id, inspection_id, schema_version_id, section_id
    )
    on delete restrict;

alter table public.inspection_evidence
  add column section_instance_id uuid;

alter table public.inspection_evidence
  disable trigger inspection_evidence_guard_trg;

update public.inspection_evidence evidence
set section_instance_id = instance.id
from public.inspection_section_instances instance
where evidence.section_id is not null
  and instance.inspection_id = evidence.inspection_id
  and instance.section_id = evidence.section_id;

alter table public.inspection_evidence
  enable trigger inspection_evidence_guard_trg;

alter table public.inspection_evidence
  add constraint inspection_evidence_instance_scope_shape
    check (
      (section_id is null and section_instance_id is null)
      or
      (section_id is not null and section_instance_id is not null)
    ),
  add constraint inspection_evidence_instance_fk
    foreign key (
      section_instance_id, inspection_id, schema_version_id, section_id
    )
    references public.inspection_section_instances (
      id, inspection_id, schema_version_id, section_id
    )
    on delete restrict;

drop index public.inspection_evidence_identity_uq;

create unique index inspection_evidence_identity_uq
on public.inspection_evidence (
  inspection_id,
  document_version_id,
  kind,
  coalesce(section_instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(caption, '')
);

create or replace function public.guard_inspection_section_state_identity()
returns trigger
language plpgsql
as $inspection_section_state_identity_guard$
begin
  if new.inspection_id is distinct from old.inspection_id
     or new.schema_version_id is distinct from old.schema_version_id
     or new.section_instance_id is distinct from old.section_instance_id
     or new.section_id is distinct from old.section_id
  then
    raise exception 'Inspection SectionState ownership is immutable.'
      using errcode = '23514',
            constraint = 'inspection_section_state_identity_immutable';
  end if;
  return new;
end;
$inspection_section_state_identity_guard$;

create trigger inspection_section_state_identity_trg
before update on public.inspection_section_states
for each row execute function public.guard_inspection_section_state_identity();

create or replace function public.guard_inspection_response_identity()
returns trigger
language plpgsql
as $inspection_response_identity_guard$
begin
  if new.inspection_id is distinct from old.inspection_id
     or new.schema_version_id is distinct from old.schema_version_id
     or new.section_instance_id is distinct from old.section_instance_id
     or new.section_id is distinct from old.section_id
     or new.item_id is distinct from old.item_id
  then
    raise exception 'Inspection Response ownership is immutable.'
      using errcode = '23514',
            constraint = 'inspection_response_identity_immutable';
  end if;
  return new;
end;
$inspection_response_identity_guard$;

create trigger inspection_response_identity_trg
before update on public.inspection_responses
for each row execute function public.guard_inspection_response_identity();

alter table public.inspection_section_instances enable row level security;
revoke all on table public.inspection_section_instances from anon, authenticated;

comment on table public.inspection_section_instances is
  'Frozen occurrence of one Inspection schema section. Space-scoped instances snapshot Space identity/presentation so later Space changes cannot rewrite Inspection history.';
comment on table public.inspection_responses is
  'One typed dynamic form answer per Inspection section instance and schema item.';
comment on table public.inspection_evidence is
  'Exact DocumentVersion evidence attached at inspection/section-instance/item grain. final_report is derived from the immutable final snapshot.';

commit;
