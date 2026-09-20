begin;

-- Tenancy.unit_id is aggregate identity. The application has no move/reparent
-- command; downstream historical facts rely on it remaining stable.
-- Tenancy.actual_start is set once at activation and is thereafter historical
-- occupancy truth consumed by Asset inventory and Access issuance chronology.

create or replace function public.guard_tenancy_parent_truth()
returns trigger
language plpgsql
as $tenancy_parent_truth_guard$
begin
  if new.unit_id is distinct from old.unit_id then
    raise exception 'Tenancy Unit is immutable.'
      using errcode = '23514',
            constraint = 'tenancy_unit_immutable';
  end if;

  if old.actual_start is not null
     and new.actual_start is distinct from old.actual_start
  then
    raise exception 'Tenancy actualStart is immutable once actual occupancy begins.'
      using errcode = '23514',
            constraint = 'tenancy_actual_start_immutable';
  end if;

  return new;
end;
$tenancy_parent_truth_guard$;

create trigger tenancy_parent_truth_guard_trg
before update on public.tenancies
for each row execute function public.guard_tenancy_parent_truth();

comment on column public.tenancies.unit_id is
  'Immutable Unit identity of the Tenancy aggregate.';
comment on column public.tenancies.actual_start is
  'Actual occupancy start. Set on activation and immutable once non-null.';

commit;
