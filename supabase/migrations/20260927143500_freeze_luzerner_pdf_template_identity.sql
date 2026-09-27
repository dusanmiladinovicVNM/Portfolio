begin;

alter table public.lease_agreement_luzerner_pdf_snapshots
  add column template_code text,
  add column template_revision integer;

update public.lease_agreement_luzerner_pdf_snapshots
set
  template_code = 'lu-2020',
  template_revision = 1
where template_code is null
   or template_revision is null;

alter table public.lease_agreement_luzerner_pdf_snapshots
  alter column template_code set not null,
  alter column template_revision set not null,
  add constraint lease_agreement_luzerner_pdf_snapshots_template_code_nonempty
    check (length(btrim(template_code)) > 0),
  add constraint lease_agreement_luzerner_pdf_snapshots_template_revision_positive
    check (template_revision >= 1);

comment on column public.lease_agreement_luzerner_pdf_snapshots.template_code is
  'Frozen legal PDF template family selected when the Agreement was signed.';

comment on column public.lease_agreement_luzerner_pdf_snapshots.template_revision is
  'Frozen renderer/layout revision that passed renderability preflight before signing.';

commit;
