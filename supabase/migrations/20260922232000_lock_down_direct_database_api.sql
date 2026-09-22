begin;

-- Portfolio's business API boundary is the application/HTTP layer.
-- Supabase anon/authenticated roles must not be able to bypass it through
-- PostgREST table/view access or public RPC execution.

-- Views created by a privileged owner can otherwise bypass underlying RLS.
-- Keep the timeline projection fail-closed even if SELECT is accidentally
-- granted in the future.
alter view public.unit_business_events
  set (security_invoker = true);

-- Reporting functions are deliberately application-internal projections.
-- Make their execution mode explicit before removing direct API execution.
alter function public.reporting_unit_snapshots(date) security invoker;
alter function public.reporting_unit_cost_summaries(date) security invoker;
alter function public.reporting_portfolio_cost_summaries(date) security invoker;
alter function public.reporting_property_summaries(date) security invoker;

-- PUBLIC is the PostgreSQL default grantee for function EXECUTE. Remove the
-- generic surface even on non-Supabase PostgreSQL deployments.
revoke all privileges on all tables in schema public from public;
revoke all privileges on all sequences in schema public from public;
revoke execute on all functions in schema public from public;
revoke create on schema public from public;

-- Supabase roles do not exist in the portable PostgreSQL CI image, so apply
-- provider-specific revocation only when those roles are present.
do $security_lockdown$
begin
  if to_regrole('anon') is not null then
    execute 'revoke all privileges on all tables in schema public from anon';
    execute 'revoke all privileges on all sequences in schema public from anon';
    execute 'revoke execute on all functions in schema public from anon';
    execute 'revoke create on schema public from anon';
  end if;

  if to_regrole('authenticated') is not null then
    execute 'revoke all privileges on all tables in schema public from authenticated';
    execute 'revoke all privileges on all sequences in schema public from authenticated';
    execute 'revoke execute on all functions in schema public from authenticated';
    execute 'revoke create on schema public from authenticated';
  end if;
end
$security_lockdown$;

-- Keep future Portfolio objects closed by default as well. Application-owned
-- PostgreSQL connections continue to use owner privileges; browser identities
-- must go through the authenticated Portfolio HTTP boundary.
alter default privileges in schema public
  revoke all privileges on tables from public;
alter default privileges in schema public
  revoke all privileges on sequences from public;
alter default privileges in schema public
  revoke execute on functions from public;

do $security_default_lockdown$
begin
  if to_regrole('anon') is not null then
    execute 'alter default privileges in schema public revoke all privileges on tables from anon';
    execute 'alter default privileges in schema public revoke all privileges on sequences from anon';
    execute 'alter default privileges in schema public revoke execute on functions from anon';
  end if;

  if to_regrole('authenticated') is not null then
    execute 'alter default privileges in schema public revoke all privileges on tables from authenticated';
    execute 'alter default privileges in schema public revoke all privileges on sequences from authenticated';
    execute 'alter default privileges in schema public revoke execute on functions from authenticated';
  end if;
end
$security_default_lockdown$;

comment on view public.unit_business_events is
  'Application-internal Unit timeline projection. security_invoker + revoked direct browser-role privileges prevent PostgREST/RLS bypass.';

commit;
