begin;

create table public.luzern_lease_profiles (
  agreement_id uuid primary key
    references public.lease_agreements(id) on delete restrict,
  revision integer not null default 1,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint luzern_lease_profiles_revision_positive
    check (revision >= 1),
  constraint luzern_lease_profiles_payload_object
    check (jsonb_typeof(payload) = 'object')
);

create or replace function public.enforce_luzern_lease_profile_draft_owner()
returns trigger
language plpgsql
as $$
declare
  target_agreement_id uuid;
  target_status text;
begin
  target_agreement_id :=
    case when tg_op = 'DELETE' then old.agreement_id else new.agreement_id end;

  select status
  into target_status
  from public.lease_agreements
  where id = target_agreement_id;

  if target_status is null then
    raise exception 'Lease Agreement does not exist.'
      using errcode = '23503',
            constraint = 'luzern_lease_profiles_agreement_exists';
  end if;

  if target_status <> 'draft' then
    raise exception 'Luzerner Mietvertrag preparation is immutable after Agreement leaves draft.'
      using errcode = '23514',
            constraint = 'luzern_lease_profiles_draft_owner_required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger luzern_lease_profiles_draft_owner_trg
before insert or update or delete on public.luzern_lease_profiles
for each row
execute function public.enforce_luzern_lease_profile_draft_owner();

alter table public.luzern_lease_profiles enable row level security;

comment on table public.luzern_lease_profiles is
  'Editable preparation data for the Luzerner Mietvertrag while its Lease Agreement is draft. Frozen automatically once the Agreement leaves draft.';

commit;
