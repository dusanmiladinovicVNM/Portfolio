begin;

alter table public.lease_agreements
  add column predecessor_agreement_id uuid;

alter table public.lease_agreements
  add constraint lease_agreements_id_tenancy_uq
  unique (id, tenancy_id);

alter table public.lease_agreements
  add constraint lease_agreements_predecessor_shape check (
    (agreement_type = 'initial' and predecessor_agreement_id is null)
    or
    (agreement_type in ('renewal', 'replacement') and predecessor_agreement_id is not null)
  );

alter table public.lease_agreements
  add constraint lease_agreements_predecessor_not_self check (
    predecessor_agreement_id is null
    or predecessor_agreement_id <> id
  );

alter table public.lease_agreements
  add constraint lease_agreements_predecessor_same_tenancy_fk
  foreign key (predecessor_agreement_id, tenancy_id)
  references public.lease_agreements(id, tenancy_id)
  on delete restrict;

create unique index lease_agreements_one_initial_per_tenancy_uq
  on public.lease_agreements (tenancy_id)
  where agreement_type = 'initial'
    and status <> 'cancelled';

create unique index lease_agreements_one_successor_per_predecessor_uq
  on public.lease_agreements (predecessor_agreement_id)
  where predecessor_agreement_id is not null
    and status <> 'cancelled';

create or replace function public.validate_lease_agreement_predecessor()
returns trigger
language plpgsql
as $$
declare
  predecessor_status text;
  predecessor_effective_from date;
begin
  if new.predecessor_agreement_id is null then
    return new;
  end if;

  select status, effective_from
  into predecessor_status, predecessor_effective_from
  from public.lease_agreements
  where id = new.predecessor_agreement_id
    and tenancy_id = new.tenancy_id;

  if predecessor_status is null then
    return new;
  end if;

  if predecessor_status <> 'signed' then
    raise exception 'Successor agreement requires a signed predecessor.'
      using errcode = '23514',
            constraint = 'lease_agreements_predecessor_signed';
  end if;

  if predecessor_effective_from >= new.effective_from then
    raise exception 'Successor agreement must become effective after predecessor starts.'
      using errcode = '23514',
            constraint = 'lease_agreements_predecessor_period';
  end if;

  return new;
end;
$$;

create trigger lease_agreements_predecessor_valid_trg
before insert or update of
  predecessor_agreement_id,
  agreement_type,
  effective_from,
  tenancy_id
on public.lease_agreements
for each row
execute function public.validate_lease_agreement_predecessor();

create or replace function public.prevent_signed_lease_agreement_content_update()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('signed', 'superseded', 'terminated')
     and (
       new.tenancy_id is distinct from old.tenancy_id
       or new.code is distinct from old.code
       or new.agreement_type is distinct from old.agreement_type
       or new.predecessor_agreement_id is distinct from old.predecessor_agreement_id
       or new.effective_from is distinct from old.effective_from
       or new.effective_to is distinct from old.effective_to
       or new.signed_at is distinct from old.signed_at
     )
  then
    raise exception 'Signed lease agreement content is immutable.'
      using errcode = '23514',
            constraint = 'lease_agreements_signed_content_immutable';
  end if;

  return new;
end;
$$;

create or replace function public.validate_tenancy_term_version_source()
returns trigger
language plpgsql
as $$
declare
  source_tenancy_id uuid;
  source_status text;
  source_effective_from date;
  governing_status text;
begin
  if new.source_type = 'agreement' then
    select tenancy_id, status, effective_from
    into source_tenancy_id, source_status, source_effective_from
    from public.lease_agreements
    where id = new.source_agreement_id;

    governing_status := source_status;
  else
    select
      a.tenancy_id,
      am.status,
      am.effective_from,
      a.status
    into
      source_tenancy_id,
      source_status,
      source_effective_from,
      governing_status
    from public.lease_amendments am
    join public.lease_agreements a on a.id = am.agreement_id
    where am.id = new.source_amendment_id;
  end if;

  if source_tenancy_id is null or source_tenancy_id <> new.tenancy_id then
    raise exception 'Term source must belong to the same tenancy.'
      using errcode = '23514',
            constraint = 'tenancy_term_versions_source_tenancy_match';
  end if;

  if source_status <> 'signed'
     or (
       new.source_type = 'amendment'
       and governing_status <> 'signed'
     )
  then
    raise exception 'Term source must be signed.'
      using errcode = '23514',
            constraint = 'tenancy_term_versions_source_not_signed';
  end if;

  if source_effective_from <> new.effective_from then
    raise exception 'Term effective date must match its legal source.'
      using errcode = '23514',
            constraint = 'tenancy_term_versions_source_effective_from_match';
  end if;

  return new;
end;
$$;

comment on column public.lease_agreements.predecessor_agreement_id is
  'Previous signed agreement in the legal successor chain. Initial agreements have no predecessor.';
comment on table public.tenancy_term_versions is
  'Append-only terms. As-of validity is bounded by the governing agreement and any signed successor.';

commit;
