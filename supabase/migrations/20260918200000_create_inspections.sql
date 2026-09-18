begin;

-- Composite identity supports a relational guarantee that an optional Tenancy
-- attached to an Inspection belongs to the same Unit.
create unique index if not exists tenancies_id_unit_uq
  on public.tenancies (id, unit_id);

create table public.inspection_schema_versions (
  id uuid primary key default gen_random_uuid(),
  schema_code text not null,
  version_number integer not null,
  inspection_type text not null,
  title text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),

  constraint inspection_schema_versions_code_not_blank check (btrim(schema_code) <> ''),
  constraint inspection_schema_versions_version_positive check (version_number >= 1),
  constraint inspection_schema_versions_type_valid check (
    inspection_type in (
      'move_in', 'move_out', 'periodic',
      'damage_report', 'key_handover', 'other'
    )
  ),
  constraint inspection_schema_versions_title_not_blank check (btrim(title) <> ''),
  constraint inspection_schema_versions_status_valid check (
    status in ('draft', 'published', 'retired')
  )
);

create unique index inspection_schema_versions_code_version_uq
  on public.inspection_schema_versions (lower(schema_code), version_number);

create index inspection_schema_versions_lookup_idx
  on public.inspection_schema_versions (lower(schema_code), version_number desc);

create table public.inspection_schema_sections (
  id uuid primary key default gen_random_uuid(),
  schema_version_id uuid not null
    references public.inspection_schema_versions(id) on delete restrict,
  section_key text not null,
  title text not null,
  description text,
  sort_order integer not null,

  constraint inspection_schema_sections_key_not_blank check (btrim(section_key) <> ''),
  constraint inspection_schema_sections_title_not_blank check (btrim(title) <> ''),
  constraint inspection_schema_sections_description_not_blank
    check (description is null or btrim(description) <> ''),
  constraint inspection_schema_sections_sort_nonnegative check (sort_order >= 0),
  constraint inspection_schema_sections_id_version_uq unique (id, schema_version_id)
);

create unique index inspection_schema_sections_key_uq
  on public.inspection_schema_sections (schema_version_id, lower(section_key));

create unique index inspection_schema_sections_sort_uq
  on public.inspection_schema_sections (schema_version_id, sort_order);

create table public.inspection_schema_items (
  id uuid primary key default gen_random_uuid(),
  schema_version_id uuid not null,
  section_id uuid not null,
  item_key text not null,
  item_type text not null,
  label text not null,
  required boolean not null default false,
  sort_order integer not null,
  options jsonb not null default '[]'::jsonb,
  visible_when jsonb,
  required_when jsonb,

  constraint inspection_schema_items_section_fk
    foreign key (section_id, schema_version_id)
    references public.inspection_schema_sections(id, schema_version_id)
    on delete restrict,
  constraint inspection_schema_items_key_not_blank check (btrim(item_key) <> ''),
  constraint inspection_schema_items_type_valid check (
    item_type in (
      'text', 'textarea', 'number', 'date',
      'checkbox', 'select', 'multiselect', 'radio'
    )
  ),
  constraint inspection_schema_items_label_not_blank check (btrim(label) <> ''),
  constraint inspection_schema_items_sort_nonnegative check (sort_order >= 0),
  constraint inspection_schema_items_options_array check (jsonb_typeof(options) = 'array'),
  constraint inspection_schema_items_visible_condition_object check (
    visible_when is null or jsonb_typeof(visible_when) = 'object'
  ),
  constraint inspection_schema_items_required_condition_object check (
    required_when is null or jsonb_typeof(required_when) = 'object'
  ),
  constraint inspection_schema_items_id_version_section_uq
    unique (id, schema_version_id, section_id)
);

create unique index inspection_schema_items_key_uq
  on public.inspection_schema_items (schema_version_id, lower(item_key));

create unique index inspection_schema_items_sort_uq
  on public.inspection_schema_items (section_id, sort_order);

create or replace function public.guard_inspection_schema_structure_mutation()
returns trigger
language plpgsql
as $inspection_schema_guard$
declare
  target_schema_version_id uuid;
  target_status text;
begin
  if tg_table_name = 'inspection_schema_versions' then
    if tg_op = 'DELETE' then
      if old.status <> 'draft' then
        raise exception 'Published/retired inspection schema versions are immutable.'
          using errcode = '23514',
                constraint = 'inspection_schema_version_immutable';
      end if;
      return old;
    end if;

    if old.status <> 'draft' then
      if new.schema_code is distinct from old.schema_code
         or new.version_number is distinct from old.version_number
         or new.inspection_type is distinct from old.inspection_type
         or new.title is distinct from old.title
      then
        raise exception 'Published/retired inspection schema content is immutable.'
          using errcode = '23514',
                constraint = 'inspection_schema_version_immutable';
      end if;

      if not (
        old.status = 'published' and new.status = 'retired'
        or old.status = new.status
      ) then
        raise exception 'Invalid inspection schema lifecycle transition.'
          using errcode = '23514',
                constraint = 'inspection_schema_transition_invalid';
      end if;
    elsif new.status not in ('draft', 'published') then
      raise exception 'Draft inspection schema can only remain draft or be published.'
        using errcode = '23514',
              constraint = 'inspection_schema_transition_invalid';
    end if;

    return new;
  end if;

  target_schema_version_id :=
    case when tg_op = 'DELETE' then old.schema_version_id else new.schema_version_id end;

  select status
  into target_status
  from public.inspection_schema_versions
  where id = target_schema_version_id;

  if target_status <> 'draft' then
    raise exception 'Published/retired inspection schema structure is immutable.'
      using errcode = '23514',
            constraint = 'inspection_schema_structure_immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$inspection_schema_guard$;

create trigger inspection_schema_version_immutable_trg
before update or delete on public.inspection_schema_versions
for each row
execute function public.guard_inspection_schema_structure_mutation();

create trigger inspection_schema_sections_immutable_trg
before insert or update or delete on public.inspection_schema_sections
for each row
execute function public.guard_inspection_schema_structure_mutation();

create trigger inspection_schema_items_immutable_trg
before insert or update or delete on public.inspection_schema_items
for each row
execute function public.guard_inspection_schema_structure_mutation();

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  inspection_type text not null,
  unit_id uuid not null references public.units(id) on delete restrict,
  tenancy_id uuid,
  schema_version_id uuid not null
    references public.inspection_schema_versions(id) on delete restrict,
  assigned_to_user_id uuid not null
    references public.app_users(id) on delete restrict,
  created_by_user_id uuid not null
    references public.app_users(id) on delete restrict,
  scheduled_for date,
  status text not null default 'draft',
  started_at timestamptz,
  locked_at timestamptz,
  finalized_at timestamptz,
  cancelled_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inspections_code_not_blank check (btrim(code) <> ''),
  constraint inspections_type_valid check (
    inspection_type in (
      'move_in', 'move_out', 'periodic',
      'damage_report', 'key_handover', 'other'
    )
  ),
  constraint inspections_status_valid check (
    status in ('draft', 'in_progress', 'locked', 'finalized', 'cancelled')
  ),
  constraint inspections_version_positive check (version >= 1),
  constraint inspections_tenancy_same_unit_fk
    foreign key (tenancy_id, unit_id)
    references public.tenancies(id, unit_id)
    on delete restrict,
  constraint inspections_state_shape check (
    (status = 'draft'
      and started_at is null and locked_at is null
      and finalized_at is null and cancelled_at is null)
    or
    (status = 'in_progress'
      and started_at is not null
      and locked_at is null and finalized_at is null and cancelled_at is null)
    or
    (status = 'locked'
      and locked_at is not null
      and finalized_at is null and cancelled_at is null)
    or
    (status = 'finalized'
      and locked_at is not null and finalized_at is not null
      and cancelled_at is null)
    or
    (status = 'cancelled'
      and locked_at is null and finalized_at is null
      and cancelled_at is not null)
  ),
  constraint inspections_id_schema_uq unique (id, schema_version_id)
);

create unique index inspections_code_uq on public.inspections (lower(code));
create index inspections_unit_id_idx on public.inspections (unit_id, created_at desc);
create index inspections_tenancy_id_idx
  on public.inspections (tenancy_id)
  where tenancy_id is not null;
create index inspections_assignee_idx
  on public.inspections (assigned_to_user_id, status);

create or replace function public.validate_inspection_schema_assignment()
returns trigger
language plpgsql
as $inspection_schema_assignment$
declare
  schema_status text;
  schema_type text;
  assignee_status text;
begin
  select status, inspection_type
  into schema_status, schema_type
  from public.inspection_schema_versions
  where id = new.schema_version_id;

  if schema_status <> 'published' then
    raise exception 'Inspection requires a published schema version.'
      using errcode = '23514',
            constraint = 'inspections_schema_published';
  end if;

  if schema_type <> new.inspection_type then
    raise exception 'Inspection type must match schema type.'
      using errcode = '23514',
            constraint = 'inspections_schema_type_match';
  end if;

  select status
  into assignee_status
  from public.app_users
  where id = new.assigned_to_user_id;

  if assignee_status <> 'active' then
    raise exception 'Inspection assignee must be active.'
      using errcode = '23514',
            constraint = 'inspections_assignee_active';
  end if;

  return new;
end;
$inspection_schema_assignment$;

create trigger inspections_schema_assignment_trg
before insert or update of inspection_type, schema_version_id, assigned_to_user_id
on public.inspections
for each row
execute function public.validate_inspection_schema_assignment();

create table public.inspection_section_states (
  inspection_id uuid not null,
  schema_version_id uuid not null,
  section_id uuid not null,
  revision integer not null default 0,

  constraint inspection_section_states_revision_nonnegative check (revision >= 0),
  constraint inspection_section_states_inspection_fk
    foreign key (inspection_id, schema_version_id)
    references public.inspections(id, schema_version_id)
    on delete restrict,
  constraint inspection_section_states_section_fk
    foreign key (section_id, schema_version_id)
    references public.inspection_schema_sections(id, schema_version_id)
    on delete restrict,
  primary key (inspection_id, section_id)
);

create table public.inspection_responses (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null,
  schema_version_id uuid not null,
  section_id uuid not null,
  item_id uuid not null,
  value jsonb not null,
  comment text,
  updated_by_user_id uuid not null references public.app_users(id) on delete restrict,
  updated_at timestamptz not null,

  constraint inspection_responses_comment_not_blank
    check (comment is null or btrim(comment) <> ''),
  constraint inspection_responses_inspection_fk
    foreign key (inspection_id, schema_version_id)
    references public.inspections(id, schema_version_id)
    on delete restrict,
  constraint inspection_responses_item_fk
    foreign key (item_id, schema_version_id, section_id)
    references public.inspection_schema_items(id, schema_version_id, section_id)
    on delete restrict,
  constraint inspection_responses_inspection_item_uq
    unique (inspection_id, item_id)
);

create index inspection_responses_inspection_idx
  on public.inspection_responses (inspection_id, section_id);

create or replace function public.validate_inspection_response()
returns trigger
language plpgsql
as $inspection_response_guard$
declare
  inspection_status text;
  expected_type text;
  configured_options jsonb;
  value_text text;
begin
  select status
  into inspection_status
  from public.inspections
  where id = new.inspection_id;

  if inspection_status not in ('draft', 'in_progress') then
    raise exception 'Inspection content is locked.'
      using errcode = '23514',
            constraint = 'inspection_content_locked';
  end if;

  select item_type, options
  into expected_type, configured_options
  from public.inspection_schema_items
  where id = new.item_id
    and schema_version_id = new.schema_version_id
    and section_id = new.section_id;

  if expected_type = 'checkbox' then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'Inspection checkbox answer must be boolean.'
        using errcode = '23514',
              constraint = 'inspection_response_type_match';
    end if;
  elsif expected_type = 'multiselect' then
    if jsonb_typeof(new.value) <> 'array'
       or exists (
         select 1
         from jsonb_array_elements(new.value) element
         where jsonb_typeof(element) <> 'string'
            or not exists (
              select 1
              from jsonb_array_elements(configured_options) option
              where option->>'value' = element #>> '{}'
            )
       )
    then
      raise exception 'Inspection multiselect answer contains invalid values.'
        using errcode = '23514',
              constraint = 'inspection_response_option_match';
    end if;
  elsif expected_type in ('select', 'radio') then
    if jsonb_typeof(new.value) <> 'string'
       or not exists (
         select 1
         from jsonb_array_elements(configured_options) option
         where option->>'value' = new.value #>> '{}'
       )
    then
      raise exception 'Inspection answer is not a configured option.'
        using errcode = '23514',
              constraint = 'inspection_response_option_match';
    end if;
  elsif expected_type = 'number' then
    if jsonb_typeof(new.value) <> 'string' then
      raise exception 'Inspection number answer must be a canonical decimal string.'
        using errcode = '23514',
              constraint = 'inspection_response_type_match';
    end if;
    value_text := new.value #>> '{}';
    if value_text !~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$' then
      raise exception 'Inspection number answer must be a canonical decimal string.'
        using errcode = '23514',
              constraint = 'inspection_response_type_match';
    end if;
  elsif expected_type = 'date' then
    if jsonb_typeof(new.value) <> 'string' then
      raise exception 'Inspection date answer must be a date string.'
        using errcode = '23514',
              constraint = 'inspection_response_type_match';
    end if;
    value_text := new.value #>> '{}';
    begin
      perform value_text::date;
    exception when others then
      raise exception 'Inspection date answer must be a valid calendar date.'
        using errcode = '23514',
              constraint = 'inspection_response_type_match';
    end;
    if value_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Inspection date answer must use YYYY-MM-DD.'
        using errcode = '23514',
              constraint = 'inspection_response_type_match';
    end if;
  else
    if jsonb_typeof(new.value) <> 'string' then
      raise exception 'Inspection text answer must be a string.'
        using errcode = '23514',
              constraint = 'inspection_response_type_match';
    end if;
  end if;

  return new;
end;
$inspection_response_guard$;

create trigger inspection_responses_validate_trg
before insert or update on public.inspection_responses
for each row
execute function public.validate_inspection_response();

create or replace function public.guard_inspection_content_state()
returns trigger
language plpgsql
as $inspection_content_guard$
declare
  target_inspection_id uuid;
  inspection_status text;
begin
  target_inspection_id :=
    case when tg_op = 'DELETE' then old.inspection_id else new.inspection_id end;

  select status
  into inspection_status
  from public.inspections
  where id = target_inspection_id;

  if inspection_status not in ('draft', 'in_progress') then
    raise exception 'Inspection content is locked.'
      using errcode = '23514',
            constraint = 'inspection_content_locked';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$inspection_content_guard$;

create trigger inspection_section_states_editable_trg
before update on public.inspection_section_states
for each row
execute function public.guard_inspection_content_state();

create trigger inspection_responses_delete_editable_trg
before delete on public.inspection_responses
for each row
execute function public.guard_inspection_content_state();

create table public.inspection_findings (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null,
  schema_version_id uuid not null,
  section_id uuid not null,
  item_id uuid,
  severity text not null,
  title text not null,
  description text,
  created_by_user_id uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null,

  constraint inspection_findings_severity_valid
    check (severity in ('info', 'minor', 'major', 'critical')),
  constraint inspection_findings_title_not_blank check (btrim(title) <> ''),
  constraint inspection_findings_description_not_blank
    check (description is null or btrim(description) <> ''),
  constraint inspection_findings_inspection_fk
    foreign key (inspection_id, schema_version_id)
    references public.inspections(id, schema_version_id)
    on delete restrict,
  constraint inspection_findings_section_fk
    foreign key (section_id, schema_version_id)
    references public.inspection_schema_sections(id, schema_version_id)
    on delete restrict,
  constraint inspection_findings_item_fk
    foreign key (item_id, schema_version_id, section_id)
    references public.inspection_schema_items(id, schema_version_id, section_id)
    on delete restrict
);

create index inspection_findings_inspection_idx
  on public.inspection_findings (inspection_id, created_at, id);

create trigger inspection_findings_editable_trg
before insert or update or delete on public.inspection_findings
for each row
execute function public.guard_inspection_content_state();

alter table public.inspection_schema_versions enable row level security;
alter table public.inspection_schema_sections enable row level security;
alter table public.inspection_schema_items enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_section_states enable row level security;
alter table public.inspection_responses enable row level security;
alter table public.inspection_findings enable row level security;

comment on table public.inspection_schema_versions is
  'Versioned form definition. Published/retired schema content is immutable.';
comment on table public.inspection_responses is
  'One typed dynamic form answer per Inspection and schema item. Form answers are not canonical domain facts.';
comment on table public.inspection_section_states is
  'Per-section optimistic concurrency token for field autosave/offline workflows.';
comment on table public.inspection_findings is
  'Observed inspection finding. It is not yet an Issue or WorkOrder.';

commit;
