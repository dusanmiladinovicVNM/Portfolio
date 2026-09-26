begin;

alter table public.tenancy_term_versions
  drop constraint tenancy_term_versions_billing_frequency_valid;

alter table public.tenancy_term_versions
  add constraint tenancy_term_versions_billing_frequency_valid
  check (billing_frequency in ('monthly', 'quarterly', 'semiannual', 'yearly'));

commit;
