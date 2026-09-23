\set ON_ERROR_STOP on

do $verify$
declare
  property_count integer;
  unit_count integer;
  version_count integer;
  broken_unit_fk integer;
  invalid_constraints integer;
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
end
$verify$;
