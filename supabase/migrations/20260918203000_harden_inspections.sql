begin;

alter table public.inspections
  add column content_revision integer not null default 0;

alter table public.inspections
  add constraint inspections_content_revision_nonnegative
  check (content_revision >= 0);

-- Header identity is historical identity, not editable metadata.
create or replace function public.guard_inspection_header_and_lifecycle()
returns trigger
language plpgsql
as $inspection_header_guard$
begin
  if
    new.code is distinct from old.code
    or new.inspection_type is distinct from old.inspection_type
    or new.unit_id is distinct from old.unit_id
    or new.tenancy_id is distinct from old.tenancy_id
    or new.schema_version_id is distinct from old.schema_version_id
    or new.created_by_user_id is distinct from old.created_by_user_id
  then
    raise exception 'Inspection historical identity is immutable.'
      using errcode = '23514',
            constraint = 'inspection_header_identity_immutable';
  end if;

  if new.status = old.status then
    if
      new.started_at is distinct from old.started_at
      or new.locked_at is distinct from old.locked_at
      or new.finalized_at is distinct from old.finalized_at
      or new.cancelled_at is distinct from old.cancelled_at
    then
      raise exception 'Inspection lifecycle timestamps change only with lifecycle transitions.'
        using errcode = '23514',
              constraint = 'inspection_lifecycle_metadata_immutable';
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'in_progress' then
    if new.started_at is null then
      raise exception 'Starting an inspection requires started_at.'
        using errcode = '23514',
              constraint = 'inspection_lifecycle_transition_invalid';
    end if;
    return new;
  end if;

  if old.status in ('draft', 'in_progress') and new.status = 'cancelled' then
    if new.cancelled_at is null then
      raise exception 'Cancelling an inspection requires cancelled_at.'
        using errcode = '23514',
              constraint = 'inspection_lifecycle_transition_invalid';
    end if;
    return new;
  end if;

  if old.status = 'in_progress' and new.status = 'locked' then
    if new.started_at is null or new.locked_at is null then
      raise exception 'Locking requires a started inspection and locked_at.'
        using errcode = '23514',
              constraint = 'inspection_lifecycle_transition_invalid';
    end if;
    return new;
  end if;

  raise exception 'Invalid inspection lifecycle transition.'
    using errcode = '23514',
          constraint = 'inspection_lifecycle_transition_invalid';
end;
$inspection_header_guard$;

create trigger inspections_header_lifecycle_guard_trg
before update on public.inspections
for each row
execute function public.guard_inspection_header_and_lifecycle();

alter table public.inspections
  drop constraint inspections_state_shape;

alter table public.inspections
  add constraint inspections_state_shape check (
    (status = 'draft'
      and started_at is null and locked_at is null
      and finalized_at is null and cancelled_at is null)
    or
    (status = 'in_progress'
      and started_at is not null
      and locked_at is null and finalized_at is null and cancelled_at is null)
    or
    (status = 'locked'
      and started_at is not null and locked_at is not null
      and finalized_at is null and cancelled_at is null)
    or
    (status = 'cancelled'
      and locked_at is null and finalized_at is null
      and cancelled_at is not null)
  );

-- Schema children never move between versions/sections after insert.
create or replace function public.guard_inspection_schema_structure_mutation()
returns trigger
language plpgsql
as $inspection_schema_guard$
declare
  old_status text;
  new_status text;
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
        (old.status = 'published' and new.status = 'retired')
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

  if tg_op = 'INSERT' then
    select status
      into new_status
      from public.inspection_schema_versions
      where id = new.schema_version_id;

    if new_status <> 'draft' then
      raise exception 'Published/retired inspection schema structure is immutable.'
        using errcode = '23514',
              constraint = 'inspection_schema_structure_immutable';
    end if;
    return new;
  end if;

  select status
    into old_status
    from public.inspection_schema_versions
    where id = old.schema_version_id;

  if old_status <> 'draft' then
    raise exception 'Published/retired inspection schema structure is immutable.'
      using errcode = '23514',
            constraint = 'inspection_schema_structure_immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.schema_version_id is distinct from old.schema_version_id then
    raise exception 'Schema child ownership is immutable after insert.'
      using errcode = '23514',
            constraint = 'inspection_schema_parent_immutable';
  end if;

  if tg_table_name = 'inspection_schema_items' then
    if new.section_id is distinct from old.section_id then
      raise exception 'Schema item section ownership is immutable after insert.'
        using errcode = '23514',
              constraint = 'inspection_schema_parent_immutable';
    end if;
  end if;

  return new;
end;
$inspection_schema_guard$;

-- Content rows cannot be retargeted. Both OLD and NEW parents must be editable.
create or replace function public.guard_inspection_content_state()
returns trigger
language plpgsql
as $inspection_content_guard$
declare
  old_status text;
  new_status text;
begin
  if tg_op = 'INSERT' then
    select status into new_status
    from public.inspections
    where id = new.inspection_id;

    if new_status not in ('draft', 'in_progress') then
      raise exception 'Inspection content is locked.'
        using errcode = '23514',
              constraint = 'inspection_content_locked';
    end if;
    return new;
  end if;

  select status into old_status
  from public.inspections
  where id = old.inspection_id;

  if old_status not in ('draft', 'in_progress') then
    raise exception 'Inspection content is locked.'
      using errcode = '23514',
            constraint = 'inspection_content_locked';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  select status into new_status
  from public.inspections
  where id = new.inspection_id;

  if new_status not in ('draft', 'in_progress') then
    raise exception 'Inspection content is locked.'
      using errcode = '23514',
            constraint = 'inspection_content_locked';
  end if;

  if new.inspection_id is distinct from old.inspection_id
     or new.schema_version_id is distinct from old.schema_version_id
     or new.section_id is distinct from old.section_id
  then
    raise exception 'Inspection content ownership is immutable after insert.'
      using errcode = '23514',
            constraint = 'inspection_content_identity_immutable';
  end if;

  if tg_table_name = 'inspection_responses' then
    if new.item_id is distinct from old.item_id then
      raise exception 'Inspection item ownership is immutable after insert.'
        using errcode = '23514',
              constraint = 'inspection_content_identity_immutable';
    end if;
  elsif tg_table_name = 'inspection_findings' then
    if new.item_id is distinct from old.item_id then
      raise exception 'Inspection item ownership is immutable after insert.'
        using errcode = '23514',
              constraint = 'inspection_content_identity_immutable';
    end if;
  end if;

  return new;
end;
$inspection_content_guard$;

drop trigger inspection_section_states_editable_trg
  on public.inspection_section_states;
create trigger inspection_section_states_editable_trg
before insert or update or delete on public.inspection_section_states
for each row
execute function public.guard_inspection_content_state();

drop trigger inspection_responses_delete_editable_trg
  on public.inspection_responses;
create trigger inspection_responses_editable_trg
before insert or update or delete on public.inspection_responses
for each row
execute function public.guard_inspection_content_state();

-- validate_inspection_response remains the type/options guard.
-- The separate content trigger protects OLD and NEW ownership.
drop trigger inspection_findings_editable_trg
  on public.inspection_findings;
create trigger inspection_findings_editable_trg
before insert or update or delete on public.inspection_findings
for each row
execute function public.guard_inspection_content_state();

-- Direct SQL must match the domain duplicate rule for multiselect.
create or replace function public.validate_inspection_response()
returns trigger
language plpgsql
as $inspection_response_guard$
declare
  inspection_status text;
  expected_type text;
  configured_options jsonb;
  value_text text;
  has_duplicate_multiselect boolean;
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
    if jsonb_typeof(new.value) <> 'array' then
      raise exception 'Inspection multiselect answer must be an array.'
        using errcode = '23514',
              constraint = 'inspection_response_type_match';
    end if;

    select count(*) <> count(distinct option_value)
      into has_duplicate_multiselect
      from jsonb_array_elements_text(new.value) as selected(option_value);

    if has_duplicate_multiselect
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
      raise exception 'Inspection multiselect answer contains invalid or duplicate values.'
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

commit;
