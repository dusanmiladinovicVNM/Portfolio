begin;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  property_type text not null,
  street text not null,
  house_number text not null,
  postal_code text not null,
  city text not null,
  country_code char(2) not null,
  year_built integer,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint properties_code_not_blank check (btrim(code) <> ''),
  constraint properties_name_not_blank check (btrim(name) <> ''),
  constraint properties_country_code_format check (country_code ~ '^[A-Z]{2}$'),
  constraint properties_year_built_range
    check (year_built is null or year_built between 1000 and 3000),
  constraint properties_type_valid
    check (property_type in ('apartment_building', 'house', 'mixed_use', 'commercial', 'other')),
  constraint properties_status_valid
    check (status in ('active', 'inactive', 'archived'))
);

create unique index properties_code_uq on public.properties (lower(code));

create table public.units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  code text not null,
  unit_number text not null,
  unit_type text not null,
  floor text,
  area_m2 numeric(10,2),
  rooms numeric(5,2),
  status text not null default 'vacant',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint units_code_not_blank check (btrim(code) <> ''),
  constraint units_number_not_blank check (btrim(unit_number) <> ''),
  constraint units_area_positive check (area_m2 is null or area_m2 > 0),
  constraint units_rooms_positive check (rooms is null or rooms > 0),
  constraint units_type_valid
    check (unit_type in ('apartment', 'house', 'studio', 'office', 'commercial', 'other')),
  constraint units_status_valid
    check (status in ('vacant', 'occupied', 'turnover', 'inactive', 'archived'))
);

create unique index units_code_uq on public.units (lower(code));
create unique index units_property_number_uq on public.units (property_id, lower(unit_number));
create index units_property_id_idx on public.units (property_id);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  code text not null,
  name text not null,
  space_type text not null,
  area_m2 numeric(10,2),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint spaces_code_not_blank check (btrim(code) <> ''),
  constraint spaces_name_not_blank check (btrim(name) <> ''),
  constraint spaces_area_positive check (area_m2 is null or area_m2 > 0),
  constraint spaces_sort_order_nonnegative check (sort_order >= 0),
  constraint spaces_type_valid check (
    space_type in (
      'living_room', 'kitchen', 'bedroom', 'bathroom', 'hall',
      'balcony', 'terrace', 'cellar', 'storage', 'garage', 'parking', 'other'
    )
  )
);

create unique index spaces_unit_code_uq on public.spaces (unit_id, lower(code));
create index spaces_unit_id_idx on public.spaces (unit_id);

-- No browser-facing policies exist yet. Until the auth/authorization slice is
-- introduced, these tables are intentionally inaccessible through the anon/
-- authenticated Data API. Service-side migrations/tests may use privileged
-- credentials.
alter table public.properties enable row level security;
alter table public.units enable row level security;
alter table public.spaces enable row level security;

comment on table public.properties is
  'Stable property/building/site identity. Does not contain tenant master data.';
comment on table public.units is
  'Stable independently managed/rentable unit identity under one property.';
comment on table public.spaces is
  'Named physical subdivision of a unit used for localization of assets, work and inspections.';

commit;
