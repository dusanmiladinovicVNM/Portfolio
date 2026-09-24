# Production backup and restore contract

## Scope

Portfolio recovery has two proof layers:

1. `pnpm recovery:rehearse` proves the repository can create, destroy, restore and continue from a synthetic PostgreSQL backup.
2. The `Production Backup` workflow proves a logical backup taken from the real hosted Portfolio database can be restored into a fresh PostgreSQL 17 database and continue through the canonical application write path before the backup is accepted.

The production backup workflow is intentionally independent from Supabase managed backups. Supabase documents daily managed backups for paid plans and recommends regular logical exports for Free projects. Portfolio therefore keeps an additional off-Supabase copy even when managed backups are available.

## Recovery policy

~~~text
schedule:          daily at 02:17 UTC
retention:         14 days
backup source:     production PostgreSQL
restore target:    fresh PostgreSQL 17 database
artifact location: private GitHub Actions artifact
encryption:        AES-256-CBC + PBKDF2 before upload
~~~

This provides one automated logical recovery point per day. It is not PITR and does not claim a sub-day RPO.

## Backup contents

The primary encrypted backup contains Portfolio-owned `public` **data**. Schema truth remains the versioned repository migrations. Recovery first applies the exact migrations recorded with the backup, then imports production data. The data includes canonical business records, internal Portfolio users/identity mappings, document/version metadata and Google Drive storage references. Transient `api_rate_limit_buckets` rows are deliberately excluded because admission counters are operational state, not recovery truth.

Supabase Auth is a managed schema and is not Portfolio domain truth. A separate encrypted data-only recovery asset is captured for `auth.users` and `auth.identities`. It is not restored by the plain PostgreSQL-17 application smoke because a fresh plain PostgreSQL database does not contain Supabase's managed Auth schema. In a disaster migration to a new Supabase project, Auth must be restored/migrated through Supabase's supported Auth migration procedure. Existing JWT sessions are not recovery truth and users may have to sign in again.

Google Drive binary bytes are **not** included in this database backup. The database backup preserves immutable `DocumentVersion` hashes, sizes and Drive object references. A byte-for-byte secondary binary store remains a separate production decision and is **NOT DONE**.

## Acceptance gate

A production backup is uploadable only after:

~~~text
production public data dump succeeds
→ repository migration hashes captured
→ exact source row count captured for every recoverable public table
→ apply canonical migrations to fresh PostgreSQL 17 database
→ restore production data with triggers disabled during import
→ exact restored row count matches every source table
→ canonical repositories can read restored identity/binary references
→ createPropertyCommand succeeds against restored DB
→ plaintext recovery assets are encrypted
→ plaintext recovery assets are removed
→ encrypted artifact is uploaded
~~~

A dump that cannot be restored is not accepted as a backup.

## Required GitHub Actions secrets

Configure these repository Actions secrets:

~~~text
PORTFOLIO_PRODUCTION_DB_URL
PORTFOLIO_BACKUP_ENCRYPTION_KEY
~~~

`PORTFOLIO_PRODUCTION_DB_URL` must be a PostgreSQL connection string suitable for logical backup, preferably the Supabase Session pooler or direct connection documented for migration/backup work.

`PORTFOLIO_BACKUP_ENCRYPTION_KEY` must be a long random secret stored outside the repository as well. Losing it makes the encrypted artifacts unusable. Never print either secret into workflow output.

## Restore procedure

For a database-only disaster or verification exercise:

1. download one encrypted artifact;
2. verify the manifest and expected files;
3. decrypt `portfolio-public.dump.enc`, `source-row-counts.tsv.enc`, and `migrations.sha256.enc`;
4. check out the recorded `code_sha` and verify its migration hashes;
5. apply those canonical migrations to a fresh PostgreSQL 17 target;
6. restore data with `pg_restore --data-only --disable-triggers --no-owner --no-acl --exit-on-error`;
7. compare exact source/restored table counts;
8. run the production restore application smoke;
9. only then consider application cutover.

For a complete Supabase-project disaster, additionally recreate the target project configuration, migrate managed Auth recovery data using Supabase-supported procedures, redeploy the exact application release, restore Edge Function secrets, and update public frontend configuration if the project URL changes.

## Failure boundaries

This backup survives loss/corruption of the Supabase database because the accepted encrypted artifact lives outside Supabase.

It does not yet survive simultaneous loss of the primary Google Drive folder/provider. Portfolio currently stores binary bytes in Google Drive; only their canonical hashes/metadata are present in PostgreSQL. A secondary binary provider is therefore still an explicit production gap.

It also does not replace Supabase managed backup/PITR when those features are enabled. Managed backup/PITR and this logical export cover different failure modes and should be treated as complementary.
