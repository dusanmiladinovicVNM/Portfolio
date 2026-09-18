# ADR 0019: Asset Registry identity, placement and replacement

**Status:** Accepted

## Context

Portfolio now has stable Unit/Space identity and completed Inspection evidence. The next canonical domain is the physical Asset registry.

The main modeling risk is treating an Asset as a mutable row describing "whatever appliance is currently here". That would collapse three different facts:

- physical identity;
- current placement;
- replacement lineage.

It would also make later service/warranty history unsafe because a replacement could silently inherit the predecessor's history.

## Decision

### Physical identity

`Asset` represents exactly one physical item.

Each Asset has:

- stable UUID identity;
- human business code;
- name;
- exactly one Unit;
- optional Space from that same Unit;
- optional manufacturer/model;
- explicit lifecycle status + optimistic version;
- structured `AssetIdentifier[]`.

Identifiers are append-only child records. Serial, product, inventory, barcode, IMEI/MAC and other identifiers are not stored in notes.

### Placement boundary

PR #14 stores current Unit/Space placement but does not expose movement.

Direct mutation of Asset Unit/Space is blocked at PostgreSQL.

PR #15 will introduce `AssetLocationHistory` and the first supported move command. Deferring movement rather than temporarily overwriting placement preserves the future historical model.

### Lifecycle

Supported registry lifecycle:

```text
active ↔ inactive
  └────→ retired

active/inactive ──replacement transaction──→ replaced
```

`retired` and `replaced` are terminal.

Every lifecycle transition increments Asset.version exactly once.

### Replacement

Replacement creates a second physical Asset identity.

One transaction:

1. create the successor Asset;
2. append one `AssetReplacement` predecessor→successor relation;
3. mark the predecessor `replaced` and increment its version.

A predecessor has at most one direct successor and a successor at most one direct predecessor. Replacement must stay inside the same Unit; it is not a movement workflow.

PostgreSQL independently blocks `status = replaced` when no matching replacement relation exists.

### Deferred scope

Not part of PR #14:

- AssetLocationHistory;
- condition assessments/history;
- TenancyAssetAssignment / move-in inventory;
- Warranty / WarrantyClaim;
- ServicePlan / ServiceEvent / ServicePart;
- maintenance/work-order ownership.

Those contexts may reference Asset identity later but do not redefine it.

## Consequences

- service/warranty history can safely attach to one physical identity;
- old replaced items remain queryable;
- serial/product identifiers remain structured historical evidence;
- no location history is lost before PR #15 exists;
- replacement cannot masquerade as a cross-Unit transfer;
- application and PostgreSQL enforce the same lifecycle/replacement rules.
