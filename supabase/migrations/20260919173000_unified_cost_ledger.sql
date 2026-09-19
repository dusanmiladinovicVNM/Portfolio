begin;

create table public.costs (
  id uuid primary key,
  source_kind text not null,
  property_id uuid references public.properties(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  space_id uuid references public.spaces(id) on delete restrict,
  asset_id uuid references public.assets(id) on delete restrict,
  warranty_claim_id uuid references public.asset_warranty_claims(id) on delete restrict,
  service_event_id uuid references public.asset_service_events(id) on delete restrict,
  improvement_project_id uuid references public.improvement_projects(id) on delete restrict,
  work_item_id uuid references public.improvement_work_items(id) on delete restrict,
  work_record_id uuid references public.improvement_work_records(id) on delete restrict,
  work_material_id uuid references public.improvement_work_materials(id) on delete restrict,
  description text not null,
  amount numeric not null,
  currency text not null,
  incurred_on date not null,
  reporting_class text not null,
  supplier_party_id uuid references public.parties(id) on delete restrict,
  invoice_reference text,
  recorded_at timestamptz not null,
  recorded_by_user_id uuid not null references public.app_users(id) on delete restrict,

  constraint costs_description_not_blank check (btrim(description) <> ''),
  constraint costs_description_canonical check (description = btrim(description)),
  constraint costs_amount_positive check (amount > 0),
  constraint costs_amount_scale_valid check (scale(amount) <= 2),
  constraint costs_amount_range_valid check (
    amount < 10000000000000000::numeric
  ),
  constraint costs_currency_supported check (currency in ('CHF', 'EUR', 'RSD')),
  constraint costs_reporting_class_valid
    check (reporting_class in ('capex', 'opex', 'unclassified')),
  constraint costs_invoice_reference_not_blank
    check (invoice_reference is null or btrim(invoice_reference) <> ''),
  constraint costs_invoice_reference_canonical
    check (invoice_reference is null or invoice_reference = btrim(invoice_reference)),
  constraint costs_incurred_not_future check (
    incurred_on <= (recorded_at at time zone 'UTC')::date
  ),
  constraint costs_source_kind_valid check (
    source_kind in (
      'property',
      'unit',
      'space',
      'asset',
      'warranty_claim',
      'service_event',
      'improvement_project',
      'work_item',
      'work_record',
      'work_material'
    )
  ),
  constraint costs_exactly_one_source check (
    num_nonnulls(
      property_id,
      unit_id,
      space_id,
      asset_id,
      warranty_claim_id,
      service_event_id,
      improvement_project_id,
      work_item_id,
      work_record_id,
      work_material_id
    ) = 1
  ),
  constraint costs_source_kind_matches_target check (
    (source_kind = 'property' and property_id is not null)
    or (source_kind = 'unit' and unit_id is not null)
    or (source_kind = 'space' and space_id is not null)
    or (source_kind = 'asset' and asset_id is not null)
    or (source_kind = 'warranty_claim' and warranty_claim_id is not null)
    or (source_kind = 'service_event' and service_event_id is not null)
    or (
      source_kind = 'improvement_project'
      and improvement_project_id is not null
    )
    or (source_kind = 'work_item' and work_item_id is not null)
    or (source_kind = 'work_record' and work_record_id is not null)
    or (source_kind = 'work_material' and work_material_id is not null)
  )
);

create index costs_incurred_currency_idx
  on public.costs (incurred_on, currency, id);
create index costs_reporting_class_idx
  on public.costs (reporting_class, incurred_on, id);
create index costs_supplier_idx
  on public.costs (supplier_party_id, incurred_on, id)
  where supplier_party_id is not null;
create index costs_invoice_reference_idx
  on public.costs (invoice_reference, incurred_on, id)
  where invoice_reference is not null;
create index costs_property_source_idx
  on public.costs (property_id, incurred_on, id)
  where property_id is not null;
create index costs_unit_source_idx
  on public.costs (unit_id, incurred_on, id)
  where unit_id is not null;
create index costs_space_source_idx
  on public.costs (space_id, incurred_on, id)
  where space_id is not null;
create index costs_asset_source_idx
  on public.costs (asset_id, incurred_on, id)
  where asset_id is not null;
create index costs_warranty_claim_source_idx
  on public.costs (warranty_claim_id, incurred_on, id)
  where warranty_claim_id is not null;
create index costs_service_event_source_idx
  on public.costs (service_event_id, incurred_on, id)
  where service_event_id is not null;
create index costs_improvement_project_source_idx
  on public.costs (improvement_project_id, incurred_on, id)
  where improvement_project_id is not null;
create index costs_work_item_source_idx
  on public.costs (work_item_id, incurred_on, id)
  where work_item_id is not null;
create index costs_work_record_source_idx
  on public.costs (work_record_id, incurred_on, id)
  where work_record_id is not null;
create index costs_work_material_source_idx
  on public.costs (work_material_id, incurred_on, id)
  where work_material_id is not null;

create table public.cost_reversals (
  id uuid primary key,
  cost_id uuid not null references public.costs(id) on delete restrict,
  replacement_cost_id uuid references public.costs(id) on delete restrict,
  reason text not null,
  recorded_at timestamptz not null,
  recorded_by_user_id uuid not null references public.app_users(id) on delete restrict,

  constraint cost_reversals_cost_uq unique (cost_id),
  constraint cost_reversals_replacement_uq unique (replacement_cost_id),
  constraint cost_reversals_reason_not_blank check (btrim(reason) <> ''),
  constraint cost_reversals_reason_canonical check (reason = btrim(reason)),
  constraint cost_reversals_not_self check (
    replacement_cost_id is null or replacement_cost_id <> cost_id
  )
);

create index cost_reversals_replacement_idx
  on public.cost_reversals (replacement_cost_id)
  where replacement_cost_id is not null;

create or replace function public.guard_cost_immutable()
returns trigger
language plpgsql
as $cost_immutable$
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    raise exception 'Cost ledger facts are append-only.'
      using errcode = '23514',
            constraint = 'cost_immutable';
  end if;
  return new;
end;
$cost_immutable$;

create trigger cost_immutable_trg
before update or delete on public.costs
for each row execute function public.guard_cost_immutable();

create or replace function public.guard_cost_reversal()
returns trigger
language plpgsql
as $cost_reversal_guard$
declare
  original_recorded_at timestamptz;
  replacement_recorded_at timestamptz;
  replacement_recorded_by_user_id uuid;
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    raise exception 'Cost reversal history is append-only.'
      using errcode = '23514',
            constraint = 'cost_reversal_immutable';
  end if;

  select recorded_at
    into original_recorded_at
  from public.costs
  where id = new.cost_id
  for update;

  if original_recorded_at is null then
    raise exception 'Original Cost does not exist.'
      using errcode = '23503',
            constraint = 'cost_reversals_cost_id_fkey';
  end if;

  if new.recorded_at < original_recorded_at then
    raise exception 'Cost reversal cannot predate original Cost recording.'
      using errcode = '23514',
            constraint = 'cost_reversal_before_cost';
  end if;

  if new.replacement_cost_id is not null then
    select recorded_at, recorded_by_user_id
      into replacement_recorded_at, replacement_recorded_by_user_id
    from public.costs
    where id = new.replacement_cost_id
    for update;

    if replacement_recorded_at is null then
      raise exception 'Replacement Cost does not exist.'
        using errcode = '23503',
              constraint = 'cost_reversals_replacement_cost_id_fkey';
    end if;

    if replacement_recorded_at <> new.recorded_at then
      raise exception 'Replacement Cost and reversal must share recordedAt.'
        using errcode = '23514',
              constraint = 'cost_reversal_replacement_recording_mismatch';
    end if;

    if replacement_recorded_by_user_id <> new.recorded_by_user_id then
      raise exception 'Replacement Cost and reversal must share recordedByUserId.'
        using errcode = '23514',
              constraint = 'cost_reversal_replacement_recorder_mismatch';
    end if;

    if exists (
      select 1
      from public.cost_reversals existing
      where existing.cost_id = new.replacement_cost_id
    ) then
      raise exception 'Replacement Cost is already reversed.'
        using errcode = '23514',
              constraint = 'cost_reversal_replacement_already_reversed';
    end if;
  end if;

  return new;
end;
$cost_reversal_guard$;

create trigger cost_reversal_guard_trg
before insert or update or delete on public.cost_reversals
for each row execute function public.guard_cost_reversal();

alter table public.costs enable row level security;
alter table public.cost_reversals enable row level security;

comment on table public.costs is
  'Append-only positive monetary allocations. Each Cost has exactly one typed business source and immutable reporting provenance.';
comment on table public.cost_reversals is
  'Append-only full reversals of Cost facts. Optional replacement Cost records correction lineage.';

commit;
