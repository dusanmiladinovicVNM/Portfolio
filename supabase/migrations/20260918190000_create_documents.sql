begin;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  title text not null,
  category text not null,
  status text not null default 'active',
  latest_version_number integer not null default 0,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint documents_code_not_blank check (btrim(code) <> ''),
  constraint documents_title_not_blank check (btrim(title) <> ''),
  constraint documents_category_valid check (
    category in (
      'legal', 'financial', 'technical', 'inspection',
      'identity', 'correspondence', 'photo', 'other'
    )
  ),
  constraint documents_status_valid check (status in ('active', 'archived')),
  constraint documents_latest_version_nonnegative check (latest_version_number >= 0),
  constraint documents_revision_positive check (revision >= 1)
);

create unique index documents_code_uq
  on public.documents (lower(code));

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  version_number integer not null,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  sha256 char(64) not null,
  status text not null default 'stored',
  finalized_at timestamptz,
  storage_provider text not null,
  storage_object_id text not null,
  storage_object_key text not null,
  created_at timestamptz not null default now(),

  constraint document_versions_number_positive check (version_number >= 1),
  constraint document_versions_file_name_not_blank check (btrim(file_name) <> ''),
  constraint document_versions_mime_type_not_blank check (btrim(mime_type) <> ''),
  constraint document_versions_byte_size_positive check (byte_size > 0),
  constraint document_versions_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint document_versions_status_valid check (status in ('stored', 'final')),
  constraint document_versions_state_shape check (
    (status = 'stored' and finalized_at is null)
    or
    (status = 'final' and finalized_at is not null)
  ),
  constraint document_versions_storage_provider_not_blank check (btrim(storage_provider) <> ''),
  constraint document_versions_storage_object_id_not_blank check (btrim(storage_object_id) <> ''),
  constraint document_versions_storage_object_key_not_blank check (btrim(storage_object_key) <> ''),
  constraint document_versions_document_number_uq unique (document_id, version_number),
  constraint document_versions_id_document_uq unique (id, document_id),
  constraint document_versions_provider_object_uq unique (storage_provider, storage_object_id),
  constraint document_versions_provider_key_uq unique (storage_provider, storage_object_key)
);

create index document_versions_document_id_idx
  on public.document_versions (document_id, version_number);

create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  document_version_id uuid,
  relation text not null,
  target_type text not null,
  property_id uuid references public.properties(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  party_id uuid references public.parties(id) on delete restrict,
  tenancy_id uuid references public.tenancies(id) on delete restrict,
  lease_agreement_id uuid references public.lease_agreements(id) on delete restrict,
  lease_amendment_id uuid references public.lease_amendments(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint document_links_relation_valid check (
    relation in ('primary', 'signed_original', 'supporting', 'attachment', 'other')
  ),
  constraint document_links_target_type_valid check (
    target_type in (
      'property', 'unit', 'party', 'tenancy',
      'lease_agreement', 'lease_amendment'
    )
  ),
  constraint document_links_exactly_one_target check (
    num_nonnulls(
      property_id, unit_id, party_id, tenancy_id,
      lease_agreement_id, lease_amendment_id
    ) = 1
  ),
  constraint document_links_target_shape check (
    (target_type = 'property' and property_id is not null)
    or (target_type = 'unit' and unit_id is not null)
    or (target_type = 'party' and party_id is not null)
    or (target_type = 'tenancy' and tenancy_id is not null)
    or (target_type = 'lease_agreement' and lease_agreement_id is not null)
    or (target_type = 'lease_amendment' and lease_amendment_id is not null)
  ),
  constraint document_links_signed_original_shape check (
    relation <> 'signed_original'
    or (
      document_version_id is not null
      and target_type in ('lease_agreement', 'lease_amendment')
    )
  ),
  constraint document_links_version_document_fk
    foreign key (document_version_id, document_id)
    references public.document_versions(id, document_id)
    on delete restrict
);

create unique index document_links_identity_uq
  on public.document_links (
    document_id,
    coalesce(document_version_id, '00000000-0000-0000-0000-000000000000'::uuid),
    target_type,
    coalesce(
      property_id,
      unit_id,
      party_id,
      tenancy_id,
      lease_agreement_id,
      lease_amendment_id
    ),
    relation
  );

create unique index document_links_signed_agreement_uq
  on public.document_links (lease_agreement_id)
  where relation = 'signed_original';

create unique index document_links_signed_amendment_uq
  on public.document_links (lease_amendment_id)
  where relation = 'signed_original';

create or replace function public.protect_document_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Document versions are append-only.'
      using errcode = '23514',
            constraint = 'document_versions_append_only';
  end if;

  if
    new.document_id is distinct from old.document_id
    or new.version_number is distinct from old.version_number
    or new.file_name is distinct from old.file_name
    or new.mime_type is distinct from old.mime_type
    or new.byte_size is distinct from old.byte_size
    or new.sha256 is distinct from old.sha256
    or new.storage_provider is distinct from old.storage_provider
    or new.storage_object_id is distinct from old.storage_object_id
    or new.storage_object_key is distinct from old.storage_object_key
  then
    raise exception 'Document version content and storage identity are immutable.'
      using errcode = '23514',
            constraint = 'document_versions_content_immutable';
  end if;

  if old.status = 'final' then
    raise exception 'Final document versions are immutable.'
      using errcode = '23514',
            constraint = 'document_versions_final_immutable';
  end if;

  if not (
    old.status = 'stored'
    and old.finalized_at is null
    and new.status = 'final'
    and new.finalized_at is not null
  ) then
    raise exception 'Only stored-to-final transition is allowed.'
      using errcode = '23514',
            constraint = 'document_versions_transition_invalid';
  end if;

  return new;
end;
$$;

create trigger document_versions_immutable_trg
before update or delete on public.document_versions
for each row
execute function public.protect_document_version();

create or replace function public.validate_signed_original_document_link()
returns trigger
language plpgsql
as $$
declare
  version_status text;
  agreement_status text;
  amendment_status text;
begin
  if new.relation <> 'signed_original' then
    return new;
  end if;

  select status
  into version_status
  from public.document_versions
  where id = new.document_version_id
    and document_id = new.document_id;

  if version_status <> 'final' then
    raise exception 'signed_original requires a final document version.'
      using errcode = '23514',
            constraint = 'document_links_signed_original_version_final';
  end if;

  if new.target_type = 'lease_agreement' then
    select status
    into agreement_status
    from public.lease_agreements
    where id = new.lease_agreement_id;

    if agreement_status not in ('signed', 'superseded', 'terminated') then
      raise exception 'signed_original requires a signed lease agreement.'
        using errcode = '23514',
              constraint = 'document_links_signed_original_agreement_signed';
    end if;
  elsif new.target_type = 'lease_amendment' then
    select status
    into amendment_status
    from public.lease_amendments
    where id = new.lease_amendment_id;

    if amendment_status <> 'signed' then
      raise exception 'signed_original requires a signed lease amendment.'
        using errcode = '23514',
              constraint = 'document_links_signed_original_amendment_signed';
    end if;
  end if;

  return new;
end;
$$;

create trigger document_links_signed_original_valid_trg
before insert or update on public.document_links
for each row
execute function public.validate_signed_original_document_link();

create or replace function public.prevent_signed_original_document_link_mutation()
returns trigger
language plpgsql
as $document_link_guard$
begin
  if tg_op = 'DELETE' then
    if old.relation = 'signed_original' then
      raise exception 'signed_original document links are immutable.'
        using errcode = '23514',
              constraint = 'document_links_signed_original_immutable';
    end if;
    return old;
  end if;

  if old.relation = 'signed_original' or new.relation = 'signed_original' then
    raise exception 'signed_original document links are immutable.'
      using errcode = '23514',
            constraint = 'document_links_signed_original_immutable';
  end if;

  return new;
end;
$document_link_guard$;

create trigger document_links_signed_original_immutable_trg
before update or delete on public.document_links
for each row
execute function public.prevent_signed_original_document_link_mutation();

alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_links enable row level security;

comment on table public.documents is
  'Business document dossier. Binary storage provider identity is not the document identity.';
comment on table public.document_versions is
  'Immutable binary content metadata. Final versions represent preserved evidence.';
comment on column public.document_versions.storage_object_id is
  'Opaque infrastructure locator, never a Portfolio business primary key.';
comment on table public.document_links is
  'Links a document, optionally one exact version, to a DB-enforced domain target.';

commit;
