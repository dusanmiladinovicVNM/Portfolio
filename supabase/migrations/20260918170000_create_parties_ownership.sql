begin;

create extension if not exists btree_gist;

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  party_type text not null,
  display_name text not null,
  first_name text,
  middle_name text,
  last_name text,
  legal_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint parties_code_not_blank check (btrim(code) <> ''),
  constraint parties_display_name_not_blank check (btrim(display_name) <> ''),
  constraint parties_type_valid check (party_type in ('person', 'company')),
  constraint parties_status_valid check (status in ('active', 'inactive', 'archived')),
  constraint parties_shape_valid check (
    (
      party_type = 'person'
      and first_name is not null and btrim(first_name) <> ''
      and last_name is not null and btrim(last_name) <> ''
      and legal_name is null
    )
    or
    (
      party_type = 'company'
      and legal_name is not null and btrim(legal_name) <> ''
      and first_name is null
      and middle_name is null
      and last_name is null
    )
  )
);

create unique index parties_code_uq on public.parties (lower(code));
create index parties_display_name_idx on public.parties (lower(display_name));

create table public.party_contact_points (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete restrict,
  contact_type text not null,
  value text not null,
  label text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),

  constraint party_contact_points_type_valid
    check (contact_type in ('email', 'phone', 'website')),
  constraint party_contact_points_value_not_blank check (btrim(value) <> '')
);

create index party_contact_points_party_id_idx
  on public.party_contact_points (party_id);

create unique index party_contact_points_one_primary_type_uq
  on public.party_contact_points (party_id, contact_type)
  where is_primary;

create table public.party_addresses (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete restrict,
  address_type text not null,
  line1 text not null,
  line2 text,
  postal_code text not null,
  city text not null,
  region text,
  country_code char(2) not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),

  constraint party_addresses_type_valid
    check (address_type in ('legal', 'residential', 'mailing', 'billing', 'other')),
  constraint party_addresses_line1_not_blank check (btrim(line1) <> ''),
  constraint party_addresses_postal_code_not_blank check (btrim(postal_code) <> ''),
  constraint party_addresses_city_not_blank check (btrim(city) <> ''),
  constraint party_addresses_country_code_format check (country_code ~ '^[A-Z]{2}$')
);

create index party_addresses_party_id_idx
  on public.party_addresses (party_id);

create unique index party_addresses_one_primary_type_uq
  on public.party_addresses (party_id, address_type)
  where is_primary;

create table public.unit_ownership_periods (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),

  constraint unit_ownership_periods_valid_range
    check (valid_to is null or valid_to >= valid_from),
  constraint unit_ownership_periods_no_overlap
    exclude using gist (
      unit_id with =,
      daterange(
        valid_from,
        coalesce(valid_to + 1, 'infinity'::date),
        '[)'
      ) with &&
    )
);

create index unit_ownership_periods_unit_id_idx
  on public.unit_ownership_periods (unit_id);

create table public.unit_ownership_shares (
  ownership_period_id uuid not null
    references public.unit_ownership_periods(id) on delete restrict,
  party_id uuid not null references public.parties(id) on delete restrict,
  share_basis_points integer not null,
  created_at timestamptz not null default now(),

  primary key (ownership_period_id, party_id),

  constraint unit_ownership_shares_range
    check (share_basis_points between 1 and 10000)
);

create index unit_ownership_shares_party_id_idx
  on public.unit_ownership_shares (party_id);

alter table public.parties enable row level security;
alter table public.party_contact_points enable row level security;
alter table public.party_addresses enable row level security;
alter table public.unit_ownership_periods enable row level security;
alter table public.unit_ownership_shares enable row level security;

comment on table public.parties is
  'Stable person/company identity; business roles are expressed through relationships.';
comment on table public.unit_ownership_periods is
  'One complete legal ownership composition for a unit during a non-overlapping date interval.';
comment on column public.unit_ownership_shares.share_basis_points is
  'Integer ownership share where 10000 basis points equals 100 percent. Aggregate writes must total exactly 10000.';

commit;
