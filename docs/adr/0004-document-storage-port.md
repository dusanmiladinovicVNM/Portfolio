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

Upload ingestion is now bounded by the same 16 MiB production policy.

The HTTP layer no longer calls unbounded `request.arrayBuffer()`. It consumes
the request body through a bounded reader that:

- rejects an announced oversized `Content-Length` before normal body consumption;
- counts actual bytes for chunked/missing-length bodies;
- aborts as soon as the real byte count crosses the ceiling;
- rejects body/`Content-Length` mismatches;
- never invokes storage for a rejected upload.

The application write service enforces the same ceiling again, so internal
producers such as generated reports cannot bypass the storage write policy.

Google Drive also enforces the ceiling before hashing or network I/O. Provider
writes use a resumable upload session so the full 16 MiB Portfolio contract is
within Drive's documented upload path. Because Portfolio is already
bounded-buffered, the session sends the complete binary in one PUT; chunked
resume/replay remains a later performance optimization rather than a requirement
for the current correctness boundary.

For concurrent same-`DocumentVersionId` writes, PostgreSQL remains the only
canonical winner. A losing newly-created storage object is removed only after
the persisted winner's exact storage reference, byte size and SHA-256 have been
verified. Provider metadata search is not treated as a uniqueness constraint.
