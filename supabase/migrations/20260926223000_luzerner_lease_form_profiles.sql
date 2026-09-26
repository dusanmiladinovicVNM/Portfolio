begin;

create table public.lease_agreement_luzerner_forms (
  agreement_id uuid primary key
    references public.lease_agreements(id) on delete restrict,
  template_code text not null default 'luzerner_mietvertrag_2020',
  template_document_version_id uuid
    references public.document_versions(id) on delete restrict,
  revision integer not null default 1,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lease_agreement_luzerner_forms_template_valid
    check (template_code = 'luzerner_mietvertrag_2020'),
  constraint lease_agreement_luzerner_forms_revision_positive
    check (revision > 0),
  constraint lease_agreement_luzerner_forms_data_object
    check (jsonb_typeof(data) = 'object')
);

create index lease_agreement_luzerner_forms_template_version_idx
  on public.lease_agreement_luzerner_forms(template_document_version_id)
  where template_document_version_id is not null;

alter table public.lease_agreement_luzerner_forms enable row level security;

comment on table public.lease_agreement_luzerner_forms is
  'Agreement-owned supplemental data for the licensed Luzerner Mietvertrag 2020 template. Canonical Property/Unit/Party/Tenancy/terms data stays at its native grain.';

commit;
