\set ON_ERROR_STOP on

begin;

lock table
  public.app_users,
  public.auth_identities
in share row exclusive mode;

select exists(
  select 1
  from auth.users
  where id::text = :'admin_subject'
  for key share
) as portfolio_admin_auth_exists
\gset

\if :portfolio_admin_auth_exists
\else
  \echo 'First-admin bootstrap subject does not exist in auth.users.'
  rollback;
  \quit 1
\endif

do $bootstrap_guard$
begin
  if exists (select 1 from public.app_users)
     or exists (select 1 from public.auth_identities) then
    raise exception
      'First-admin bootstrap requires empty app_users and auth_identities tables.';
  end if;
end
$bootstrap_guard$;

with created_user as (
  insert into public.app_users (
    display_name,
    email,
    role,
    status
  ) values (
    :'admin_display_name',
    nullif(:'admin_email', ''),
    'admin',
    'active'
  )
  returning id
)
insert into public.auth_identities (
  user_id,
  provider,
  subject
)
select
  id,
  'supabase',
  :'admin_subject'
from created_user;

commit;
