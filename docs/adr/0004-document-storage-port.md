# ADR 0004: Binary storage is behind FileStoragePort

**Status:** Accepted

## Decision

Document metadata/versioning belongs to Portfolio; binary bytes live in an external storage provider accessed through a port.

Google Drive is the first adapter because it is already available internally.

## Consequences

The domain stores stable document/version identities, hashes and storage keys. It does not use Google Drive file IDs as business primary keys.

A future S3-compatible implementation can replace Google Drive without changing contract, tenancy, inspection or asset domain models.
