# Production binary backup and disaster recovery

## Purpose

Portfolio PostgreSQL backup preserves immutable DocumentVersion metadata and storage references, but Google Drive contains the actual binary bytes. This runbook adds an independent secondary copy of those bytes and a supported way to relocate recovered bytes without rewriting immutable DocumentVersion evidence.

The core identity remains:

~~~text
DocumentVersionId
+ byteSize
+ SHA-256
~~~

A Google Drive file ID is only an infrastructure locator.

## Recovery model

Storage recovery is append-only:

~~~text
DocumentVersion
  immutable content identity
        |
        +-- original storage locator (generation 0)
        |
        +-- relocation generation 1
        |
        +-- relocation generation 2
        ...
~~~

`document_versions.storage_*` is never rewritten. Recovery/migration appends `document_version_storage_relocations`; normal reads resolve the highest generation.

Every relocation records the exact previous locator. PostgreSQL rejects skipped generations, a previous locator that is not the current locator, a changed stable Portfolio object key, and update/delete of relocation history. Application recovery also uses compare-and-swap against the current locator.

## Secondary backup source of truth

The database, not a Google Drive folder listing, defines the required binary set.

For each current Google Drive-backed DocumentVersion, the backup inventory contains DocumentVersionId, DocumentId, fileName, mimeType, byteSize, SHA-256, current storage provider, current objectId and stable objectKey. The inventory resolves the latest relocation before reading Drive.

For every item, the workflow requires all of these to agree:

~~~text
canonical DB locator
↔ Drive object ID
↔ configured Portfolio folder
↔ Drive appProperties.portfolioObjectKey
↔ Drive size
↔ Drive SHA-256
↔ downloaded byte count
↔ downloaded byte SHA-256
~~~

Any mismatch refuses the backup.

## Schedule and retention

`.github/workflows/production-binary-backup.yml` runs daily at 03:17 UTC and can be dispatched manually.

Accepted artifact:

~~~text
portfolio-binaries.tar.enc
manifest.txt
~~~

Retention is 14 days. Each accepted run is a full snapshot of every current canonical Google Drive binary, so an old immutable DocumentVersion remains present in every later successful snapshot; this is not a 14-day document-history limit.

At the current MVP scale this full-snapshot model is intentionally preferred over incremental complexity. Capacity must be revisited before binary volume makes a daily full copy operationally expensive.

## Artifact acceptance gate

A binary artifact is accepted only after:

~~~text
read canonical relocation-aware DB inventory
→ fetch exact Drive metadata by canonical objectId
→ verify folder + objectKey + size + SHA-256
→ download exact bytes
→ rehash downloaded bytes
→ write snapshot manifest + objects
→ tar snapshot
→ extract tar into a fresh verification directory
→ re-read every object
→ exact size/hash/count/total-byte verification
→ AES-256-CBC + PBKDF2 encryption
→ delete plaintext snapshot, tar and canonical inventory
→ upload encrypted artifact
~~~

A copy that cannot survive the local archive round-trip is not accepted as a backup.

## Required GitHub Actions secrets

The workflow reuses:

~~~text
PORTFOLIO_PRODUCTION_DB_URL
PORTFOLIO_BACKUP_ENCRYPTION_KEY
~~~

and additionally needs the same dedicated Google OAuth credentials used by the production API:

~~~text
PORTFOLIO_GOOGLE_DRIVE_FOLDER_ID
PORTFOLIO_GOOGLE_CLIENT_ID
PORTFOLIO_GOOGLE_CLIENT_SECRET
PORTFOLIO_GOOGLE_REFRESH_TOKEN
~~~

Never print these values into Actions logs.

## Restore and relocation

Recovery bytes must never be made canonical merely because an upload succeeded.

The supported application operation is `recoverDocumentVersionBinary(...)`.

For one DocumentVersion it performs:

~~~text
load immutable DocumentVersion
→ assert expected current locator still wins
→ enforce buffered binary ceiling
→ hash backup bytes before provider I/O
→ require exact immutable byteSize + SHA-256
→ FileStoragePort.put using the SAME stable objectKey
→ provider verifies resulting size/hash/objectKey
→ append storage relocation with CAS
→ normal reads resolve the new locator
~~~

This deliberately reuses the existing Google Drive adapter's idempotent/resumable upload and ambiguous-outcome handling instead of maintaining a second Drive write protocol.

If the provider upload succeeds but canonical relocation cannot be confirmed, the recovered object is preserved and the operation fails with `DOCUMENT_STORAGE_RECONCILIATION_REQUIRED`. Do not delete it until the canonical winner is independently proven.

### Disaster target

For loss of the primary Portfolio Drive folder/provider location:

1. obtain a known-good encrypted binary artifact and the matching database recovery point as closely as possible;
2. decrypt and extract the binary snapshot;
3. verify the snapshot manifest and every object hash;
4. provision a replacement storage location accessible only to the dedicated Portfolio account;
5. set the recovery Google Drive folder and OAuth environment variables;
6. run `pnpm binary-backup:restore /path/to/portfolio-binaries.tar.enc`;
7. verify application binary read by DocumentVersionId;
8. preserve the original locator and relocation history as evidence.

Do not update `document_versions.storage_object_id` manually.

There is intentionally no browser/API endpoint for this operation. It is an operator-only disaster-recovery capability.

### Executable operator command

The committed recovery entrypoint is:

~~~text
pnpm binary-backup:restore /path/to/portfolio-binaries.tar.enc
~~~

Required environment:

~~~text
PORTFOLIO_PRODUCTION_DB_URL
PORTFOLIO_BACKUP_ENCRYPTION_KEY
PORTFOLIO_RECOVERY_GOOGLE_DRIVE_FOLDER_ID
PORTFOLIO_GOOGLE_CLIENT_ID
PORTFOLIO_GOOGLE_CLIENT_SECRET
PORTFOLIO_GOOGLE_REFRESH_TOKEN
~~~

The command performs the full operator path:

~~~text
decrypt encrypted artifact into a temporary directory
→ extract snapshot
→ verify manifest + every archived byte
→ build the committed restore operator
→ load canonical DocumentVersions through PostgresDocumentRepository
→ require manifest version/document/size/hash/objectKey parity
→ read current canonical locator
→ recoverDocumentVersionBinary()
→ verify persisted latest locator
→ read replacement bytes back through FileStoragePort
→ rehash final read
→ remove temporary plaintext files
~~~

The command is restartable. It resolves the current locator for every item on every run. If an earlier run already restored an object, the stable objectKey causes the recovery storage adapter to reuse the verified object; `recoverDocumentVersionBinary()` then observes that the replacement is already canonical and does not append a duplicate relocation generation.

A partial failure at item 83 therefore does not require manual rollback of items 1–82; rerun the same command after resolving the failure.

## Deployment order

PR #58 introduces a schema dependency used by every document binary read. Production order is therefore:

~~~text
apply document storage relocation migration
→ deploy exact API release
→ /health/live
→ /health/ready
→ normal document binary read
→ configure binary-backup Actions secrets
→ manual Production Binary Backup run
~~~

Readiness touches `document_version_storage_relocations`, so code cannot be considered ready if the migration is absent.

## Hosted acceptance — completed 2026-09-24

Repository CI proves the recovery invariants, archive verifier, executable restore-operator build, and a complete real-PostgreSQL restartability scenario. The production path is additionally **HOSTED-PROVEN**.

The hosted rehearsal used exact deployed release:

~~~text
cafa2462f0031c9dcded6c7e5334dbb06e2e42fd
~~~

Production evidence:

~~~text
document storage relocation migration applied
→ exact API release deployed and /health/ready PASS
→ real Production Binary Backup read 4 canonical Drive objects / 10,008 bytes
→ encrypted GitHub Actions artifact created
→ artifact decrypted locally with the retained backup encryption key
→ full snapshot verification PASS
→ smoke DocumentVersion 25314596-2a3f-4be1-aa62-5a93e5af18bc restored into a separate recovery Drive folder
→ relocation generation 1 appended
→ normal production API GET /document-versions/<id>/content returned HTTP 200
→ 29 downloaded bytes matched immutable SHA-256 exactly
→ smoke DocumentVersion relocated back to the original primary object
→ relocation generation 2 appended
→ post-rehearsal Production Binary Backup PASS
~~~

Immutable smoke identity remained:

~~~text
DocumentVersionId:
25314596-2a3f-4be1-aa62-5a93e5af18bc

byteSize:
29

SHA-256:
eeba7c78359b536a7a62f8eabae6e9dd9cb90274e8c1a262198b5cbecbf5fccf

stable objectKey:
document-version:25314596-2a3f-4be1-aa62-5a93e5af18bc
~~~

The append-only recovery history records:

~~~text
generation 0: original primary Drive object
generation 1: primary → separate recovery object
generation 2: recovery → original verified primary object
~~~

The post-rehearsal backup succeeded with the canonical locator back in the configured primary Portfolio Drive folder, proving that the recovery exercise did not leave scheduled backup state broken.

Never delete relocation history.

## Failure boundaries

This backup is independent of both Supabase database storage and Google Drive object storage because accepted encrypted bytes live in GitHub Actions artifact storage.

It does not protect against simultaneous loss of GitHub Actions artifacts and Google Drive. For the current MVP this is the accepted secondary-provider boundary; a longer-retention object store can replace the artifact destination later without changing DocumentVersion or relocation semantics.
