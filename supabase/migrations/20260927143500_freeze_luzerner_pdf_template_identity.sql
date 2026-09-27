begin;

alter table public.lease_agreement_luzerner_pdf_snapshots
  add column template_code text not null default 'lu-2020',
  add column template_revision integer not null default 1;

alter table public.lease_agreement_luzerner_pdf_snapshots
  alter column template_code drop default,
  alter column template_revision drop default,
  add constraint lease_agreement_luzerner_pdf_snapshots_template_code_nonempty
    check (length(btrim(template_code)) > 0),
  add constraint lease_agreement_luzerner_pdf_snapshots_template_revision_positive
    check (template_revision >= 1);

comment on column public.lease_agreement_luzerner_pdf_snapshots.template_code is
  'Frozen legal PDF template family selected when the Agreement was signed.';

comment on column public.lease_agreement_luzerner_pdf_snapshots.template_revision is
  'Frozen renderer/layout revision that passed renderability preflight before signing.';

commit;
