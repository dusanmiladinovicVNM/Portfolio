begin;

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_users_display_name_not_blank check (btrim(display_name) <> ''),
  constraint app_users_email_not_blank check (email is null or btrim(email) <> ''),
  constraint app_users_role_valid check (role in ('admin', 'manager', 'inspector')),
  constraint app_users_status_valid check (status in ('active', 'inactive'))
);

create unique index app_users_email_uq
  on public.app_users (lower(email))
  where email is not null;

create table public.auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete restrict,
  provider text not null,
  subject text not null,
  created_at timestamptz not null default now(),

  constraint auth_identities_provider_not_blank check (btrim(provider) <> ''),
  constraint auth_identities_subject_not_blank check (btrim(subject) <> '')
);

create unique index auth_identities_provider_subject_uq
  on public.auth_identities (lower(provider), subject);

create unique index auth_identities_user_provider_uq
  on public.auth_identities (user_id, lower(provider));

create index auth_identities_user_id_idx
  on public.auth_identities (user_id);

alter table public.app_users enable row level security;
alter table public.auth_identities enable row level security;

comment on table public.app_users is
  'Portfolio staff identity independent of the external authentication provider.';
comment on table public.auth_identities is
  'Maps an external verified auth subject to a stable internal Portfolio user.';

commit;
