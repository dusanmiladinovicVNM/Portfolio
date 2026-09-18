# ADR 0015: Immutable document evidence and external storage consistency

**Status:** Accepted

## Context

Portfolio needs durable contracts, inspection evidence, invoices, warranties and photos.

The first storage adapter is Google Drive, while PostgreSQL remains canonical for business identity and relationships.

PostgreSQL and Google Drive cannot participate in one ACID transaction.

Legal evidence also requires preserving exactly what was signed even when Party master data later changes.

## Decision

Documents use three grains:

```text
Document         logical dossier
DocumentVersion  one immutable binary content identity
DocumentLink     relationship to a domain target
```

A DocumentVersion records:

- monotonically increasing version number inside its Document;
- file name and MIME type;
- byte size;
- SHA-256;
- stored/final lifecycle.

Binary content is never updated in place.

A replacement binary creates a new DocumentVersion.

## Final legal evidence

`AgreementParty` snapshots legal membership/role only.

It does not copy every mutable Party field such as current address.

The authoritative rendered snapshot for a signed instrument is therefore:

```text
signed LeaseAgreement / LeaseAmendment
        ↓ signed_original
final DocumentVersion
        ↓ SHA-256
exact stored binary
```

A `signed_original` link must point to an exact final DocumentVersion.

PostgreSQL independently verifies that the target agreement/amendment is signed and allows at most one signed_original per legal target.

## Storage identity

DocumentId and DocumentVersionId are Portfolio UUIDs.

A Google Drive file ID is only an opaque storage locator.

Changing storage provider must not change business/document identity.

## External-storage transaction protocol

There is no fake distributed transaction.

Version upload executes:

1. validate Document and allocate DocumentVersionId;
2. upload content through FileStoragePort using stable object key `document-version:<uuid>`;
3. receive provider locator, byte size and SHA-256;
4. atomically update Document version counter and insert DocumentVersion in PostgreSQL;
5. if PostgreSQL registration fails, issue compensating storage delete.

If compensation also fails, the command raises an explicit reconciliation error rather than pretending rollback succeeded.

The stable object key makes upload retries idempotent when the storage adapter supports lookup by object key.

## Google Drive adapter

The first adapter stores the Portfolio object key in private Drive `appProperties`.

Before creation it searches the configured folder:

- same object key + same SHA-256: reuse existing file;
- same object key + different SHA-256: fail;
- duplicate matches: fail for reconciliation.

Shared Drive compatible requests use `supportsAllDrives=true`.

Google authentication is injected through an access-token provider and is not part of the application/domain contract.

## Consequences

- signed evidence survives later Party master-data edits;
- no provider ID leaks into domain identity;
- DB and storage failure modes are explicit;
- Drive can later be replaced by S3/R2 without changing document commands or legal links;
- future large-file/resumable HTTP transport can replace the current binary endpoint without changing DocumentVersion semantics.
