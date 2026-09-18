begin;

create table public.lease_agreements (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id) on delete restrict,
  code text not null,
  agreement_type text not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'draft',
  signed_at date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lease_agreements_code_not_blank check (btrim(code) <> ''),
  constraint lease_agreements_type_valid
    check (agreement_type in ('initial', 'renewal', 'replacement')),
  constraint lease_agreements_status_valid
    check (status in ('draft', 'signed', 'superseded', 'terminated', 'cancelled')),
  constraint lease_agreements_effective_range_valid
    check (effective_to is null or effective_to >= effective_from),
  constraint lease_agreements_version_positive check (version >= 1),
  constraint lease_agreements_state_shape_valid check (
    (status in ('draft', 'cancelled') and signed_at is null)
    or
    (status in ('signed', 'superseded', 'terminated') and signed_at is not null)
  )
);

create unique index lease_agreements_code_uq
  on public.lease_agreements (lower(code));

create index lease_agreements_tenancy_id_idx
  on public.lease_agreements (tenancy_id);

create table public.lease_agreement_parties (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.lease_agreements(id) on delete restrict,
  party_id uuid not null references public.parties(id) on delete restrict,
  role text not null,
  created_at timestamptz not null default now(),

  constraint lease_agreement_parties_role_valid check (
    role in ('landlord', 'tenant', 'co_tenant', 'guarantor', 'authorized_signatory')
  ),
  constraint lease_agreement_parties_role_uq
    unique (agreement_id, party_id, role)
);

create index lease_agreement_parties_agreement_id_idx
  on public.lease_agreement_parties (agreement_id);

create index lease_agreement_parties_party_id_idx
  on public.lease_agreement_parties (party_id);

create table public.lease_amendments (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.lease_agreements(id) on delete restrict,
  code text not null,
  title text not null,
  description text,
  effective_from date not null,
  status text not null default 'draft',
  signed_at date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lease_amendments_code_not_blank check (btrim(code) <> ''),
  constraint lease_amendments_title_not_blank check (btrim(title) <> ''),
  constraint lease_amendments_status_valid
    check (status in ('draft', 'signed', 'cancelled')),
  constraint lease_amendments_version_positive check (version >= 1),
  constraint lease_amendments_state_shape_valid check (
    (status in ('draft', 'cancelled') and signed_at is null)
    or
    (status = 'signed' and signed_at is not null)
  )
);

create unique index lease_amendments_code_uq
  on public.lease_amendments (lower(code));

create index lease_amendments_agreement_id_idx
  on public.lease_amendments (agreement_id);

create table public.tenancy_term_versions (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id) on delete restrict,
  source_type text not null,
  source_agreement_id uuid references public.lease_agreements(id) on delete restrict,
  source_amendment_id uuid references public.lease_amendments(id) on delete restrict,
  effective_from date not null,
  currency char(3) not null,
  base_rent numeric(18,2) not null,
  service_charge numeric(18,2) not null default 0,
  utilities_advance numeric(18,2) not null default 0,
  parking_rent numeric(18,2) not null default 0,
  other_recurring_charge numeric(18,2) not null default 0,
  deposit_required numeric(18,2) not null default 0,
  billing_frequency text not null default 'monthly',
  notice_period_tenant_days integer not null default 0,
  notice_period_landlord_days integer not null default 0,
  created_at timestamptz not null default now(),

  constraint tenancy_term_versions_source_type_valid
    check (source_type in ('agreement', 'amendment')),
  constraint tenancy_term_versions_source_shape_valid check (
    (
      source_type = 'agreement'
      and source_agreement_id is not null
      and source_amendment_id is null
    )
    or
    (
      source_type = 'amendment'
      and source_agreement_id is null
      and source_amendment_id is not null
    )
  ),
  constraint tenancy_term_versions_currency_format
    check (currency ~ '^[A-Z]{3}$'),
  constraint tenancy_term_versions_nonnegative_money check (
    base_rent >= 0
    and service_charge >= 0
    and utilities_advance >= 0
    and parking_rent >= 0
    and other_recurring_charge >= 0
    and deposit_required >= 0
  ),
  constraint tenancy_term_versions_billing_frequency_valid
    check (billing_frequency in ('monthly', 'quarterly', 'yearly')),
  constraint tenancy_term_versions_notice_periods_nonnegative check (
    notice_period_tenant_days >= 0
    and notice_period_landlord_days >= 0
  ),
  constraint tenancy_term_versions_tenancy_effective_from_uq
    unique (tenancy_id, effective_from)
);

create unique index tenancy_term_versions_agreement_source_uq
  on public.tenancy_term_versions (source_agreement_id)
  where source_agreement_id is not null;

create unique index tenancy_term_versions_amendment_source_uq
  on public.tenancy_term_versions (source_amendment_id)
  where source_amendment_id is not null;

create index tenancy_term_versions_tenancy_lookup_idx
  on public.tenancy_term_versions (tenancy_id, effective_from desc);

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

create trigger lease_agreements_signed_content_immutable_trg
before update on public.lease_agreements
for each row
execute function public.prevent_signed_lease_agreement_content_update();

create or replace function public.prevent_signed_lease_agreement_party_mutation()
returns trigger
language plpgsql
as $$
declare
  target_agreement_id uuid;
  target_status text;
begin
  target_agreement_id := case when tg_op = 'DELETE' then old.agreement_id else new.agreement_id end;

  select status
  into target_status
  from public.lease_agreements
  where id = target_agreement_id;

  if target_status <> 'draft' then
    raise exception 'Parties of a non-draft lease agreement are immutable.'
      using errcode = '23514',
            constraint = 'lease_agreement_parties_signed_immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger lease_agreement_parties_signed_immutable_trg
before insert or update or delete on public.lease_agreement_parties
for each row
execute function public.prevent_signed_lease_agreement_party_mutation();

create or replace function public.prevent_signed_lease_amendment_content_update()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'signed'
     and (
       new.agreement_id is distinct from old.agreement_id
       or new.code is distinct from old.code
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.effective_from is distinct from old.effective_from
       or new.signed_at is distinct from old.signed_at
     )
  then
    raise exception 'Signed lease amendment content is immutable.'
      using errcode = '23514',
            constraint = 'lease_amendments_signed_content_immutable';
  end if;

  return new;
end;
$$;

create trigger lease_amendments_signed_content_immutable_trg
before update on public.lease_amendments
for each row
execute function public.prevent_signed_lease_amendment_content_update();

create or replace function public.validate_tenancy_term_version_source()
returns trigger
language plpgsql
as $$
declare
  source_tenancy_id uuid;
begin
  if new.source_type = 'agreement' then
    select tenancy_id
    into source_tenancy_id
    from public.lease_agreements
    where id = new.source_agreement_id;
  else
    select a.tenancy_id
    into source_tenancy_id
    from public.lease_amendments am
    join public.lease_agreements a on a.id = am.agreement_id
    where am.id = new.source_amendment_id;
  end if;

  if source_tenancy_id is null or source_tenancy_id <> new.tenancy_id then
    raise exception 'Term source must belong to the same tenancy.'
      using errcode = '23514',
            constraint = 'tenancy_term_versions_source_tenancy_match';
  end if;

  return new;
end;
$$;

create trigger tenancy_term_versions_source_tenancy_match_trg
before insert on public.tenancy_term_versions
for each row
execute function public.validate_tenancy_term_version_source();

create or replace function public.prevent_tenancy_term_version_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Tenancy term versions are immutable.'
    using errcode = '23514',
          constraint = 'tenancy_term_versions_immutable';
end;
$$;

create trigger tenancy_term_versions_immutable_trg
before update or delete on public.tenancy_term_versions
for each row
execute function public.prevent_tenancy_term_version_mutation();

alter table public.lease_agreements enable row level security;
alter table public.lease_agreement_parties enable row level security;
alter table public.lease_amendments enable row level security;
alter table public.tenancy_term_versions enable row level security;

comment on table public.lease_agreements is
  'Legal lease document metadata. Tenancy remains the operational occupancy relationship.';
comment on table public.lease_agreement_parties is
  'Immutable legal party snapshot once the agreement is signed.';
comment on table public.tenancy_term_versions is
  'Append-only complete snapshots of effective tenancy commercial/legal terms.';
comment on column public.tenancy_term_versions.base_rent is
  'Exact PostgreSQL numeric amount; API/domain represent money as canonical decimal strings.';

commit;
