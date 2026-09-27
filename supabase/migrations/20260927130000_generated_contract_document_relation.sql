begin;

alter table public.document_links
  drop constraint document_links_relation_valid;

alter table public.document_links
  add constraint document_links_relation_valid check (
    relation in (
      'primary',
      'signed_original',
      'generated_contract',
      'supporting',
      'attachment',
      'other'
    )
  );

alter table public.document_links
  add constraint document_links_generated_contract_shape check (
    relation <> 'generated_contract'
    or (
      document_version_id is not null
      and target_type = 'lease_agreement'
      and lease_agreement_id is not null
    )
  );

create unique index document_links_generated_agreement_uq
  on public.document_links (lease_agreement_id)
  where relation = 'generated_contract';

create or replace function public.validate_generated_contract_document_link()
returns trigger
language plpgsql
as $generated_contract_validation$
declare
  version_status text;
  agreement_status text;
begin
  if new.relation <> 'generated_contract' then
    return new;
  end if;

  select status
  into version_status
  from public.document_versions
  where id = new.document_version_id
    and document_id = new.document_id;

  if version_status <> 'final' then
    raise exception 'generated_contract requires a final document version.'
      using errcode = '23514',
            constraint = 'document_links_generated_contract_version_final';
  end if;

  select status
  into agreement_status
  from public.lease_agreements
  where id = new.lease_agreement_id;

  if agreement_status not in ('signed', 'superseded', 'terminated') then
    raise exception 'generated_contract requires a signed lease agreement.'
      using errcode = '23514',
            constraint = 'document_links_generated_contract_agreement_signed';
  end if;

  return new;
end;
$generated_contract_validation$;

create trigger document_links_generated_contract_valid_trg
before insert or update on public.document_links
for each row
execute function public.validate_generated_contract_document_link();

create or replace function public.prevent_generated_contract_document_link_mutation()
returns trigger
language plpgsql
as $generated_contract_immutable$
begin
  if tg_op = 'DELETE' then
    if old.relation = 'generated_contract' then
      raise exception 'generated_contract document links are immutable.'
        using errcode = '23514',
              constraint = 'document_links_generated_contract_immutable';
    end if;
    return old;
  end if;

  if old.relation = 'generated_contract' or new.relation = 'generated_contract' then
    raise exception 'generated_contract document links are immutable.'
      using errcode = '23514',
            constraint = 'document_links_generated_contract_immutable';
  end if;

  return new;
end;
$generated_contract_immutable$;

create trigger document_links_generated_contract_immutable_trg
before update or delete on public.document_links
for each row
execute function public.prevent_generated_contract_document_link_mutation();

commit;
