begin;

create or replace function public.prevent_space_reparenting()
returns trigger
language plpgsql
as $space_parent_guard$
begin
  if new.unit_id is distinct from old.unit_id then
    raise exception 'Space parent Unit is immutable after creation.'
      using errcode = '23514',
            constraint = 'spaces_unit_immutable';
  end if;

  return new;
end;
$space_parent_guard$;

create trigger spaces_unit_immutable_trg
before update on public.spaces
for each row
execute function public.prevent_space_reparenting();

create or replace function public.prevent_lease_agreement_reparenting()
returns trigger
language plpgsql
as $lease_parent_guard$
begin
  if new.tenancy_id is distinct from old.tenancy_id then
    raise exception 'LeaseAgreement parent Tenancy is immutable after creation.'
      using errcode = '23514',
            constraint = 'lease_agreements_tenancy_immutable';
  end if;

  return new;
end;
$lease_parent_guard$;

create trigger lease_agreements_tenancy_immutable_trg
before update on public.lease_agreements
for each row
execute function public.prevent_lease_agreement_reparenting();

create or replace function public.prevent_lease_amendment_reparenting()
returns trigger
language plpgsql
as $lease_amendment_parent_guard$
begin
  if new.agreement_id is distinct from old.agreement_id then
    raise exception 'LeaseAmendment parent LeaseAgreement is immutable after creation.'
      using errcode = '23514',
            constraint = 'lease_amendments_agreement_immutable';
  end if;

  return new;
end;
$lease_amendment_parent_guard$;

create trigger lease_amendments_agreement_immutable_trg
before update on public.lease_amendments
for each row
execute function public.prevent_lease_amendment_reparenting();

create or replace function public.prevent_signed_original_document_link_mutation()
returns trigger
language plpgsql
as $document_link_guard$
begin
  if old.relation = 'signed_original'
     or (tg_op = 'UPDATE' and new.relation = 'signed_original')
  then
    raise exception 'signed_original document links are immutable.'
      using errcode = '23514',
            constraint = 'document_links_signed_original_immutable';
  end if;

  raise exception 'Document links are append-only relationship facts.'
    using errcode = '23514',
          constraint = 'document_links_immutable';
end;
$document_link_guard$;

comment on function public.prevent_space_reparenting() is
  'Protects stable Space -> Unit identity used by historical projections and downstream scope.';
comment on function public.prevent_lease_agreement_reparenting() is
  'Protects immutable LeaseAgreement -> Tenancy parent identity from creation onward.';
comment on function public.prevent_lease_amendment_reparenting() is
  'Protects immutable LeaseAmendment -> LeaseAgreement parent identity from creation onward.';
comment on function public.prevent_signed_original_document_link_mutation() is
  'DocumentLink rows are append-once relationship facts. signed_original keeps its legacy dedicated error category; all other links reject UPDATE/DELETE as document_links_immutable.';

commit;
