\set ON_ERROR_STOP on

do $verify$
declare
  property_count integer;
  unit_count integer;
  version_count integer;
  broken_unit_fk integer;
  invalid_constraints integer;
  tables_without_rls integer;
  exposed_relations integer;
  exposed_sequences integer;
  exposed_functions integer;
  security_definer_functions integer;
  version_row record;
begin
  select count(*) into property_count
  from public.properties
  where id = '11111111-1111-4111-8111-111111111111'
    and code = 'RECOVERY-PROP-1'
    and name = 'Recovery Rehearsal Property';

  if property_count <> 1 then
    raise exception 'Recovery property identity was not preserved.';
  end if;

  select count(*) into unit_count
  from public.units
  where id = '22222222-2222-4222-8222-222222222222'
    and property_id = '11111111-1111-4111-8111-111111111111'
    and area_m2 = 72.50
    and rooms = 3.50;

  if unit_count <> 1 then
    raise exception 'Recovery unit identity or parent relation was not preserved.';
  end if;

  select count(*) into broken_unit_fk
  from public.units u
  left join public.properties p on p.id = u.property_id
  where p.id is null;

  if broken_unit_fk <> 0 then
    raise exception 'Restore contains units with missing property parents.';
  end if;

  select *
  into version_row
  from public.document_versions
  where id = '44444444-4444-4444-8444-444444444444';

  get diagnostics version_count = row_count;
  if version_count <> 1 then
    raise exception 'Recovery DocumentVersion identity was not preserved.';
  end if;

  if version_row.document_id <> '33333333-3333-4333-8333-333333333333'::uuid
     or version_row.version_number <> 1
     or version_row.byte_size <> 4096
     or version_row.sha256 <> 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
     or version_row.status <> 'final'
     or version_row.storage_provider <> 'google-drive'
     or version_row.storage_object_id <> 'drive-recovery-object-1'
     or version_row.storage_object_key <> 'document-version:44444444-4444-4444-8444-444444444444'
  then
    raise exception 'Recovery DocumentVersion content/storage identity changed.';
  end if;

  select count(*) into invalid_constraints
  from pg_constraint
  where connamespace = 'public'::regnamespace
    and contype in ('c', 'f', 'u')
    and not convalidated;

  if invalid_constraints <> 0 then
    raise exception 'Restore contains unvalidated public constraints.';
  end if;

  select count(*) into tables_without_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;

  if tables_without_rls <> 0 then
    raise exception 'Restore contains public tables without RLS enabled.';
  end if;

  select count(*) into exposed_relations
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm')
    and (
      has_table_privilege('public', c.oid, 'SELECT')
      or has_table_privilege('public', c.oid, 'INSERT')
      or has_table_privilege('public', c.oid, 'UPDATE')
      or has_table_privilege('public', c.oid, 'DELETE')
      or has_table_privilege('public', c.oid, 'TRUNCATE')
      or has_table_privilege('public', c.oid, 'REFERENCES')
      or has_table_privilege('public', c.oid, 'TRIGGER')
      or has_table_privilege('anon', c.oid, 'SELECT')
      or has_table_privilege('anon', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'UPDATE')
      or has_table_privilege('anon', c.oid, 'DELETE')
      or has_table_privilege('anon', c.oid, 'TRUNCATE')
      or has_table_privilege('anon', c.oid, 'REFERENCES')
      or has_table_privilege('anon', c.oid, 'TRIGGER')
      or has_table_privilege('authenticated', c.oid, 'SELECT')
      or has_table_privilege('authenticated', c.oid, 'INSERT')
      or has_table_privilege('authenticated', c.oid, 'UPDATE')
      or has_table_privilege('authenticated', c.oid, 'DELETE')
      or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
      or has_table_privilege('authenticated', c.oid, 'REFERENCES')
      or has_table_privilege('authenticated', c.oid, 'TRIGGER')
    );

  if exposed_relations <> 0 then
    raise exception 'Restore widened public relation privileges.';
  end if;

  select count(*) into exposed_sequences
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'S'
    and (
      has_sequence_privilege('public', c.oid, 'USAGE')
      or has_sequence_privilege('public', c.oid, 'SELECT')
      or has_sequence_privilege('public', c.oid, 'UPDATE')
      or has_sequence_privilege('anon', c.oid, 'USAGE')
      or has_sequence_privilege('anon', c.oid, 'SELECT')
      or has_sequence_privilege('anon', c.oid, 'UPDATE')
      or has_sequence_privilege('authenticated', c.oid, 'USAGE')
      or has_sequence_privilege('authenticated', c.oid, 'SELECT')
      or has_sequence_privilege('authenticated', c.oid, 'UPDATE')
    );

  if exposed_sequences <> 0 then
    raise exception 'Restore widened public sequence privileges.';
  end if;

  select count(*) into exposed_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      has_function_privilege('public', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );

  if exposed_functions <> 0 then
    raise exception 'Restore widened public function EXECUTE privileges.';
  end if;

  if has_schema_privilege('public', 'public', 'CREATE')
     or has_schema_privilege('anon', 'public', 'CREATE')
     or has_schema_privilege('authenticated', 'public', 'CREATE')
  then
    raise exception 'Restore widened CREATE privilege on schema public.';
  end if;

  select count(*) into security_definer_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef;

  if security_definer_functions <> 0 then
    raise exception 'Restore contains public SECURITY DEFINER functions.';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'unit_business_events'
      and c.relkind = 'v'
      and coalesce(c.reloptions @> array['security_invoker=true'], false)
  ) then
    raise exception 'unit_business_events did not retain security_invoker=true.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.reporting_unit_snapshots(date)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'authenticated regained EXECUTE on reporting_unit_snapshots(date).';
  end if;
end
$verify$;
