begin;

create table public.tenancies (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  unit_id uuid not null references public.units(id) on delete restrict,
  status text not null default 'draft',
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  notice_given_at date,
  termination_effective_at date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tenancies_code_not_blank check (btrim(code) <> ''),
  constraint tenancies_status_valid check (
    status in (
      'draft', 'planned', 'active', 'notice_given',
      'move_out_pending', 'ended', 'cancelled'
    )
  ),
  constraint tenancies_version_positive check (version >= 1),
  constraint tenancies_planned_range_valid
    check (planned_end is null or planned_start is null or planned_end >= planned_start),
  constraint tenancies_actual_range_valid
    check (actual_end is null or actual_start is null or actual_end >= actual_start),
  constraint tenancies_notice_after_start
    check (notice_given_at is null or actual_start is null or notice_given_at >= actual_start),
  constraint tenancies_termination_after_start
    check (
      termination_effective_at is null
      or actual_start is null
      or termination_effective_at >= actual_start
    ),
  constraint tenancies_state_shape_valid check (
    (status = 'draft'
      and actual_start is null and actual_end is null
      and notice_given_at is null and termination_effective_at is null)
    or
    (status = 'planned'
      and planned_start is not null
      and actual_start is null and actual_end is null
      and notice_given_at is null and termination_effective_at is null)
    or
    (status = 'active'
      and actual_start is not null and actual_end is null
      and notice_given_at is null and termination_effective_at is null)
    or
    (status = 'notice_given'
      and actual_start is not null and actual_end is null
      and notice_given_at is not null and termination_effective_at is not null)
    or
    (status = 'move_out_pending'
      and actual_start is not null and actual_end is null
      and notice_given_at is not null and termination_effective_at is not null)
    or
    (status = 'ended'
      and actual_start is not null and actual_end is not null)
    or
    (status = 'cancelled'
      and actual_start is null and actual_end is null)
  ),
  constraint tenancies_unit_effective_period_no_overlap
    exclude using gist (
      unit_id with =,
      daterange(
        case
          when status = 'planned' then planned_start
          else actual_start
        end,
        case
          when status = 'planned' and planned_end is not null then planned_end + 1
          when status in ('notice_given', 'move_out_pending')
            then termination_effective_at + 1
          when status = 'ended' then actual_end + 1
          else null
        end,
        '[)'
      ) with &&
    )
    where (status in ('planned', 'active', 'notice_given', 'move_out_pending', 'ended'))
);

create unique index tenancies_code_uq on public.tenancies (lower(code));
create index tenancies_unit_id_idx on public.tenancies (unit_id);
create index tenancies_status_idx on public.tenancies (status);

create table public.tenancy_parties (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id) on delete restrict,
  party_id uuid not null references public.parties(id) on delete restrict,
  role text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),

  constraint tenancy_parties_role_valid check (
    role in ('tenant', 'co_tenant', 'guarantor', 'authorized_occupant')
  ),
  constraint tenancy_parties_primary_role_valid check (
    not is_primary or role in ('tenant', 'co_tenant')
  ),
  constraint tenancy_parties_tenancy_party_role_uq
    unique (tenancy_id, party_id, role)
);

create unique index tenancy_parties_one_primary_occupant_uq
  on public.tenancy_parties (tenancy_id)
  where is_primary and role in ('tenant', 'co_tenant');

create index tenancy_parties_tenancy_id_idx
  on public.tenancy_parties (tenancy_id);

create index tenancy_parties_party_id_idx
  on public.tenancy_parties (party_id);

alter table public.tenancies enable row level security;
alter table public.tenancy_parties enable row level security;

comment on table public.tenancies is
  'Operational occupancy/rental relationship for one Unit. Legal agreements are modeled separately.';
comment on column public.tenancies.version is
  'Optimistic concurrency token incremented by every aggregate mutation.';
comment on table public.tenancy_parties is
  'Party roles within a tenancy. Tenant identity remains in the Party master.';

commit;
