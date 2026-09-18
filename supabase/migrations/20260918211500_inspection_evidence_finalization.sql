begin;

create table public.inspection_evidence (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null,
  schema_version_id uuid not null,
  section_id uuid,
  item_id uuid,
  document_version_id uuid not null
    references public.document_versions(id) on delete restrict,
  evidence_type text not null,
  caption text,
  created_by_user_id uuid not null
    references public.app_users(id) on delete restrict,
  created_at timestamptz not null,

  constraint inspection_evidence_type_valid
    check (evidence_type in ('photo', 'attachment')),
  constraint inspection_evidence_caption_not_blank
    check (caption is null or btrim(caption) <> ''),
  constraint inspection_evidence_item_requires_section
    check (item_id is null or section_id is not null),
  constraint inspection_evidence_inspection_fk
    foreign key (inspection_id, schema_version_id)
    references public.inspections(id, schema_version_id)
    on delete restrict,
  constraint inspection_evidence_section_fk
    foreign key (section_id, schema_version_id)
    references public.inspection_schema_sections(id, schema_version_id)
    on delete restrict,
  constraint inspection_evidence_item_fk
    foreign key (item_id, schema_version_id, section_id)
    references public.inspection_schema_items(id, schema_version_id, section_id)
    on delete restrict
);

create index inspection_evidence_inspection_idx
  on public.inspection_evidence (inspection_id, created_at, id);

create table public.inspection_signatures (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete restrict,
  role text not null,
  signer_type text not null,
  signer_user_id uuid references public.app_users(id) on delete restrict,
  signer_party_id uuid references public.parties(id) on delete restrict,
  signer_name_snapshot text not null,
  signature_document_version_id uuid not null
    references public.document_versions(id) on delete restrict,
  status text not null default 'valid',
  signed_at timestamptz not null,
  created_by_user_id uuid not null
    references public.app_users(id) on delete restrict,
  invalidated_at timestamptz,
  invalidated_by_user_id uuid references public.app_users(id) on delete restrict,
  invalidation_reason text,

  constraint inspection_signatures_role_valid check (
    role in ('inspector', 'tenant', 'co_tenant', 'witness', 'other')
  ),
  constraint inspection_signatures_signer_type_valid
    check (signer_type in ('staff', 'party', 'external')),
  constraint inspection_signatures_name_not_blank
    check (btrim(signer_name_snapshot) <> ''),
  constraint inspection_signatures_subject_shape check (
    (signer_type = 'staff' and signer_user_id is not null and signer_party_id is null)
    or
    (signer_type = 'party' and signer_user_id is null and signer_party_id is not null)
    or
    (signer_type = 'external' and signer_user_id is null and signer_party_id is null)
  ),
  constraint inspection_signatures_role_subject_shape check (
    (role = 'inspector' and signer_type = 'staff')
    or
    (role in ('tenant', 'co_tenant') and signer_type = 'party')
    or
    role in ('witness', 'other')
  ),
  constraint inspection_signatures_status_valid
    check (status in ('valid', 'invalidated')),
  constraint inspection_signatures_state_shape check (
    (status = 'valid'
      and invalidated_at is null
      and invalidated_by_user_id is null
      and invalidation_reason is null)
    or
    (status = 'invalidated'
      and invalidated_at is not null
      and invalidated_by_user_id is not null
      and btrim(invalidation_reason) <> '')
  )
);

create unique index inspection_signatures_valid_subject_role_uq
  on public.inspection_signatures (
    inspection_id,
    role,
    signer_type,
    coalesce(signer_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(signer_party_id, '00000000-0000-0000-8000-000000000000'::uuid),
    lower(signer_name_snapshot)
  )
  where status = 'valid';

create index inspection_signatures_inspection_idx
  on public.inspection_signatures (inspection_id, signed_at, id);

create table public.inspection_unlock_events (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete restrict,
  reason text not null,
  previous_version integer not null,
  previous_content_revision integer not null,
  invalidated_signature_count integer not null,
  unlocked_by_user_id uuid not null
    references public.app_users(id) on delete restrict,
  unlocked_at timestamptz not null,

  constraint inspection_unlock_events_reason_not_blank
    check (btrim(reason) <> ''),
  constraint inspection_unlock_events_previous_version_positive
    check (previous_version >= 1),
  constraint inspection_unlock_events_previous_content_revision_nonnegative
    check (previous_content_revision >= 0),
  constraint inspection_unlock_events_invalidated_count_nonnegative
    check (invalidated_signature_count >= 0),
  constraint inspection_unlock_events_transition_uq
    unique (inspection_id, previous_version)
);

create table public.inspection_finalizations (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null unique
    references public.inspections(id) on delete restrict,
  source_version integer not null,
  source_content_revision integer not null,
  snapshot_version integer not null default 1,
  snapshot jsonb not null,
  final_report_document_version_id uuid not null unique
    references public.document_versions(id) on delete restrict,
  finalized_by_user_id uuid not null
    references public.app_users(id) on delete restrict,
  finalized_at timestamptz not null,

  constraint inspection_finalizations_source_version_positive
    check (source_version >= 1),
  constraint inspection_finalizations_source_content_revision_nonnegative
    check (source_content_revision >= 0),
  constraint inspection_finalizations_snapshot_version_one
    check (snapshot_version = 1),
  constraint inspection_finalizations_snapshot_object
    check (jsonb_typeof(snapshot) = 'object')
);

create or replace function public.validate_inspection_evidence_insert()
returns trigger
language plpgsql
as $inspection_evidence_insert$
declare
  inspection_status text;
  inspection_schema_version uuid;
  version_status text;
begin
  select status, schema_version_id
  into inspection_status, inspection_schema_version
  from public.inspections
  where id = new.inspection_id
  for update;

  if inspection_status not in ('draft', 'in_progress') then
    raise exception 'Inspection evidence may only be added before lock.'
      using errcode = '23514',
            constraint = 'inspection_evidence_content_locked';
  end if;

  if new.schema_version_id <> inspection_schema_version then
    raise exception 'Inspection evidence schema version mismatch.'
      using errcode = '23514',
            constraint = 'inspection_evidence_schema_mismatch';
  end if;

  select status into version_status
  from public.document_versions
  where id = new.document_version_id;

  if version_status <> 'final' then
    raise exception 'Inspection evidence requires a final document version.'
      using errcode = '23514',
            constraint = 'inspection_evidence_document_final';
  end if;

  update public.inspections
  set content_revision = content_revision + 1,
      updated_at = now()
  where id = new.inspection_id;

  return new;
end;
$inspection_evidence_insert$;

create trigger inspection_evidence_validate_trg
before insert on public.inspection_evidence
for each row
execute function public.validate_inspection_evidence_insert();

create or replace function public.protect_inspection_evidence()
returns trigger
language plpgsql
as $inspection_evidence_immutable$
begin
  raise exception 'Inspection evidence links are append-only.'
    using errcode = '23514',
          constraint = 'inspection_evidence_immutable';
end;
$inspection_evidence_immutable$;

create trigger inspection_evidence_immutable_trg
before update or delete on public.inspection_evidence
for each row
execute function public.protect_inspection_evidence();

create or replace function public.validate_inspection_signature_insert()
returns trigger
language plpgsql
as $inspection_signature_insert$
declare
  inspection_status text;
  inspection_assignee uuid;
  inspection_tenancy uuid;
  version_status text;
begin
  select status, assigned_to_user_id, tenancy_id
  into inspection_status, inspection_assignee, inspection_tenancy
  from public.inspections
  where id = new.inspection_id
  for update;

  if inspection_status <> 'locked' then
    raise exception 'Inspection must be locked before signing.'
      using errcode = '23514',
            constraint = 'inspection_signature_requires_lock';
  end if;

  select status into version_status
  from public.document_versions
  where id = new.signature_document_version_id;

  if version_status <> 'final' then
    raise exception 'Inspection signature requires a final document version.'
      using errcode = '23514',
            constraint = 'inspection_signature_document_final';
  end if;

  if new.role = 'inspector' and new.signer_user_id <> inspection_assignee then
    raise exception 'Inspector signature must belong to the assigned user.'
      using errcode = '23514',
            constraint = 'inspection_signature_inspector_mismatch';
  end if;

  if new.role in ('tenant', 'co_tenant') then
    if inspection_tenancy is null or not exists (
      select 1
      from public.tenancy_parties tp
      where tp.tenancy_id = inspection_tenancy
        and tp.party_id = new.signer_party_id
        and tp.role = new.role
    ) then
      raise exception 'Tenant signature must match tenancy party composition.'
        using errcode = '23514',
              constraint = 'inspection_signature_tenancy_party_mismatch';
    end if;
  end if;

  update public.inspections
  set content_revision = content_revision + 1,
      updated_at = now()
  where id = new.inspection_id;

  return new;
end;
$inspection_signature_insert$;

create trigger inspection_signatures_validate_insert_trg
before insert on public.inspection_signatures
for each row
execute function public.validate_inspection_signature_insert();

create or replace function public.protect_inspection_signature()
returns trigger
language plpgsql
as $inspection_signature_guard$
begin
  if tg_op = 'DELETE' then
    raise exception 'Inspection signatures are historical evidence and cannot be deleted.'
      using errcode = '23514',
            constraint = 'inspection_signature_immutable';
  end if;

  if
    new.inspection_id is distinct from old.inspection_id
    or new.role is distinct from old.role
    or new.signer_type is distinct from old.signer_type
    or new.signer_user_id is distinct from old.signer_user_id
    or new.signer_party_id is distinct from old.signer_party_id
    or new.signer_name_snapshot is distinct from old.signer_name_snapshot
    or new.signature_document_version_id is distinct from old.signature_document_version_id
    or new.signed_at is distinct from old.signed_at
    or new.created_by_user_id is distinct from old.created_by_user_id
  then
    raise exception 'Inspection signature identity/content is immutable.'
      using errcode = '23514',
            constraint = 'inspection_signature_immutable';
  end if;

  if old.status = 'valid'
     and new.status = 'invalidated'
     and old.invalidated_at is null
     and new.invalidated_at is not null
     and new.invalidated_by_user_id is not null
     and btrim(new.invalidation_reason) <> ''
  then
    return new;
  end if;

  raise exception 'Only valid-to-invalidated signature transition is allowed.'
    using errcode = '23514',
          constraint = 'inspection_signature_transition_invalid';
end;
$inspection_signature_guard$;

create trigger inspection_signatures_immutable_trg
before update or delete on public.inspection_signatures
for each row
execute function public.protect_inspection_signature();

create or replace function public.protect_inspection_unlock_event()
returns trigger
language plpgsql
as $inspection_unlock_event_guard$
begin
  raise exception 'Inspection unlock events are append-only.'
    using errcode = '23514',
          constraint = 'inspection_unlock_event_immutable';
end;
$inspection_unlock_event_guard$;

create trigger inspection_unlock_events_immutable_trg
before update or delete on public.inspection_unlock_events
for each row
execute function public.protect_inspection_unlock_event();

create or replace function public.validate_inspection_finalization_insert()
returns trigger
language plpgsql
as $inspection_finalization_insert$
declare
  current_status text;
  current_version integer;
  current_content_revision integer;
  assignee uuid;
  report_status text;
  report_mime_type text;
begin
  select status, version, content_revision, assigned_to_user_id
  into current_status, current_version, current_content_revision, assignee
  from public.inspections
  where id = new.inspection_id
  for update;

  if current_status <> 'locked'
     or current_version <> new.source_version
     or current_content_revision <> new.source_content_revision
  then
    raise exception 'Inspection finalization source changed.'
      using errcode = '23514',
            constraint = 'inspection_finalization_source_mismatch';
  end if;

  if not exists (
    select 1
    from public.inspection_signatures s
    where s.inspection_id = new.inspection_id
      and s.status = 'valid'
      and s.role = 'inspector'
      and s.signer_type = 'staff'
      and s.signer_user_id = assignee
  ) then
    raise exception 'Finalization requires the assigned inspector signature.'
      using errcode = '23514',
            constraint = 'inspection_finalization_inspector_signature_required';
  end if;

  select status, mime_type
  into report_status, report_mime_type
  from public.document_versions
  where id = new.final_report_document_version_id;

  if report_status <> 'final' or report_mime_type <> 'application/pdf' then
    raise exception 'Final report must be an immutable final PDF document version.'
      using errcode = '23514',
            constraint = 'inspection_finalization_report_invalid';
  end if;

  return new;
end;
$inspection_finalization_insert$;

create trigger inspection_finalizations_validate_trg
before insert on public.inspection_finalizations
for each row
execute function public.validate_inspection_finalization_insert();

create or replace function public.protect_inspection_finalization()
returns trigger
language plpgsql
as $inspection_finalization_guard$
begin
  raise exception 'Inspection finalization snapshot is immutable.'
    using errcode = '23514',
          constraint = 'inspection_finalization_immutable';
end;
$inspection_finalization_guard$;

create trigger inspection_finalizations_immutable_trg
before update or delete on public.inspection_finalizations
for each row
execute function public.protect_inspection_finalization();

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

  if old.status = 'locked' and new.status = 'in_progress' then
    if new.locked_at is not null or exists (
      select 1
      from public.inspection_signatures s
      where s.inspection_id = old.id
        and s.status = 'valid'
    ) or not exists (
      select 1
      from public.inspection_unlock_events e
      where e.inspection_id = old.id
        and e.previous_version = old.version
        and e.previous_content_revision = old.content_revision
    ) then
      raise exception 'Unlock requires an audit event and signature invalidation.'
        using errcode = '23514',
              constraint = 'inspection_unlock_not_authorized';
    end if;
    return new;
  end if;

  if old.status = 'locked' and new.status = 'finalized' then
    if new.finalized_at is null or new.locked_at is null or not exists (
      select 1
      from public.inspection_finalizations f
      where f.inspection_id = old.id
        and f.source_version = old.version
        and f.source_content_revision = old.content_revision
        and f.finalized_at = new.finalized_at
    ) then
      raise exception 'Finalization requires an immutable matching snapshot.'
        using errcode = '23514',
              constraint = 'inspection_finalization_required';
    end if;
    return new;
  end if;

  raise exception 'Invalid inspection lifecycle transition.'
    using errcode = '23514',
          constraint = 'inspection_lifecycle_transition_invalid';
end;
$inspection_header_guard$;

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
    (status = 'finalized'
      and started_at is not null and locked_at is not null
      and finalized_at is not null and cancelled_at is null)
    or
    (status = 'cancelled'
      and locked_at is null and finalized_at is null
      and cancelled_at is not null)
  );

alter table public.inspection_evidence enable row level security;
alter table public.inspection_signatures enable row level security;
alter table public.inspection_unlock_events enable row level security;
alter table public.inspection_finalizations enable row level security;

comment on table public.inspection_evidence is
  'Append-only exact DocumentVersion evidence linked to one Inspection/schema context.';
comment on table public.inspection_signatures is
  'Historical signature attestations. Unlock invalidates rather than deletes signatures.';
comment on table public.inspection_unlock_events is
  'Append-only audit trail for controlled locked-to-in_progress transitions.';
comment on table public.inspection_finalizations is
  'One immutable final snapshot and exact final PDF DocumentVersion per Inspection.';

commit;
