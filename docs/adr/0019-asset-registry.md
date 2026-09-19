# ADR 0019: Asset Registry identity, placement and replacement

**Status:** Accepted

## Context

Portfolio now has stable Property/Unit/Space identity and completed Inspection evidence. The next canonical domain is the physical Asset registry.

The main modeling risk is treating an Asset as a mutable row describing "whatever equipment is currently here". That would collapse physical identity, placement, correctable metadata and replacement lineage. It would also make later service/warranty history unsafe because a replacement could silently inherit the predecessor's history.

A second risk is forcing every Asset into a rentable Unit. Building-level equipment such as lifts, central boilers, pumps, solar inverters or fire-control panels belongs naturally to a Property without requiring a synthetic `COMMON` Unit.

## Decision

### Physical identity and metadata

`Asset` represents exactly one physical item.

Each Asset has:

- stable UUID physical identity;
- stable human business code;
- correctable name/manufacturer/model metadata;
- required Property current-placement context;
- optional Unit from that Property;
- optional Space from that Unit;
- explicit lifecycle status + optimistic aggregate version;
- structured append-only `AssetIdentifier[]`.

Changing name/manufacturer/model corrects master metadata; it does not create a new physical Asset. Corrections use optimistic concurrency and advance `Asset.version`. The registry does not add a dedicated metadata-history table; future cross-cutting AuditEvent/DomainEvent infrastructure should record who changed which metadata and when.

### Placement boundary

Valid current-placement shapes are:

```text
Property
Property + Unit
Property + Unit + Space
```

PR #14 stores current placement but exposes no move command. Direct mutation of Property/Unit/Space placement is blocked at PostgreSQL.

Canonical PR #15 will introduce `AssetLocationHistory` and the first supported move command. Deferring movement rather than temporarily overwriting placement preserves future historical truth without making placement part of physical identity.

### Structured identifiers

Identifiers are append-only child records. Values and labels are stored without surrounding whitespace.

Uniqueness semantics are intentionally type-specific:

- `inventory_tag` — globally unique;
- `imei` — globally unique;
- `mac_address` — globally unique;
- `serial_number` — no cross-Asset uniqueness yet;
- `product_number` — no cross-Asset uniqueness;
- `barcode` — no cross-Asset uniqueness yet;
- `other` — no cross-Asset uniqueness.

Every Asset still rejects the same `(identifierType, normalized value)` twice within itself.

MAC and IMEI currently normalize only surrounding whitespace and case for uniqueness. Type-specific canonicalization (for example MAC separator removal or IMEI digits-only normalization) is intentionally deferred until those identifier semantics are specified explicitly.

This keeps the grain strong without pretending that all identifier types have the same business meaning.

### Lifecycle

Supported registry lifecycle:

```text
active ↔ inactive
  └────→ retired

active/inactive ──replacement transaction──→ replaced
```

`retired` and `replaced` are terminal lifecycle states.

Every supported lifecycle transition advances `Asset.version` exactly once. Metadata correction is a separate CAS mutation and cannot be mixed with a lifecycle transition in one DB update.

### Replacement

Replacement creates a second physical Asset identity.

One transaction:

1. create the successor Asset;
2. append one `AssetReplacement` predecessor→successor relation;
3. mark the predecessor `replaced` and increment its version.

The successor inherits the predecessor's exact current Property/Unit/Space placement. Replacement therefore cannot masquerade as a move.

A predecessor has at most one direct successor and a successor at most one direct predecessor. Replacement lineage is acyclic. PostgreSQL independently blocks `status = replaced` when no matching replacement relation exists and uses a deferred commit guard so the relation and predecessor state must commit together.

### Deferred scope

Not part of PR #14:

- AssetLocationHistory;
- condition assessments/history;
- TenancyAssetAssignment / move-in inventory;
- Warranty / WarrantyClaim;
- ServicePlan / ServiceEvent / ServicePart;
- maintenance/work-order ownership;
- post-creation AssetIdentifier append API.

Those contexts may reference Asset identity later but do not redefine it.

## Consequences

- building-level equipment is modeled without fake Units;
- future moves change placement history, not Asset identity;
- service/warranty history can safely attach to one physical identity;
- metadata typos can be corrected without inventing a replacement Asset;
- old replaced items remain queryable;
- strong identifier types have DB-enforced global uniqueness;
- serial/product/barcode semantics remain deliberately unclaimed;
- replacement cannot masquerade as transfer;
- application and PostgreSQL enforce the same placement, mutation and replacement rules.
