begin;

-- Extend canonical Tenancy parent truth for downstream boundary readings.
-- unit_id remains immutable after creation.
-- actual_start remains immutable once set.
-- actual_end is established once when actual occupancy ends and is then immutable.

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

  if old.actual_end is not null
     and new.actual_end is distinct from old.actual_end
  then
    raise exception 'Tenancy actualEnd is immutable once actual occupancy ends.'
      using errcode = '23514',
            constraint = 'tenancy_actual_end_immutable';
  end if;

  return new;
end;
$tenancy_parent_truth_guard$;

comment on column public.tenancies.actual_end is
  'Actual occupancy end. Set when occupancy ends and immutable once non-null.';

commit;
