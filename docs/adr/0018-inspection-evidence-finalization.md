# ADR 0018: Inspection evidence, signatures and finalization

**Status:** Accepted

## Context

PR #11 established Inspection as a Unit-scoped event with one exact schema version. PR #12 hardened concurrent content editing and locking.

The next boundary must preserve legally/operationally useful evidence without turning Inspection into another master database or making external PDF/storage availability part of the transaction that establishes final business truth.

The legacy HandoverApp proved several useful requirements:

- handover reports need photographs and file evidence;
- move-in/out signing commonly expects landlord + tenant;
- unlocking after signing must invalidate prior signatures;
- final reports need a stable server-authoritative source.

It also coupled those requirements to Drive folders, copied party strings and Sheets rows. Portfolio keeps the requirements, not those implementation choices.

## Decision

### Evidence grain

Binary content remains owned by Documents/FileStorage.

Inspection owns an `InspectionEvidence` relation:

```text
InspectionEvidence
  ├─ inspectionId
  ├─ optional sectionId
  ├─ optional itemId
  └─ exact documentVersionId
```

Evidence therefore says why an exact immutable binary version belongs to this Inspection without teaching the generic Document model about inspection sections/items.

Normal evidence is append-only and can be attached only while draft/in_progress.

### Versioned signature policy

`InspectionSchemaVersion.requiredSignatureRoles` contains the roles required for finalization.

Supported initial roles are:

- landlord
- tenant
- witness
- agent

The policy is frozen when the schema is published.

Schema versions that predate signature policy keep an explicit empty policy. The migration does not rewrite historical business meaning. Every newly-created schema version must state its signature policy explicitly, including an explicit empty array when no signatures are required.

A signature records:

- signer role;
- signer-name snapshot;
- optional Party reference;
- exact final DocumentVersion containing signature evidence;
- internal user that recorded the event;
- signed timestamp;
- optional later invalidation metadata.

Landlord and tenant signatures require an exact Party identity. Tenant identity must belong to the Inspection tenancy as tenant/co-tenant; landlord identity must own the inspected Unit on the Inspection lock date. These invariants are enforced both in the application command and at the PostgreSQL boundary.

Signature binaries must be final DocumentVersions owned by Documents with category `signature`. FileStorage metadata is verified against the immutable DocumentVersion hash and byte size before the signature is accepted. `signedByUserId` records the internal user who captured the signature event; it is not used as a substitute for signer Party identity.

### Controlled unlock

Only admin/manager may unlock.

```text
locked
  ↓ controlled unlock
in_progress
```

The transaction:

1. invalidates every active signature;
2. inserts one append-only UnlockRecord;
3. advances Inspection.version;
4. advances Inspection.contentRevision;
5. clears lockedAt and returns the Inspection to in_progress.

Old signatures are never deleted.

Direct SQL cannot perform locked → in_progress without a matching UnlockRecord.

### Final snapshot and lifecycle

Finalization is admin/manager-only.

It requires:

- status locked;
- current expected version;
- all required signer roles active;
- stable current contentRevision.

One immutable FinalSnapshot captures:

- resulting finalized Inspection header and source revisions;
- exact InspectionSchemaVersion;
- responses;
- findings;
- evidence plus exact DocumentVersion metadata/hash;
- all signatures, including invalidated historical signatures, plus exact signature DocumentVersion metadata/hash;
- controlled-unlock history.

Snapshot row metadata records the locked source `inspectionVersion` and `contentRevision` being finalized.

Snapshot insertion and `locked → finalized` lifecycle update execute in one PostgreSQL transaction. The lifecycle trigger independently requires the matching snapshot.

This gives:

```text
locked source revision N
        ↓ validate/signature policy
FinalSnapshot(source=N, payload.status=finalized)
        +
Inspection status=finalized
        ↓
single transaction
```

### PDF/report boundary

PDF is not the source of truth.

`PdfPort.renderInspectionFinalReport(FinalSnapshot)` is an application port.

Generation happens after finalization:

1. read immutable FinalSnapshot;
2. reserve/reuse the canonical report Document by deterministic Inspection report code;
3. render PDF through PdfPort only when that Document has no canonical version;
4. store bytes through FileStoragePort/DocumentVersion with expected Document revision;
5. verify the stored binary by provider/object identity, byte size and SHA-256 before finalizing the DocumentVersion;
6. add one inspection-level `final_report` InspectionEvidence relation.

A renderer/storage failure therefore does not roll back or corrupt an already valid finalization.

Concurrent generators converge on the same canonical DocumentVersion. A losing upload is compensated only after PostgreSQL confirms that its candidate version was not committed; ambiguous commit acknowledgement preserves the binary for reconciliation rather than deleting potentially committed evidence. PostgreSQL independently requires `final_report` to reference a final `inspection` DocumentVersion and forbids section/item scope.

Provider-specific rendering remains an infrastructure choice.

## Consequences

- final business truth is database-transactional and independent of external rendering availability;
- evidence always points to exact binary versions;
- schema evolution cannot change historical signature requirements;
- unlock cannot silently preserve signatures collected against obsolete content;
- final report generation is retry-safe and concurrent callers converge on one canonical artifact;
- binary existence/hash is verified before evidence/signatures/final versions are trusted;
- FinalSnapshot remains canonical truth even if report rendering/storage fails;
- Inspection remains separate from Assets, Meters, Keys and Maintenance truth.
