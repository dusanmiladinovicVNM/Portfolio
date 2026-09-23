begin;

-- PostgreSQL grants EXECUTE on newly-created functions to PUBLIC by default.
-- The earlier per-schema default-privilege revoke does not cancel that global
-- default. Remove the global function EXECUTE default for the migration owner
-- so future public-schema functions remain application-internal unless granted
-- explicitly.
alter default privileges
  revoke execute on functions from public;

do $browser_function_defaults$
begin
  if to_regrole('anon') is not null then
    execute 'alter default privileges revoke execute on functions from anon';
  end if;

  if to_regrole('authenticated') is not null then
    execute 'alter default privileges revoke execute on functions from authenticated';
  end if;
end
$browser_function_defaults$;

commit;
