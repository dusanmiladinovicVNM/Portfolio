begin;

create table public.access_items (
  id uuid primary key,
  code text not null,
  kind text not null,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid,
  space_id uuid,
  label text not null,
  recorded_at timestamptz not null,
  recorded_by_user_id uuid not null references public.app_users(id) on delete restrict,

  constraint access_items_code_not_blank check (btrim(code) <> ''),
  constraint access_items_code_canonical check (code = btrim(code)),
  constraint access_items_label_not_blank check (btrim(label) <> ''),
  constraint access_items_label_canonical check (label = btrim(label)),
  constraint access_items_kind_valid check (kind in ('key', 'card', 'remote')),
  constraint access_items_space_requires_unit check (space_id is null or unit_id is not null),
  constraint access_items_unit_same_property_fk
    foreign key (unit_id, property_id)
    references public.units(id, property_id)
    on delete restrict,
  constraint access_items_space_same_unit_fk
    foreign key (space_id, unit_id)
    references public.spaces(id, unit_id)
    on delete restrict
);

create unique index access_items_code_uq
  on public.access_items (lower(btrim(code)));
create index access_items_property_idx
  on public.access_items (property_id, kind, code);
create index access_items_unit_idx
  on public.access_items (unit_id, kind, code)
  where unit_id is not null;

create table public.access_item_transactions (
  id uuid primary key,
  access_item_id uuid not null references public.access_items(id) on delete restrict,
  tenancy_id uuid not null references public.tenancies(id) on delete restrict,
  type text not null,
  sequence integer not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null,
  recorded_by_user_id uuid not null references public.app_users(id) on delete restrict,
  note text,

  constraint access_item_transactions_type_valid
    check (type in ('issued', 'returned', 'lost')),
  constraint access_item_transactions_sequence_positive check (sequence > 0),
  constraint access_item_transactions_recorded_after_occurrence
    check (recorded_at >= occurred_at),
  constraint access_item_transactions_note_not_blank
    check (note is null or btrim(note) <> ''),
  constraint access_item_transactions_note_canonical
    check (note is null or note = btrim(note)),
  constraint access_item_transactions_item_sequence_uq
    unique (access_item_id, sequence)
);

create index access_item_transactions_item_idx
  on public.access_item_transactions (access_item_id, sequence desc);
create index access_item_transactions_tenancy_idx
  on public.access_item_transactions (tenancy_id, access_item_id, sequence desc);

create or replace function public.guard_access_item_mutation()
returns trigger
language plpgsql
as $access_item_guard$
begin
  if tg_op = 'DELETE' then
    raise exception 'AccessItem identity cannot be deleted.'
      using errcode = '23514',
            constraint = 'access_item_delete_forbidden';
  end if;

  raise exception 'AccessItem identity, kind, scope and recording provenance are immutable.'
    using errcode = '23514',
          constraint = 'access_item_immutable';
end;
$access_item_guard$;

create trigger access_item_guard_trg
before update or delete on public.access_items
for each row execute function public.guard_access_item_mutation();

create or replace function public.guard_access_item_transaction_insert()
returns trigger
language plpgsql
as $access_item_transaction_insert_guard$
declare
  item_property_id uuid;
  item_unit_id uuid;
  item_recorded_at timestamptz;

  tenancy_unit_id uuid;
  tenancy_property_id uuid;
  tenancy_status text;

  previous_type text;
  previous_tenancy_id uuid;
  previous_sequence integer;
  previous_occurred_at timestamptz;
  previous_recorded_at timestamptz;
begin
  select property_id, unit_id, recorded_at
    into item_property_id, item_unit_id, item_recorded_at
  from public.access_items
  where id = new.access_item_id
  for update;

  if item_property_id is null then
    raise exception 'AccessItem does not exist.'
      using errcode = '23514',
            constraint = 'access_item_transaction_item_missing';
  end if;

  select t.unit_id, u.property_id, t.status
    into tenancy_unit_id, tenancy_property_id, tenancy_status
  from public.tenancies t
  join public.units u on u.id = t.unit_id
  where t.id = new.tenancy_id
  for share of t;

  if tenancy_unit_id is null then
    raise exception 'Tenancy does not exist.'
      using errcode = '23514',
            constraint = 'access_item_transaction_tenancy_missing';
  end if;

  if tenancy_property_id is distinct from item_property_id then
    raise exception 'AccessItem and Tenancy must belong to the same Property.'
      using errcode = '23514',
            constraint = 'access_item_transaction_property_mismatch';
  end if;

  if item_unit_id is not null
     and tenancy_unit_id is distinct from item_unit_id
  then
    raise exception 'Unit-scoped AccessItem requires a Tenancy of the same Unit.'
      using errcode = '23514',
            constraint = 'access_item_transaction_unit_mismatch';
  end if;

  if new.occurred_at < item_recorded_at then
    raise exception 'AccessItem transaction cannot occur before AccessItem recording.'
      using errcode = '23514',
            constraint = 'access_item_transaction_before_item_recorded';
  end if;

  select type, tenancy_id, sequence, occurred_at, recorded_at
    into previous_type, previous_tenancy_id, previous_sequence,
         previous_occurred_at, previous_recorded_at
  from public.access_item_transactions
  where access_item_id = new.access_item_id
  order by sequence desc
  limit 1;

  if new.sequence <> coalesce(previous_sequence, 0) + 1 then
    raise exception 'AccessItem transaction sequence must advance exactly once.'
      using errcode = '23514',
            constraint = 'access_item_transaction_sequence_invalid';
  end if;

  if previous_sequence is not null then
    if new.occurred_at < previous_occurred_at
       or new.recorded_at < previous_recorded_at
    then
      raise exception 'AccessItem transaction chronology cannot move backwards.'
        using errcode = '23514',
              constraint = 'access_item_transaction_time_order_invalid';
    end if;
  end if;

  if new.type = 'issued' then
    if tenancy_status not in ('active', 'notice_given', 'move_out_pending') then
      raise exception 'AccessItem can only be issued to a current Tenancy.'
        using errcode = '23514',
              constraint = 'access_item_transaction_tenancy_not_eligible';
    end if;

    if previous_type is not null and previous_type <> 'returned' then
      raise exception 'Only an available AccessItem can be issued.'
        using errcode = '23514',
              constraint = 'access_item_transaction_not_available';
    end if;

  elsif new.type = 'returned' then
    if previous_type not in ('issued', 'lost') then
      raise exception 'Only an issued or lost AccessItem can be returned.'
        using errcode = '23514',
              constraint = 'access_item_transaction_return_invalid_state';
    end if;

    if new.tenancy_id is distinct from previous_tenancy_id then
      raise exception 'Return must reference the current holding Tenancy.'
        using errcode = '23514',
              constraint = 'access_item_transaction_tenancy_mismatch';
    end if;

  elsif new.type = 'lost' then
    if previous_type is distinct from 'issued' then
      raise exception 'Only an issued AccessItem can be reported lost.'
        using errcode = '23514',
              constraint = 'access_item_transaction_loss_invalid_state';
    end if;

    if new.tenancy_id is distinct from previous_tenancy_id then
      raise exception 'Loss must reference the current holding Tenancy.'
        using errcode = '23514',
              constraint = 'access_item_transaction_tenancy_mismatch';
    end if;
  end if;

  return new;
end;
$access_item_transaction_insert_guard$;

create trigger access_item_transaction_insert_guard_trg
before insert on public.access_item_transactions
for each row execute function public.guard_access_item_transaction_insert();

create or replace function public.guard_access_item_transaction_mutation()
returns trigger
language plpgsql
as $access_item_transaction_mutation_guard$
begin
  raise exception 'AccessItem transactions are append-only.'
    using errcode = '23514',
          constraint = 'access_item_transaction_immutable';
end;
$access_item_transaction_mutation_guard$;

create trigger access_item_transaction_mutation_guard_trg
before update or delete on public.access_item_transactions
for each row execute function public.guard_access_item_transaction_mutation();

alter table public.access_items enable row level security;
alter table public.access_item_transactions enable row level security;

comment on table public.access_items is
  'One exact physical access medium: mechanical key, access card or remote. Scope identifies inventory association, not exact lock/door permission.';
comment on table public.access_item_transactions is
  'Immutable per-item custody ledger. Current availability/holder/loss state is derived from the latest sequence; no parallel mutable assignment truth exists.';

commit;
