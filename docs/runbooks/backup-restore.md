# Backup, restore and migration rehearsal

Portfolio treats PostgreSQL as the canonical business-state database. A backup
is not considered useful merely because `pg_dump` exits successfully: recovery
must be proven against a fresh database and then exercised through the
application repository layer.

## Recovery contract

The rehearsal proves all of the following in one run:

1. every SQL migration in `supabase/migrations` applies from an empty database;
2. a production-like canonical fixture is created;
3. the database is exported as a custom-format PostgreSQL dump;
4. the source database is forcibly deleted before the restore database is created;
5. the dump is restored into a fresh empty database;
6. migration files and the dump are SHA-256 checked;
7. restored primary keys, parent relations, constraints, temporal final state,
   document hash/size and provider-neutral storage reference are verified;
8. restored database security state is verified: RLS coverage, browser-role
   relation/sequence/function/schema privileges, SECURITY DEFINER surface and
   `unit_business_events` security-invoker mode;
9. the restored database is read through `PostgresPortfolioRepository` and
   `PostgresDocumentRepository`.

The source deletion is deliberate. It prevents a false-green rehearsal that
accidentally reads the original database after "restore".

## Binary boundary

Database recovery preserves `DocumentVersion` identity and its canonical
storage reference:

- provider
- object ID
- object key
- byte size
- SHA-256

The custom-format dump preserves database object ACLs. Ownership is deliberately
not restored (`--no-owner`) so recovery can target a different database owner,
but privilege revocations such as the #39 browser-role lockdown remain part of
the recovered database state.

`pg_dump` is a database-level backup and does not recreate cluster-global
roles. Required destination roles must exist before restore. The rehearsal
creates the portable `anon` and `authenticated` roles before loading the
dump; platform/provider roles remain a deployment concern.

The PostgreSQL dump does **not** replicate the Google Drive binary bytes. Binary
provider disaster recovery is a separate operational concern; this gate proves
that database recovery does not mutate or lose the reference required to locate
and verify the canonical binary.

## Run locally

A PostgreSQL 17 server, `psql`, pnpm and either PostgreSQL 17 client tools or
Docker are required.

~~~bash
pnpm recovery:rehearse
~~~

By default the rehearsal creates and later removes:

~~~text
portfolio_recovery_source
portfolio_recovery_restore
~~~

Useful overrides:

~~~bash
RECOVERY_SERVER_URL=postgresql://postgres:postgres@localhost:5432
RECOVERY_SOURCE_DB=portfolio_recovery_source
RECOVERY_RESTORE_DB=portfolio_recovery_restore
RECOVERY_KEEP_DATABASES=1
RECOVERY_USE_DOCKER_TOOLS=1
RECOVERY_PG_IMAGE=postgres:17
pnpm recovery:rehearse
~~~

Generated artifacts are written under `.artifacts/recovery/` and are ignored
by Git. They include the custom-format dump, dump checksum, migration checksums
and a small manifest with source commit/server metadata.

## CI gate

CI runs the rehearsal after the normal PostgreSQL integration suite. The CI
path deliberately uses PostgreSQL 17 dump/restore tooling so the client major
version matches the test server.

A green recovery gate therefore means:

~~~text
migrations from zero
→ canonical fixture
→ backup
→ destroy source
→ fresh database
→ restore
→ business + security integrity verification
→ repository smoke read
~~~

It does not mean production scheduling, retention, off-site replication, PITR,
or Google Drive binary replication are configured. Those belong to deployment
and operations hardening.
