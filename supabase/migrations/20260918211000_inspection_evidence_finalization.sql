begin;

create or replace function public.text_array_is_unique(items text[])
returns boolean
language sql
immutable
strict
as 'select cardinality(items) = count(distinct item) from unnest(items) as item';

alter table public.inspection_schema_versions
  add column required_signature_roles text[] not null default '{}'::text[];

alter table public.inspection_schema_versions
  add constraint inspection_schema_signature_roles_valid check (
    required_signature_roles <@ array['landlord','tenant','witness','agent']::text[]
    and public.text_array_is_unique(required_signature_roles)
  );

-- Rows that predate signature policy keep the historically accurate empty
-- policy supplied by the ADD COLUMN default. Future rows must state the policy
-- explicitly, including an explicit empty array when no signatures are required.
alter table public.inspection_schema_versions
  alter column required_signature_roles drop default;

alter table public.documents
  drop constraint documents_category_valid;

alter table public.documents
  add constraint documents_category_valid check (
    category in (
      'legal', 'financial', 'technical', 'inspection',
      'identity', 'correspondence', 'photo', 'signature', 'other'
    )
  );

create table public.inspection_evidence (
  id uuid primary key,
  inspection_id uuid not null,
  schema_version_id uuid not null,
  section_id uuid,
  item_id uuid,
  document_version_id uuid not null
    references public.document_versions(id) on delete restrict,
  kind text not null,
  caption text,
  created_by_user_id uuid not null
    references public.app_users(id) on delete restrict,
  created_at timestamptz not null,

  constraint inspection_evidence_kind_valid
    check (kind in ('photo', 'attachment', 'final_report')),
  constraint inspection_evidence_caption_not_blank
    check (caption is null or btrim(caption) <> ''),
  constraint inspection_evidence_item_requires_section
    check (item_id is null or section_id is not null),
  constraint inspection_final_report_scope
    check (
      kind <> 'final_report'
      or (section_id is null and item_id is null)
    ),
  constraint inspection_evidence_inspection_schema_fk
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

create unique index inspection_evidence_identity_uq
  on public.inspection_evidence (
    inspection_id,
    document_version_id,
    coalesce(section_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind
  );

create unique index inspection_final_report_uq
  on public.inspection_evidence (inspection_id)
  where kind = 'final_report';

create table public.inspection_signatures (
  id uuid primary key,
  inspection_id uuid not null references public.inspections(id) on delete restrict,
  signer_role text not null,
  signer_party_id uuid references public.parties(id) on delete restrict,
  signer_name text not null,
  signature_document_version_id uuid not null
    references public.document_versions(id) on delete restrict,
  signed_by_user_id uuid not null
    references public.app_users(id) on delete restrict,
  signed_at timestamptz not null,
  invalidated_at timestamptz,
  invalidation_reason text,

  constraint inspection_signatures_role_valid
    check (signer_role in ('landlord','tenant','witness','agent')),
  constraint inspection_signatures_name_not_blank
    check (btrim(signer_name) <> ''),
  constraint inspection_signatures_invalidation_shape check (
    (invalidated_at is null and invalidation_reason is null)
    or
    (invalidated_at is not null and btrim(invalidation_reason) <> '')
  )
);

create unique index inspection_active_signature_role_uq
  on public.inspection_signatures (inspection_id, signer_role)
  where invalidated_at is null;

create table public.inspection_unlocks (
  id uuid primary key,
  inspection_id uuid not null references public.inspections(id) on delete restrict,
  unlocked_by_user_id uuid not null references public.app_users(id) on delete restrict,
  unlocked_at timestamptz not null,
  reason text not null,
  previous_locked_at timestamptz not null,
  previous_version integer not null,
  previous_content_revision integer not null,
  new_version integer not null,
  new_content_revision integer not null,

  constraint inspection_unlock_reason_not_blank check (btrim(reason) <> ''),
  constraint inspection_unlock_version_step check (new_version = previous_version + 1),
  constraint inspection_unlock_content_step
    check (new_content_revision = previous_content_revision + 1),
  constraint inspection_unlock_identity_uq
    unique (inspection_id, new_version, new_content_revision)
);

create table public.inspection_final_snapshots (
  id uuid primary key,
  inspection_id uuid not null references public.inspections(id) on delete restrict,
  snapshot_version integer not null,
  inspection_version integer not null,
  content_revision integer not null,
  payload jsonb not null,
  created_by_user_id uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null,

  constraint inspection_final_snapshots_version_one check (snapshot_version = 1),
  constraint inspection_final_snapshots_payload_object
    check (jsonb_typeof(payload) = 'object'),
  constraint inspection_final_snapshots_inspection_uq unique (inspection_id)
);

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
         or new.required_signature_roles is distinct from old.required_signature_roles
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

create or replace function public.guard_inspection_evidence()
returns trigger
language plpgsql
as $inspection_evidence_guard$
declare
  inspection_status text;
  version_status text;
  document_category text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Inspection evidence rows are immutable.'
      using errcode = '23514',
            constraint = 'inspection_evidence_immutable';
  end if;

  select status into inspection_status
  from public.inspections
  where id = new.inspection_id;

  if new.kind = 'final_report' then
    if inspection_status <> 'finalized' then
      raise exception 'Final report evidence requires a finalized inspection.'
        using errcode = '23514',
              constraint = 'inspection_final_report_requires_finalized';
    end if;

    select dv.status, d.category
      into version_status, document_category
    from public.document_versions dv
    join public.documents d on d.id = dv.document_id
    where dv.id = new.document_version_id;

    if version_status <> 'final' then
      raise exception 'Final report evidence requires a final document version.'
        using errcode = '23514',
              constraint = 'inspection_final_report_document_not_final';
    end if;

    if document_category <> 'inspection' then
      raise exception 'Final report evidence requires an inspection document.'
        using errcode = '23514',
              constraint = 'inspection_final_report_document_category_invalid';
    end if;
  elsif inspection_status not in ('draft','in_progress') then
    raise exception 'Inspection evidence can only be attached before lock.'
      using errcode = '23514',
            constraint = 'inspection_evidence_state_invalid';
  end if;

  return new;
end;
$inspection_evidence_guard$;

create trigger inspection_evidence_guard_trg
before insert or update or delete on public.inspection_evidence
for each row execute function public.guard_inspection_evidence();

create or replace function public.guard_inspection_signature()
returns trigger
language plpgsql
as $inspection_signature_guard$
declare
  inspection_status text;
  inspection_tenancy_id uuid;
  inspection_unit_id uuid;
  inspection_locked_date date;
  version_status text;
  document_category text;
begin
  if tg_op = 'INSERT' then
    select
      status,
      tenancy_id,
      unit_id,
      (locked_at at time zone 'UTC')::date
    into
      inspection_status,
      inspection_tenancy_id,
      inspection_unit_id,
      inspection_locked_date
    from public.inspections
    where id = new.inspection_id;

    if inspection_status <> 'locked' then
      raise exception 'Inspection signatures require a locked inspection.'
        using errcode = '23514',
              constraint = 'inspection_signature_state_invalid';
    end if;

    select dv.status, d.category
      into version_status, document_category
    from public.document_versions dv
    join public.documents d on d.id = dv.document_id
    where dv.id = new.signature_document_version_id;

    if version_status <> 'final' then
      raise exception 'Inspection signature requires a final document version.'
        using errcode = '23514',
              constraint = 'inspection_signature_document_not_final';
    end if;

    if document_category <> 'signature' then
      raise exception 'Inspection signature requires a signature document.'
        using errcode = '23514',
              constraint = 'inspection_signature_document_category_invalid';
    end if;

    if new.signer_role in ('landlord', 'tenant')
       and new.signer_party_id is null
    then
      raise exception 'Landlord/tenant signatures require a signer Party.'
        using errcode = '23514',
              constraint = 'inspection_signature_party_required';
    end if;

    if new.signer_role = 'tenant' and not exists (
      select 1
      from public.tenancy_parties tp
      where tp.tenancy_id = inspection_tenancy_id
        and tp.party_id = new.signer_party_id
        and tp.role in ('tenant', 'co_tenant')
    ) then
      raise exception 'Tenant signature Party must belong to the inspection tenancy.'
        using errcode = '23514',
              constraint = 'inspection_signature_tenant_party_mismatch';
    end if;

    if new.signer_role = 'landlord' and not exists (
      select 1
      from public.unit_ownership_periods op
      join public.unit_ownership_shares os
        on os.ownership_period_id = op.id
      where op.unit_id = inspection_unit_id
        and op.valid_from <= inspection_locked_date
        and (op.valid_to is null or op.valid_to >= inspection_locked_date)
        and os.party_id = new.signer_party_id
    ) then
      raise exception 'Landlord signature Party must own the unit on the inspection lock date.'
        using errcode = '23514',
              constraint = 'inspection_signature_landlord_party_mismatch';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Inspection signatures are append-only.'
      using errcode = '23514',
            constraint = 'inspection_signature_immutable';
  end if;

  if new.inspection_id is distinct from old.inspection_id
     or new.signer_role is distinct from old.signer_role
     or new.signer_party_id is distinct from old.signer_party_id
     or new.signer_name is distinct from old.signer_name
     or new.signature_document_version_id is distinct from old.signature_document_version_id
     or new.signed_by_user_id is distinct from old.signed_by_user_id
     or new.signed_at is distinct from old.signed_at
  then
    raise exception 'Inspection signature identity is immutable.'
      using errcode = '23514',
            constraint = 'inspection_signature_immutable';
  end if;

  if old.invalidated_at is not null then
    raise exception 'Invalidated inspection signatures are immutable.'
      using errcode = '23514',
            constraint = 'inspection_signature_immutable';
  end if;

  if new.invalidated_at is null or new.invalidation_reason is null then
    raise exception 'Signature update may only invalidate the signature.'
      using errcode = '23514',
            constraint = 'inspection_signature_invalidation_invalid';
  end if;

  return new;
end;
$inspection_signature_guard$;

create trigger inspection_signature_guard_trg
before insert or update or delete on public.inspection_signatures
for each row execute function public.guard_inspection_signature();

create or replace function public.guard_inspection_unlock()
returns trigger
language plpgsql
as $inspection_unlock_guard$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Inspection unlock records are append-only.'
      using errcode = '23514',
            constraint = 'inspection_unlock_immutable';
  end if;
  return new;
end;
$inspection_unlock_guard$;

create trigger inspection_unlock_guard_trg
before update or delete on public.inspection_unlocks
for each row execute function public.guard_inspection_unlock();

create or replace function public.guard_inspection_final_snapshot()
returns trigger
language plpgsql
as $inspection_snapshot_guard$
declare
  inspection_status text;
  inspection_version_now integer;
  content_revision_now integer;
  schema_id uuid;
  missing_roles text[];
begin
  if tg_op <> 'INSERT' then
    raise exception 'Inspection final snapshots are append-only.'
      using errcode = '23514',
            constraint = 'inspection_final_snapshot_immutable';
  end if;

  select status, version, content_revision, schema_version_id
    into inspection_status, inspection_version_now, content_revision_now, schema_id
  from public.inspections
  where id = new.inspection_id;

  if inspection_status <> 'locked' then
    raise exception 'Final snapshot requires a locked inspection.'
      using errcode = '23514',
            constraint = 'inspection_final_snapshot_state_invalid';
  end if;

  if new.inspection_version <> inspection_version_now
     or new.content_revision <> content_revision_now
  then
    raise exception 'Final snapshot must match current inspection revisions.'
      using errcode = '23514',
            constraint = 'inspection_final_snapshot_revision_mismatch';
  end if;

  select array_agg(required_role)
    into missing_roles
  from (
    select unnest(required_signature_roles) as required_role
    from public.inspection_schema_versions
    where id = schema_id
  ) required
  where not exists (
    select 1
    from public.inspection_signatures s
    where s.inspection_id = new.inspection_id
      and s.signer_role = required.required_role
      and s.invalidated_at is null
  );

  if cardinality(coalesce(missing_roles, '{}'::text[])) > 0 then
    raise exception 'Required inspection signatures are missing.'
      using errcode = '23514',
            constraint = 'inspection_final_snapshot_signatures_missing';
  end if;

  return new;
end;
$inspection_snapshot_guard$;

create trigger inspection_final_snapshot_guard_trg
before insert or update or delete on public.inspection_final_snapshots
for each row execute function public.guard_inspection_final_snapshot();

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
    if new.locked_at is not null
       or new.version <> old.version + 1
       or new.content_revision <> old.content_revision + 1
       or not exists (
         select 1
         from public.inspection_unlocks u
         where u.inspection_id = old.id
           and u.previous_version = old.version
           and u.previous_content_revision = old.content_revision
           and u.new_version = new.version
           and u.new_content_revision = new.content_revision
       )
    then
      raise exception 'Unlock requires a matching append-only unlock record.'
        using errcode = '23514',
              constraint = 'inspection_unlock_record_required';
    end if;

    if exists (
      select 1
      from public.inspection_signatures s
      where s.inspection_id = old.id
        and s.invalidated_at is null
    ) then
      raise exception 'Unlock requires every active signature to be invalidated first.'
        using errcode = '23514',
              constraint = 'inspection_unlock_active_signatures';
    end if;

    return new;
  end if;

  if old.status = 'locked' and new.status = 'finalized' then
    if new.finalized_at is null
       or new.version <> old.version + 1
       or not exists (
         select 1
         from public.inspection_final_snapshots s
         where s.inspection_id = old.id
           and s.inspection_version = old.version
           and s.content_revision = old.content_revision
       )
    then
      raise exception 'Finalization requires a matching immutable final snapshot.'
        using errcode = '23514',
              constraint = 'inspection_final_snapshot_required';
    end if;
    return new;
  end if;

  raise exception 'Invalid inspection lifecycle transition.'
    using errcode = '23514',
          constraint = 'inspection_lifecycle_transition_invalid';
end;
$inspection_header_guard$;

alter table public.inspections drop constraint inspections_state_shape;

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
alter table public.inspection_unlocks enable row level security;
alter table public.inspection_final_snapshots enable row level security;

comment on table public.inspection_evidence is
  'Exact DocumentVersion evidence attached at inspection/section/item grain. final_report is a derived projection of the immutable final snapshot.';
comment on table public.inspection_signatures is
  'Append-only signature evidence. Unlock invalidates active signatures rather than rewriting or deleting them.';
comment on table public.inspection_final_snapshots is
  'One immutable authoritative snapshot consumed by final report rendering.';
comment on table public.inspection_unlocks is
  'Append-only administrative audit for controlled locked-to-in_progress transitions.';

commit;
