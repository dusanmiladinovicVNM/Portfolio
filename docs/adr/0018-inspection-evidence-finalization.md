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

Existing published move-in, move-out and key-handover schemas are migrated to landlord + tenant, preserving the legacy business expectation. Other existing published schemas are migrated to landlord.

A signature records:

- signer role;
- signer-name snapshot;
- optional Party reference;
- exact final DocumentVersion containing signature evidence;
- internal user that recorded the event;
- signed timestamp;
- optional later invalidation metadata.

The signer role is an evidentiary assertion. An optional Party FK does not, by itself, prove that Party is legally the landlord/tenant. Relationship verification can be strengthened in a later legal workflow without rewriting historical signatures.

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

- resulting finalized Inspection header;
- exact InspectionSchemaVersion;
- responses;
- findings;
- evidence references;
- active signatures.

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
2. render PDF through PdfPort;
3. store bytes through FileStoragePort/DocumentVersion;
4. finalize that DocumentVersion;
5. add one `final_report` InspectionEvidence relation.

A renderer/storage failure therefore does not roll back or corrupt an already valid finalization.

The command is idempotent for an already-linked final report. Provider-specific rendering remains an infrastructure choice.

## Consequences

- final business truth is database-transactional and independent of external rendering availability;
- evidence always points to exact binary versions;
- schema evolution cannot change historical signature requirements;
- unlock cannot silently preserve signatures collected against obsolete content;
- final PDFs can be regenerated/replaced as projections without redefining the FinalSnapshot;
- Inspection remains separate from Assets, Meters, Keys and Maintenance truth.
