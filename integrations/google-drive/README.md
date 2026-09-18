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

## Idempotency

Before creating a Drive file, the adapter searches the configured folder for the same `portfolioObjectKey`.

- same key + same SHA-256 → return the existing file
- same key + different SHA-256 → fail loudly
- multiple files with the same key → fail loudly for reconciliation

This makes an application retry safe after an uncertain upload response.

## Shared Drives

Requests include `supportsAllDrives=true`; list/search also includes `includeItemsFromAllDrives=true`.

## Authentication

OAuth/service-account token acquisition is deliberately outside this adapter.

The host supplies a `GoogleDriveAccessTokenProvider`, keeping credentials and Supabase/Fastify hosting details out of the storage contract.
