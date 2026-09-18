begin;

-- Unit lifecycle is administrative only. Occupancy is derived from Tenancy.
update public.units
set status = 'active'
where status in ('vacant', 'occupied', 'turnover');

alter table public.units
  alter column status set default 'active';

alter table public.units
  drop constraint units_status_valid;

alter table public.units
  add constraint units_status_valid
  check (status in ('active', 'inactive', 'archived'));

-- Notice can never take effect before it was given.
alter table public.tenancies
  add constraint tenancies_termination_not_before_notice
  check (
    termination_effective_at is null
    or notice_given_at is null
    or termination_effective_at >= notice_given_at
  );

-- Planned reservation and actual occupancy are intentionally different
-- temporal concepts. Replace the old mixed exclusion constraint.
alter table public.tenancies
  drop constraint tenancies_unit_effective_period_no_overlap;

alter table public.tenancies
  add constraint tenancies_unit_planned_period_no_overlap
  exclude using gist (
    unit_id with =,
    daterange(
      planned_start,
      case when planned_end is null then null else planned_end + 1 end,
      '[)'
    ) with &&
  )
  where (status = 'planned');

alter table public.tenancies
  add constraint tenancies_unit_actual_period_no_overlap
  exclude using gist (
    unit_id with =,
    daterange(
      actual_start,
      case
        when status in ('notice_given', 'move_out_pending')
          then termination_effective_at + 1
        when status = 'ended'
          then actual_end + 1
        else null
      end,
      '[)'
    ) with &&
  )
  where (status in ('active', 'notice_given', 'move_out_pending', 'ended'));

-- A new/planned reservation cannot be created over known actual occupancy.
-- Actual truth is never blocked by a planned reservation: if reality later
-- overruns a reservation, the reservation must be resolved before activation.
create or replace function public.prevent_planned_tenancy_over_actual_occupancy()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'planned'
     and exists (
       select 1
       from public.tenancies t
       where t.unit_id = new.unit_id
         and t.id <> new.id
         and t.status in ('active', 'notice_given', 'move_out_pending', 'ended')
         and daterange(
           t.actual_start,
           case
             when t.status in ('notice_given', 'move_out_pending')
               then t.termination_effective_at + 1
             when t.status = 'ended'
               then t.actual_end + 1
             else null
           end,
           '[)'
         ) && daterange(
           new.planned_start,
           case when new.planned_end is null then null else new.planned_end + 1 end,
           '[)'
         )
     )
  then
    raise exception 'Planned tenancy overlaps known actual occupancy.'
      using errcode = '23P01',
            constraint = 'tenancies_planned_against_actual_conflict';
  end if;

  return new;
end;
$$;

create trigger tenancies_planned_against_actual_conflict_trg
before insert or update on public.tenancies
for each row
execute function public.prevent_planned_tenancy_over_actual_occupancy();

-- Until TenancyParty receives temporal membership, its composition is frozen
-- once actual occupancy starts.
create or replace function public.guard_tenancy_party_change_by_state()
returns trigger
language plpgsql
as $$
declare
  target_tenancy_id uuid;
  target_status text;
begin
  target_tenancy_id :=
    case when tg_op = 'DELETE' then old.tenancy_id else new.tenancy_id end;

  select status
  into target_status
  from public.tenancies
  where id = target_tenancy_id;

  if target_status not in ('draft', 'planned') then
    raise exception 'Tenancy parties are immutable after activation.'
      using errcode = '23514',
            constraint = 'tenancy_parties_change_state_guard';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger tenancy_parties_change_state_guard_trg
before insert or update or delete on public.tenancy_parties
for each row
execute function public.guard_tenancy_party_change_by_state();

comment on column public.units.status is
  'Administrative Unit lifecycle only: active/inactive/archived. Occupancy is derived from Tenancy.';

commit;
