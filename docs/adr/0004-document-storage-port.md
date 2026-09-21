# ADR 0004: Binary storage is behind FileStoragePort

**Status:** Accepted

## Decision

Document metadata/versioning belongs to Portfolio; binary bytes live in an
external storage provider accessed through a port.

Google Drive is the first adapter because it is already available internally.

Binary reads follow the same ownership boundary as writes. A browser identifies
content only by canonical `DocumentVersionId`; it never receives or supplies a
provider name, Drive file id or storage object key. Portfolio authorization runs
before the storage adapter is invoked.

`FileStoragePort` is capability-split so application commands depend only on
what they use:

- write lifecycle: `put/stat/remove`;
- binary read: `read`.

A binary read returns the exact bytes plus provider-neutral metadata calculated
for those bytes. Before Portfolio delivers content, the storage reference,
byte-size and SHA-256 must match the canonical immutable `DocumentVersion`
metadata. Missing objects, mismatches and provider failures fail closed.

Both `stored` and `final` DocumentVersions are readable to an actor with
`documents:read`. `final` denotes legal/immutability lifecycle, not a
separate confidentiality class.

## HTTP / browser consequence

Binary delivery is exposed through:

```text
GET /document-versions/:documentVersionId/content
```

The response is authenticated, private/no-store and `nosniff`. The browser
fetches it through the same bearer-authenticated Portfolio API boundary used by
JSON reads.

The web UI offers Open only for an explicit passive-format allowlist (PDF and
raster images). Other MIME types remain downloadable but are not opened as
same-origin Blob content.

## Consequences

The domain stores stable document/version identities, hashes and storage keys.
It does not use Google Drive file IDs as business primary keys.

A future S3-compatible implementation can replace Google Drive without changing
contract, tenancy, inspection or asset domain models.

The current implementation is explicitly a bounded buffered capability.
`MAX_BUFFERED_DOCUMENT_BINARY_BYTES` is 16 MiB. Canonical
`DocumentVersion.byteSize` is checked before any storage read, and the storage
adapter receives the same policy. Google Drive rejects oversized metadata before
requesting media bytes and consumes the response body through a bounded reader,
so a provider-side race cannot turn a small canonical record into an unbounded
allocation.

Documents above this ceiling receive
`DOCUMENT_BINARY_DELIVERY_LIMIT_EXCEEDED`; they require the future streaming
delivery path. Streaming with incremental hashing can replace the buffered
adapter without changing DocumentVersion identity, authorization or browser API
boundaries.

Upload ingestion is a separate pre-existing hardening debt:
`POST /documents/:id/versions` still buffers `request.arrayBuffer()` and the
Google Drive multipart upload path creates additional copies. Production
hardening must introduce an upload size ceiling and/or streaming upload without
moving that older issue into this read-delivery PR.
