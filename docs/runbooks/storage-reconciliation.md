# Document storage reconciliation runbook

Use this runbook for storage failures that intentionally fail closed instead of guessing success.

## DOCUMENT_STORAGE_RECONCILIATION_REQUIRED

Meaning: the application cannot prove whether the provider-side write and canonical PostgreSQL DocumentVersion/storage reference agree.

~~~text
1. capture requestId and DocumentVersion/document identifier
2. stop destructive/manual cleanup retries
3. read canonical DocumentVersion + storage reference from PostgreSQL
4. inspect provider object metadata: provider/objectId/objectKey/byteSize/SHA-256
5. compare provider metadata with canonical PostgreSQL identity
6. preserve any unverified provider object until a winner is proven
7. delete a loser only after the canonical winner is independently verified
~~~

Never choose a Google Drive object merely because it was returned first by a search.

## DOCUMENT_STORAGE_COMPENSATION_FAILED

Meaning: PostgreSQL winner was verified but cleanup of a known loser provider object failed.

Canonical DB state remains authoritative. Record the loser object ID and retry only verified loser cleanup. Do not mutate the canonical DocumentVersion to match the loser.

## DOCUMENT_BINARY_INTEGRITY_MISMATCH / DOCUMENT_STORAGE_VERIFICATION_FAILED

Meaning: provider bytes/metadata do not match canonical size/hash/storage identity.

Stop delivery/use of the binary, preserve evidence, compare canonical DocumentVersion with provider metadata, and restore/replace only from a separately verified copy.

Do not silently rewrite the canonical hash to match provider bytes.

## Correlation

All failures above must be searchable in structured logs by requestId, errorCode, HTTP status, path and UTC timestamp.

A 503 is an operational signal, not a generic retry instruction.
