begin;

alter table public.lease_agreement_luzerner_forms
  add constraint lease_agreement_luzerner_forms_agreement_revision_uq
  unique (agreement_id, revision);

create table public.lease_agreement_luzerner_pdf_snapshots (
  agreement_id uuid primary key
    references public.lease_agreements(id) on delete restrict,
  form_revision integer not null,
  content jsonb not null,
  created_at timestamptz not null default now(),

  constraint lease_agreement_luzerner_pdf_snapshots_form_revision_positive
    check (form_revision >= 1),
  constraint lease_agreement_luzerner_pdf_snapshots_content_object
    check (jsonb_typeof(content) = 'object'),
  constraint lease_agreement_luzerner_pdf_snapshots_form_revision_fk
    foreign key (agreement_id, form_revision)
    references public.lease_agreement_luzerner_forms (
      agreement_id,
      revision
    )
    on delete restrict
);

create or replace function public.assert_luzerner_pdf_snapshot_signed_and_immutable()
returns trigger
language plpgsql
as $$
declare
  agreement_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Signed Luzerner PDF presentation snapshots are immutable.'
      using errcode = '23514',
            constraint = 'lease_agreement_luzerner_pdf_snapshot_immutable';
  end if;

  select status
  into agreement_status
  from public.lease_agreements
  where id = new.agreement_id
  for share;

  if agreement_status is null then
    raise exception 'Lease agreement not found.'
      using errcode = '23503',
            constraint = 'lease_agreement_luzerner_pdf_snapshot_agreement_fk';
  end if;

  if agreement_status not in ('signed', 'superseded', 'terminated') then
    raise exception 'Luzerner PDF presentation snapshot requires a signed legal Agreement.'
      using errcode = '23514',
            constraint = 'lease_agreement_luzerner_pdf_snapshot_signed_only';
  end if;

  return new;
end;
$$;

create trigger lease_agreement_luzerner_pdf_snapshots_guard_trg
before insert or update or delete
on public.lease_agreement_luzerner_pdf_snapshots
for each row
execute function public.assert_luzerner_pdf_snapshot_signed_and_immutable();

alter table public.lease_agreement_luzerner_pdf_snapshots enable row level security;

comment on table public.lease_agreement_luzerner_pdf_snapshots is
  'Immutable presentation identity captured atomically when a Luzerner Agreement is signed. Final PDF generation must use this snapshot rather than mutable Property, Unit or Party master data.';

comment on column public.lease_agreement_luzerner_pdf_snapshots.content is
  'Template-specific presentation facts only; fixed legal wording remains renderer/template-owned and the canonical form remains in lease_agreement_luzerner_forms.';

commit;
