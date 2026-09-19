# ADR 0020: AssetLocationHistory is authoritative placement truth

**Status:** Accepted

## Context

Asset Registry stores `assets.property_id`, optional `unit_id` and optional `space_id` as current placement. Canonical #15 introduces temporal location history. Keeping both as independent facts would permit impossible divergence.

## Decision

`AssetLocationHistory` is the authoritative temporal truth.

Every Asset has exactly one open location interval. Location intervals for one Asset never overlap. Closed intervals are immutable.

`assets.property_id/unit_id/space_id` are a current projection only. PostgreSQL deferred constraint guards require that projection to match the single open history interval at transaction commit.

Move is one aggregate transaction:

```text
CAS Asset.version
+ close current AssetLocationHistory interval
+ append next AssetLocationHistory interval
+ update assets current-placement projection
+ Asset.version + 1
= one commit
```

A direct projection rewrite without matching history is invalid. Closing history without a replacement open interval is invalid. Creating a second open interval is invalid.

New Assets create their initial location interval in the same transaction as Asset creation. Existing Registry rows are migration-backfilled from their recorded current placement. Replacement creates the successor Asset and its initial location interval in the same replacement transaction.

Tenancy inventory is a separate fact. `TenancyAssetAssignment` says that one physical Asset belongs to the inventory of one Tenancy. It does not move the Asset. The Asset must be placed in the Tenancy Unit when the assignment is created.

`AssetConditionAssessment` is append-only condition history. Move-in and move-out inventory snapshots are append-once records and may reference exact condition assessments.

## Consequences

- there is one temporal source of truth for placement;
- current Asset reads remain simple through the projection;
- DB sabotage cannot leave history and projection divergent;
- movement does not change physical Asset identity;
- tenancy inventory survives later Asset moves;
- condition history is preserved rather than overwritten;
- Warranty/Service/Maintenance can attach later without redefining Asset history.