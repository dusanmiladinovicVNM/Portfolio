begin;

alter table public.tenancy_term_versions
  alter column notice_period_tenant_days drop not null,
  alter column notice_period_landlord_days drop not null;

comment on column public.tenancy_term_versions.notice_period_tenant_days is
  'Day-based tenant notice period when this projection owns that fact; NULL when a contract-specific representation (for example calendar months) is authoritative.';

comment on column public.tenancy_term_versions.notice_period_landlord_days is
  'Day-based landlord notice period when this projection owns that fact; NULL when a contract-specific representation (for example calendar months) is authoritative.';

commit;
