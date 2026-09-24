begin;

create table public.document_version_storage_relocations (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null
    references public.document_versions(id) on delete restrict,
  generation integer not null,
  previous_storage_provider text not null,
  previous_storage_object_id text not null,
  previous_storage_object_key text not null,
  storage_provider text not null,
  storage_object_id text not null,
  storage_object_key text not null,
  reason text not null,
  created_at timestamptz not null default now(),

  constraint document_storage_relocation_generation_positive
    check (generation >= 1),
  constraint document_storage_relocation_previous_provider_not_blank
    check (btrim(previous_storage_provider) <> ''),
  constraint document_storage_relocation_previous_object_id_not_blank
    check (btrim(previous_storage_object_id) <> ''),
  constraint document_storage_relocation_previous_object_key_not_blank
    check (btrim(previous_storage_object_key) <> ''),
  constraint document_storage_relocation_provider_not_blank
    check (btrim(storage_provider) <> ''),
  constraint document_storage_relocation_object_id_not_blank
    check (btrim(storage_object_id) <> ''),
  constraint document_storage_relocation_object_key_not_blank
    check (btrim(storage_object_key) <> ''),
  constraint document_storage_relocation_reason_not_blank
    check (btrim(reason) <> ''),
  constraint document_storage_relocation_object_key_stable
    check (storage_object_key = previous_storage_object_key),
  constraint document_storage_relocation_changes_locator
    check (
      (storage_provider, storage_object_id, storage_object_key)
      <> (
        previous_storage_provider,
        previous_storage_object_id,
        previous_storage_object_key
      )
    ),
  constraint document_storage_relocation_generation_uq
    unique (document_version_id, generation),
  constraint document_storage_relocation_provider_object_uq
    unique (storage_provider, storage_object_id),
  constraint document_storage_relocation_provider_key_uq
    unique (storage_provider, storage_object_key)
);

create index document_storage_relocation_version_idx
  on public.document_version_storage_relocations (
    document_version_id,
    generation desc
  );

create or replace function public.validate_document_storage_relocation()
returns trigger
language plpgsql
as $document_storage_relocation$
declare
  current_generation integer := 0;
  current_provider text;
  current_object_id text;
  current_object_key text;
begin
  select
    r.generation,
    r.storage_provider,
    r.storage_object_id,
    r.storage_object_key
  into
    current_generation,
    current_provider,
    current_object_id,
    current_object_key
  from public.document_version_storage_relocations r
  where r.document_version_id = new.document_version_id
  order by r.generation desc
  limit 1;

  if current_provider is null then
    select
      v.storage_provider,
      v.storage_object_id,
      v.storage_object_key
    into
      current_provider,
      current_object_id,
      current_object_key
    from public.document_versions v
    where v.id = new.document_version_id
    for update;

    if current_provider is null then
      raise exception 'DocumentVersion does not exist.'
        using errcode = '23503',
              constraint = 'document_storage_relocation_version_missing';
    end if;
  end if;

  if new.generation <> current_generation + 1 then
    raise exception 'Storage relocation generation must continue the current chain.'
      using errcode = '23514',
            constraint = 'document_storage_relocation_generation_chain';
  end if;

  if (
    new.previous_storage_provider,
    new.previous_storage_object_id,
    new.previous_storage_object_key
  ) is distinct from (
    current_provider,
    current_object_id,
    current_object_key
  ) then
    raise exception 'Storage relocation previous locator does not match the current locator.'
      using errcode = '23514',
            constraint = 'document_storage_relocation_previous_mismatch';
  end if;

  if new.storage_object_key is distinct from current_object_key then
    raise exception 'Storage relocation must preserve the stable Portfolio object key.'
      using errcode = '23514',
            constraint = 'document_storage_relocation_object_key_changed';
  end if;

  return new;
end;
$document_storage_relocation$;

create trigger document_storage_relocation_chain_trg
before insert on public.document_version_storage_relocations
for each row
execute function public.validate_document_storage_relocation();

create or replace function public.protect_document_storage_relocation()
returns trigger
language plpgsql
as $document_storage_relocation_immutable$
begin
  raise exception 'Document storage relocation history is append-only.'
    using errcode = '23514',
          constraint = 'document_storage_relocation_append_only';
end;
$document_storage_relocation_immutable$;

create trigger document_storage_relocation_immutable_trg
before update or delete on public.document_version_storage_relocations
for each row
execute function public.protect_document_storage_relocation();

alter table public.document_version_storage_relocations
  enable row level security;

comment on table public.document_version_storage_relocations is
  'Append-only infrastructure locator history for immutable DocumentVersion bytes. DocumentVersion identity/hash never changes when a provider object is recovered or relocated.';

comment on column public.document_version_storage_relocations.storage_object_id is
  'Replacement opaque provider locator. Never a Portfolio business identity.';

commit;
