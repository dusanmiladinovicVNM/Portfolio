begin;

create table public.asset_warranties (
  id uuid primary key,
  asset_id uuid not null references public.assets(id) on delete restrict,
  warranty_type text not null,
  provider_party_id uuid references public.parties(id) on delete restrict,
  reference text,
  valid_from date not null,
  valid_to date,
  terms text,
  recorded_at timestamptz not null,
  recorded_by_user_id uuid not null references public.app_users(id) on delete restrict,

  constraint asset_warranties_type_valid
    check (warranty_type in ('manufacturer', 'seller', 'extended', 'other')),
  constraint asset_warranties_reference_not_blank
    check (reference is null or btrim(reference) <> ''),
  constraint asset_warranties_reference_canonical
    check (reference is null or reference = btrim(reference)),
  constraint asset_warranties_terms_not_blank
    check (terms is null or btrim(terms) <> ''),
  constraint asset_warranties_terms_canonical
    check (terms is null or terms = btrim(terms)),
  constraint asset_warranties_interval_valid
    check (valid_to is null or valid_to >= valid_from)
);

create index asset_warranties_asset_time_idx
  on public.asset_warranties (asset_id, valid_from desc, id);
create index asset_warranties_provider_idx
  on public.asset_warranties (provider_party_id)
  where provider_party_id is not null;

create table public.asset_warranty_claims (
  id uuid primary key,
  warranty_id uuid not null
    references public.asset_warranties(id) on delete restrict,
  incident_on date not null,
  description text not null,
  status text not null default 'draft',
  provider_reference text,
  submitted_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),

  constraint asset_warranty_claims_description_not_blank
    check (btrim(description) <> ''),
  constraint asset_warranty_claims_description_canonical
    check (description = btrim(description)),
  constraint asset_warranty_claims_status_valid check (
    status in (
      'draft', 'submitted', 'approved', 'rejected', 'cancelled', 'closed'
    )
  ),
  constraint asset_warranty_claims_provider_reference_not_blank
    check (provider_reference is null or btrim(provider_reference) <> ''),
  constraint asset_warranty_claims_provider_reference_canonical
    check (
      provider_reference is null or provider_reference = btrim(provider_reference)
    ),
  constraint asset_warranty_claims_version_positive check (version > 0),
  constraint asset_warranty_claims_state_shape check (
    (
      status = 'draft'
      and provider_reference is null
      and submitted_at is null
      and resolved_at is null
      and closed_at is null
      and cancelled_at is null
    )
    or
    (
      status = 'submitted'
      and submitted_at is not null
      and resolved_at is null
      and closed_at is null
      and cancelled_at is null
    )
    or
    (
      status in ('approved', 'rejected')
      and submitted_at is not null
      and resolved_at is not null
      and closed_at is null
      and cancelled_at is null
    )
    or
    (
      status = 'closed'
      and submitted_at is not null
      and resolved_at is not null
      and closed_at is not null
      and cancelled_at is null
    )
    or
    (
      status = 'cancelled'
      and resolved_at is null
      and closed_at is null
      and cancelled_at is not null
    )
  ),
  constraint asset_warranty_claims_timestamp_order check (
    (resolved_at is null or submitted_at is null or resolved_at >= submitted_at)
    and (closed_at is null or resolved_at is null or closed_at >= resolved_at)
    and (
      cancelled_at is null
      or submitted_at is null
      or cancelled_at >= submitted_at
    )
  )
);

create index asset_warranty_claims_warranty_idx
  on public.asset_warranty_claims (warranty_id, incident_on desc, id);

create table public.asset_service_plans (
  id uuid primary key,
  asset_id uuid not null references public.assets(id) on delete restrict,
  name text not null,
  schedule_kind text not null,
  first_due_on date not null,
  interval_months integer,
  provider_party_id uuid references public.parties(id) on delete restrict,
  notes text,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null,
  created_by_user_id uuid not null references public.app_users(id) on delete restrict,

  constraint asset_service_plans_name_not_blank check (btrim(name) <> ''),
  constraint asset_service_plans_name_canonical check (name = btrim(name)),
  constraint asset_service_plans_schedule_kind_valid
    check (schedule_kind in ('one_time', 'recurring')),
  constraint asset_service_plans_schedule_shape check (
    (schedule_kind = 'one_time' and interval_months is null)
    or
    (
      schedule_kind = 'recurring'
      and interval_months is not null
      and interval_months > 0
    )
  ),
  constraint asset_service_plans_notes_not_blank
    check (notes is null or btrim(notes) <> ''),
  constraint asset_service_plans_notes_canonical
    check (notes is null or notes = btrim(notes)),
  constraint asset_service_plans_status_valid
    check (status in ('active', 'paused', 'ended', 'cancelled')),
  constraint asset_service_plans_version_positive check (version > 0)
);

create index asset_service_plans_asset_idx
  on public.asset_service_plans (asset_id, first_due_on, id);
create index asset_service_plans_provider_idx
  on public.asset_service_plans (provider_party_id)
  where provider_party_id is not null;

create table public.asset_service_events (
  id uuid primary key,
  asset_id uuid not null references public.assets(id) on delete restrict,
  service_plan_id uuid
    references public.asset_service_plans(id) on delete restrict,
  warranty_claim_id uuid
    references public.asset_warranty_claims(id) on delete restrict,
  event_type text not null,
  performed_at timestamptz not null,
  provider_party_id uuid references public.parties(id) on delete restrict,
  description text not null,
  reference text,
  recorded_at timestamptz not null,
  recorded_by_user_id uuid not null references public.app_users(id) on delete restrict,

  constraint asset_service_events_type_valid check (
    event_type in (
      'routine_service', 'repair', 'diagnostic', 'warranty_service', 'other'
    )
  ),
  constraint asset_service_events_description_not_blank
    check (btrim(description) <> ''),
  constraint asset_service_events_description_canonical
    check (description = btrim(description)),
  constraint asset_service_events_reference_not_blank
    check (reference is null or btrim(reference) <> ''),
  constraint asset_service_events_reference_canonical
    check (reference is null or reference = btrim(reference)),
  constraint asset_service_events_time_order
    check (performed_at <= recorded_at)
);

create index asset_service_events_asset_time_idx
  on public.asset_service_events (asset_id, performed_at desc, id);
create index asset_service_events_plan_idx
  on public.asset_service_events (service_plan_id)
  where service_plan_id is not null;
create index asset_service_events_claim_idx
  on public.asset_service_events (warranty_claim_id)
  where warranty_claim_id is not null;

create table public.asset_service_parts (
  id uuid primary key,
  service_event_id uuid not null
    references public.asset_service_events(id) on delete restrict,
  name text not null,
  part_number text,
  serial_number text,
  quantity integer not null,
  notes text,

  constraint asset_service_parts_name_not_blank check (btrim(name) <> ''),
  constraint asset_service_parts_name_canonical check (name = btrim(name)),
  constraint asset_service_parts_part_number_not_blank
    check (part_number is null or btrim(part_number) <> ''),
  constraint asset_service_parts_part_number_canonical
    check (part_number is null or part_number = btrim(part_number)),
  constraint asset_service_parts_serial_number_not_blank
    check (serial_number is null or btrim(serial_number) <> ''),
  constraint asset_service_parts_serial_number_canonical
    check (serial_number is null or serial_number = btrim(serial_number)),
  constraint asset_service_parts_quantity_positive check (quantity > 0),
  constraint asset_service_parts_notes_not_blank
    check (notes is null or btrim(notes) <> ''),
  constraint asset_service_parts_notes_canonical
    check (notes is null or notes = btrim(notes))
);

create index asset_service_parts_event_idx
  on public.asset_service_parts (service_event_id, id);

create or replace function public.guard_asset_warranty()
returns trigger
language plpgsql
as $asset_warranty_guard$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Warranty coverage records are append-only.'
      using errcode = '23514',
            constraint = 'asset_warranty_immutable';
  end if;
  return new;
end;
$asset_warranty_guard$;

create trigger asset_warranty_guard_trg
before update or delete on public.asset_warranties
for each row execute function public.guard_asset_warranty();

create or replace function public.guard_asset_warranty_claim_insert()
returns trigger
language plpgsql
as $asset_warranty_claim_insert_guard$
declare
  coverage_from date;
  coverage_to date;
begin
  if new.status <> 'draft'
     or new.version <> 1
     or new.provider_reference is not null
     or new.submitted_at is not null
     or new.resolved_at is not null
     or new.closed_at is not null
     or new.cancelled_at is not null
  then
    raise exception 'New WarrantyClaim must start draft at version 1.'
      using errcode = '23514',
            constraint = 'asset_warranty_claim_initial_state';
  end if;

  select valid_from, valid_to
    into coverage_from, coverage_to
  from public.asset_warranties
  where id = new.warranty_id;

  if new.incident_on < coverage_from
     or (coverage_to is not null and new.incident_on > coverage_to)
  then
    raise exception 'WarrantyClaim incident must fall inside Warranty coverage.'
      using errcode = '23514',
            constraint = 'asset_warranty_claim_outside_coverage';
  end if;

  return new;
end;
$asset_warranty_claim_insert_guard$;

create trigger asset_warranty_claim_insert_guard_trg
before insert on public.asset_warranty_claims
for each row execute function public.guard_asset_warranty_claim_insert();

create or replace function public.guard_asset_warranty_claim_mutation()
returns trigger
language plpgsql
as $asset_warranty_claim_guard$
begin
  if tg_op = 'DELETE' then
    raise exception 'WarrantyClaim history cannot be deleted.'
      using errcode = '23514',
            constraint = 'asset_warranty_claim_delete_forbidden';
  end if;

  if new.id is distinct from old.id
     or new.warranty_id is distinct from old.warranty_id
     or new.incident_on is distinct from old.incident_on
     or new.description is distinct from old.description
  then
    raise exception 'WarrantyClaim identity/content is immutable after creation.'
      using errcode = '23514',
            constraint = 'asset_warranty_claim_identity_immutable';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'WarrantyClaim transition must advance version by one.'
      using errcode = '23514',
            constraint = 'asset_warranty_claim_version_step';
  end if;

  if old.submitted_at is not null
     and new.submitted_at is distinct from old.submitted_at
  then
    raise exception 'WarrantyClaim lifecycle timestamps are immutable once set.'
      using errcode = '23514',
            constraint = 'asset_warranty_claim_timestamp_immutable';
  end if;
  if old.resolved_at is not null
     and new.resolved_at is distinct from old.resolved_at
  then
    raise exception 'WarrantyClaim lifecycle timestamps are immutable once set.'
      using errcode = '23514',
            constraint = 'asset_warranty_claim_timestamp_immutable';
  end if;
  if old.closed_at is not null
     and new.closed_at is distinct from old.closed_at
  then
    raise exception 'WarrantyClaim lifecycle timestamps are immutable once set.'
      using errcode = '23514',
            constraint = 'asset_warranty_claim_timestamp_immutable';
  end if;
  if old.cancelled_at is not null
     and new.cancelled_at is distinct from old.cancelled_at
  then
    raise exception 'WarrantyClaim lifecycle timestamps are immutable once set.'
      using errcode = '23514',
            constraint = 'asset_warranty_claim_timestamp_immutable';
  end if;

  if old.status <> 'draft'
     and new.provider_reference is distinct from old.provider_reference
  then
    raise exception 'Provider reference is fixed when a WarrantyClaim is submitted.'
      using errcode = '23514',
            constraint = 'asset_warranty_claim_provider_reference_immutable';
  end if;

  if old.status = 'draft' and new.status in ('submitted', 'cancelled') then
    return new;
  end if;

  if old.status = 'submitted'
     and new.status in ('approved', 'rejected', 'cancelled')
  then
    return new;
  end if;

  if old.status = 'approved' and new.status = 'closed' then
    return new;
  end if;

  raise exception 'Invalid WarrantyClaim lifecycle transition.'
    using errcode = '23514',
          constraint = 'asset_warranty_claim_transition_invalid';
end;
$asset_warranty_claim_guard$;

create trigger asset_warranty_claim_guard_trg
before update or delete on public.asset_warranty_claims
for each row execute function public.guard_asset_warranty_claim_mutation();

create or replace function public.guard_asset_service_plan()
returns trigger
language plpgsql
as $asset_service_plan_guard$
begin
  if tg_op = 'DELETE' then
    raise exception 'ServicePlan cannot be deleted.'
      using errcode = '23514',
            constraint = 'asset_service_plan_delete_forbidden';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'active' or new.version <> 1 then
      raise exception 'New ServicePlan must start active at version 1.'
        using errcode = '23514',
              constraint = 'asset_service_plan_initial_state';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.asset_id is distinct from old.asset_id
     or new.name is distinct from old.name
     or new.schedule_kind is distinct from old.schedule_kind
     or new.first_due_on is distinct from old.first_due_on
     or new.interval_months is distinct from old.interval_months
     or new.provider_party_id is distinct from old.provider_party_id
     or new.notes is distinct from old.notes
     or new.created_at is distinct from old.created_at
     or new.created_by_user_id is distinct from old.created_by_user_id
  then
    raise exception 'ServicePlan definition is immutable; lifecycle is a separate mutation.'
      using errcode = '23514',
            constraint = 'asset_service_plan_definition_immutable';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'ServicePlan transition must advance version by one.'
      using errcode = '23514',
            constraint = 'asset_service_plan_version_step';
  end if;

  if old.status = 'active'
     and new.status in ('paused', 'ended', 'cancelled')
  then
    return new;
  end if;

  if old.status = 'paused'
     and new.status in ('active', 'ended', 'cancelled')
  then
    return new;
  end if;

  raise exception 'Invalid ServicePlan lifecycle transition.'
    using errcode = '23514',
          constraint = 'asset_service_plan_transition_invalid';
end;
$asset_service_plan_guard$;

create trigger asset_service_plan_guard_trg
before insert or update or delete on public.asset_service_plans
for each row execute function public.guard_asset_service_plan();

create or replace function public.guard_asset_service_event_insert()
returns trigger
language plpgsql
as $asset_service_event_insert_guard$
declare
  plan_asset_id uuid;
  claim_asset_id uuid;
begin
  if new.service_plan_id is not null then
    select asset_id
      into plan_asset_id
    from public.asset_service_plans
    where id = new.service_plan_id;

    if plan_asset_id is distinct from new.asset_id then
      raise exception 'ServicePlan must belong to ServiceEvent Asset.'
        using errcode = '23514',
              constraint = 'asset_service_event_plan_asset_mismatch';
    end if;
  end if;

  if new.warranty_claim_id is not null then
    select w.asset_id
      into claim_asset_id
    from public.asset_warranty_claims c
    join public.asset_warranties w on w.id = c.warranty_id
    where c.id = new.warranty_claim_id;

    if claim_asset_id is distinct from new.asset_id then
      raise exception 'WarrantyClaim must resolve to ServiceEvent Asset.'
        using errcode = '23514',
              constraint = 'asset_service_event_claim_asset_mismatch';
    end if;
  end if;

  return new;
end;
$asset_service_event_insert_guard$;

create trigger asset_service_event_insert_guard_trg
before insert on public.asset_service_events
for each row execute function public.guard_asset_service_event_insert();

create or replace function public.guard_asset_service_event_history()
returns trigger
language plpgsql
as $asset_service_event_history_guard$
begin
  raise exception 'ServiceEvent history is append-only.'
    using errcode = '23514',
          constraint = 'asset_service_event_immutable';
end;
$asset_service_event_history_guard$;

create trigger asset_service_event_history_guard_trg
before update or delete on public.asset_service_events
for each row execute function public.guard_asset_service_event_history();

create or replace function public.guard_asset_service_part_history()
returns trigger
language plpgsql
as $asset_service_part_history_guard$
begin
  raise exception 'ServicePart history is append-only.'
    using errcode = '23514',
          constraint = 'asset_service_part_immutable';
end;
$asset_service_part_history_guard$;

create trigger asset_service_part_history_guard_trg
before update or delete on public.asset_service_parts
for each row execute function public.guard_asset_service_part_history();

alter table public.asset_warranties enable row level security;
alter table public.asset_warranty_claims enable row level security;
alter table public.asset_service_plans enable row level security;
alter table public.asset_service_events enable row level security;
alter table public.asset_service_parts enable row level security;

comment on table public.asset_warranties is
  'Append-only warranty coverage for one exact physical Asset identity.';
comment on table public.asset_warranty_claims is
  'Optimistic warranty claim workflow under one immutable Warranty coverage record.';
comment on table public.asset_service_plans is
  'Expected Asset service policy/schedule; not a WorkOrder and not proof of completed work.';
comment on table public.asset_service_events is
  'Append-only historical service occurrence for one exact Asset.';
comment on table public.asset_service_parts is
  'Append-only components/consumables recorded inside one ServiceEvent; not independent Assets.';

commit;
