begin;

alter table public.app_users
  add column revision integer not null default 1,
  add constraint app_users_revision_positive check (revision >= 1);

create or replace function public.portfolio_guard_app_user_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Portfolio staff identity is immutable.'
      using errcode = '23514',
            constraint = 'app_users_identity_immutable';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'Portfolio staff revision must advance exactly once.'
      using errcode = '23514',
            constraint = 'app_users_revision_sequence';
  end if;

  if old.role = 'admin'
     and old.status = 'active'
     and (new.role <> 'admin' or new.status <> 'active') then
    perform 1
    from public.app_users
    where role = 'admin'
      and status = 'active'
    order by id
    for update;

    if not exists (
      select 1
      from public.app_users
      where id <> old.id
        and role = 'admin'
        and status = 'active'
    ) then
      raise exception 'Portfolio requires at least one active administrator.'
        using errcode = '23514',
              constraint = 'app_users_active_admin_required';
    end if;
  end if;

  new.updated_at := now();
  return new;
end
$$;

create trigger app_users_update_guard
before update on public.app_users
for each row
execute function public.portfolio_guard_app_user_update();

create or replace function public.portfolio_guard_app_user_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.status = 'active' then
    perform 1
    from public.app_users
    where role = 'admin'
      and status = 'active'
    order by id
    for update;

    if not exists (
      select 1
      from public.app_users
      where id <> old.id
        and role = 'admin'
        and status = 'active'
    ) then
      raise exception 'Portfolio requires at least one active administrator.'
        using errcode = '23514',
              constraint = 'app_users_active_admin_required';
    end if;
  end if;

  return old;
end
$$;

create trigger app_users_delete_guard
before delete on public.app_users
for each row
execute function public.portfolio_guard_app_user_delete();

commit;
