# ADR 0020: AssetLocationHistory is authoritative placement truth

**Status:** Accepted

## Context

Asset Registry stores `assets.property_id`, optional `unit_id` and optional `space_id` as current placement. Canonical #15 introduces temporal location history. Keeping both as independent facts would permit impossible divergence.

## Decision

`AssetLocationHistory` is the authoritative temporal truth.

Every located Asset has exactly one open location interval. Location intervals for one Asset are contiguous from initial registration onward and never overlap. Closed intervals are immutable. A `replaced` Asset is historical and deliberately has zero open location intervals.

`assets.property_id/unit_id/space_id` are a current projection only. For located Assets PostgreSQL deferred guards require exact parity with the single open history interval. A replaced Asset has all three projection fields null and no open interval.

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

New Assets create their initial location interval in the same transaction as Asset creation. Existing Registry rows are migration-backfilled from their recorded placement/replacement relationships.

Replacement is one transaction:

```text
close predecessor current interval at replacedAt
+ create successor Asset
+ create successor initial interval at replacedAt
+ append AssetReplacement
+ predecessor.status = replaced
+ clear predecessor current placement projection
+ CAS predecessor version
= one commit
```

Retirement does not currently imply physical removal; a retired Asset therefore keeps its current location until a future explicit removal/offsite workflow is modeled.

Tenancy inventory is a separate fact. `TenancyAssetAssignment` says that one physical Asset belongs to the inventory scope of one Tenancy. It does not move the Asset and does not mean exclusive current possession. The same Asset may therefore be in multiple Tenancy inventory scopes; no global one-open assignment constraint exists.

Assignment is allowed only for non-terminal Tenancy states. Move-in snapshot is allowed only for `planned/active`; move-out only for `active/notice_given/move_out_pending`. Ended/cancelled Tenancies are not normal backfill targets because this model records assignment/recording time, not historical occurrence time.

`AssetConditionAssessment` is append-only condition history. Move-in and move-out inventory snapshots are append-once records and may reference exact condition assessments.

## Consequences

- there is one temporal source of truth for placement;
- current Asset reads remain simple through the projection;
- DB sabotage cannot leave history and projection divergent;
- movement does not change physical Asset identity;
- tenancy inventory survives later Asset moves;
- condition history is preserved rather than overwritten;
- Warranty/Service/Maintenance can attach later without redefining Asset history.