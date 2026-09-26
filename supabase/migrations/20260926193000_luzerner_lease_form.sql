begin;

create table public.lease_agreement_luzerner_forms (
  agreement_id uuid primary key
    references public.lease_agreements(id) on delete restrict,
  template_code text not null,
  revision integer not null default 1,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lease_agreement_luzerner_forms_template_code_valid
    check (template_code = 'lu-2020'),
  constraint lease_agreement_luzerner_forms_revision_positive
    check (revision >= 1),
  constraint lease_agreement_luzerner_forms_content_object
    check (jsonb_typeof(content) = 'object')
);

create or replace function public.assert_lease_agreement_luzerner_form_draft_only()
returns trigger
language plpgsql
as $$
declare
  target_agreement_id uuid;
  agreement_status text;
begin
  target_agreement_id := case
    when tg_op = 'DELETE' then old.agreement_id
    else new.agreement_id
  end;

  select status
  into agreement_status
  from public.lease_agreements
  where id = target_agreement_id
  for key share;

  if agreement_status is null then
    raise exception 'Lease agreement not found.'
      using errcode = '23503',
            constraint = 'lease_agreement_luzerner_form_agreement_fk';
  end if;

  if agreement_status <> 'draft' then
    raise exception 'Luzerner lease form is immutable once its agreement leaves draft.'
      using errcode = '23514',
            constraint = 'lease_agreement_luzerner_form_draft_only';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger lease_agreement_luzerner_forms_draft_only_trg
before insert or update or delete on public.lease_agreement_luzerner_forms
for each row
execute function public.assert_lease_agreement_luzerner_form_draft_only();

alter table public.lease_agreement_luzerner_forms enable row level security;

comment on table public.lease_agreement_luzerner_forms is
  'Mutable Luzerner Mietvertrag 2020 authoring state while the owning LeaseAgreement is draft; immutable after signing/cancellation.';
comment on column public.lease_agreement_luzerner_forms.content is
  'Validated template-specific form data. Fixed legal wording is renderer/template-owned and is not duplicated into business rows.';

commit;
