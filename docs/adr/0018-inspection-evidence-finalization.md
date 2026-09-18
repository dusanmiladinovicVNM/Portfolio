# ADR 0018: Inspection evidence, signatures and immutable finalization

**Status:** Accepted

## Context

PR #11 established the Inspection aggregate and schema snapshots. PR #12 closed concurrency and historical-identity gaps.

The next boundary must preserve photographs, attachments, signatures and a legally useful final report without turning the Inspection table into binary storage or weakening the Documents boundary.

External file storage and PostgreSQL cannot participate in one ACID transaction.

## Decision

### Evidence references exact DocumentVersion

InspectionEvidence stores business context around one exact **final** DocumentVersion:

```text
InspectionEvidence
  ├─ Inspection
  ├─ exact final DocumentVersion
  ├─ optional Section
  ├─ optional Item
  ├─ type: photo | attachment
  └─ caption / creator / timestamp
```

The binary remains owned by Documents/FileStoragePort.

Evidence links are append-only. Corrections add new evidence rather than rewriting old evidence.

### Signatures attest only locked content

A signature cannot be created while the form is editable.

```text
in_progress → locked → signatures → finalized
                    ↘ controlled unlock
```

Each signature references one exact final DocumentVersion containing the captured signature evidence.

Signer identity is snapshotted:

- staff name comes from active internal staff master;
- Party name comes from Party master;
- external signer name is supplied explicitly.

Supported roles are inspector, tenant, co_tenant, witness and other.

Inspector signature must belong to `assignedToUserId`.

Tenant/co-tenant signatures must match the Inspection TenancyParty composition.

### Controlled unlock invalidates; it never deletes history

Only admin/manager can unlock.

Unlock:

1. row-locks the Inspection revision;
2. invalidates every valid signature with reason/time/actor;
3. appends InspectionUnlockEvent;
4. transitions `locked → in_progress`;
5. increments lifecycle version and contentRevision.

Old signatures remain queryable historical evidence.

### Finalization requires inspector attestation

Every finalized Inspection requires one valid `inspector` signature by the current assigned user.

Tenant signatures are supported but are not universal finalization requirements because periodic, damage and other Inspection types may not have a tenant signing requirement.

### Immutable final snapshot

Finalization captures:

- finalized Inspection header;
- exact schema version;
- section revisions;
- responses;
- findings;
- exact evidence DocumentVersion metadata and SHA-256;
- all signatures, including invalidated historical signatures;
- unlock-event history.

The snapshot is stored once in `inspection_finalizations.snapshot` and cannot be updated or deleted.

### PDF is an output adapter

Application depends on:

```text
PdfPort.renderInspectionReport(snapshot) → Uint8Array
```

No PDF library enters domain/application code.

The generated PDF is persisted as a normal final DocumentVersion through FileStoragePort and DocumentRepository.

### External storage failure semantics

The PDF binary is written before finalization commits.

After rendering, the command re-reads Inspection version/contentRevision before storage. The DB finalization then CASes the same source revision.

A race after binary persistence can therefore leave an unreferenced generated DocumentVersion, but it cannot attach the wrong PDF to a changed Inspection. Such immutable orphan output is reconciliation debt, not corrupted business history.

## Consequences

- Inspection never owns binary provider identifiers;
- evidence and signatures preserve exact binary identity;
- unlock history is auditable;
- stale signatures cannot silently survive reopened content;
- final PDF and final snapshot describe one stable content revision;
- Assets, Keys and Meters remain separate future domain facts.
