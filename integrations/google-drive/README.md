# Google Drive FileStorage adapter

This package implements the provider-neutral `FileStoragePort` using Google Drive API v3.

## Boundary

Portfolio business entities never use a Google Drive file ID as their identity.

The adapter receives a stable application `objectKey` (currently the DocumentVersion UUID namespace), stores it in private Drive `appProperties`, and returns an opaque storage reference:

```text
DocumentVersionId     business/evidence identity
        ↓
FileStoragePort objectKey
        ↓
Google Drive appProperties.portfolioObjectKey
        ↓
Google Drive file id  infrastructure locator only
```

## Idempotency and concurrency

Before creating a Drive file, the adapter searches the configured folder for the same `portfolioObjectKey`.

- same key + same byte size + SHA-256 → return the existing file
- same key + different content identity → fail loudly
- multiple files with the same key → fail loudly for reconciliation

Drive `appProperties` are searchable metadata, not a uniqueness constraint.
Concurrent same-`DocumentVersionId` uploads are therefore resolved by the
application/DB layer, not by choosing a Drive file heuristically:

```
both writers may create storage
→ one PostgreSQL DocumentVersion/storage reference wins
→ loser verifies exact canonical storage metadata
→ only then removes its own newly-created Drive object
```

This preserves PostgreSQL as the canonical winner and prevents provider-side
cleanup from deleting a file that another request already registered.

## Buffered production ceiling

The MVP adapter is intentionally bounded-buffered at 16 MiB by default.

- oversized writes are rejected before hashing or network I/O;
- download metadata is checked before media fetch;
- media bodies are consumed through a bounded reader and re-hashed;
- writes use a Drive resumable session for the full supported size range;
- because Portfolio already bounds content to 16 MiB, the normal path uploads
  the complete binary in one PUT;
- an ambiguous network/5xx outcome is reconciled against that same session with
  `Content-Range: bytes */TOTAL`;
- completed sessions return canonical metadata, while `308` resumes only the
  unconfirmed suffix reported by Drive's `Range` header;
- no second Drive create is initiated while the first session outcome is
  indeterminate.

Chunked transfer remains unnecessary on the normal path; resumable suffix retry
is used only to reconcile an interrupted/ambiguous write without changing
`DocumentVersion` identity or `FileStoragePort` business semantics.

## Shared Drives

Requests include `supportsAllDrives=true`; list/search also includes `includeItemsFromAllDrives=true`.

## Authentication

OAuth/service-account token acquisition is deliberately outside this adapter.

The host supplies a `GoogleDriveAccessTokenProvider`, keeping credentials and Supabase/Fastify hosting details out of the storage contract.
