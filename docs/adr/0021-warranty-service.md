# ADR 0021: Warranty and Service attach to exact physical Asset identity

**Status:** Accepted

## Context

Canonical #16 adds warranty and service history after Asset identity, temporal placement and tenancy inventory are already stable.

The main risk is collapsing several different grains into one mutable "maintenance" record:

- legal/commercial coverage,
- warranty claim workflow,
- expected service schedule,
- completed service history,
- parts consumed during one service,
- future maintenance Issue/WorkOrder and Cost projections.

That would make later Maintenance and Cost domains depend on provisional truth.

## Decision

Warranty and Service reference the exact physical `Asset.id`.

```text
Asset
  ├─ Warranty[]
  │    └─ WarrantyClaim[]
  ├─ ServicePlan[]
  └─ ServiceEvent[]
       └─ ServicePart[]
```

### Warranty

A Warranty is one coverage record for one exact Asset.

It records a coverage type, coverage interval, optional provider Party, optional provider/reference number and descriptive terms.

Warranty expiry is derived from the coverage interval. It is not a mutable lifecycle status.

A WarrantyClaim belongs to exactly one Warranty. It preserves `recordedAt` and `recordedByUserId`; its incident date must fall inside that Warranty's coverage interval and cannot be later than the UTC calendar date of `recordedAt`, even when the claim is submitted or resolved later.

Claim lifecycle is explicit and optimistic:

```text
draft -> submitted -> approved -> closed
                  \-> rejected
draft|submitted -> cancelled
```

Rejected, cancelled and closed claims are terminal. Claim audit time is monotonic from recording: submission cannot predate `recordedAt`; resolution cannot predate submission; closing cannot predate resolution; draft cancellation cannot predate `recordedAt`, and submitted cancellation cannot predate submission.

### ServicePlan

A ServicePlan is expected work policy for one exact Asset, not proof that service occurred and not a WorkOrder.

The first model supports one-time and recurring calendar schedules:

- `one_time`: one `firstDueOn`, no interval
- `recurring`: one `firstDueOn` plus positive `intervalMonths`

ServicePlan lifecycle is explicit and optimistic:

```text
active <-> paused
active|paused -> ended|cancelled
```

Ended and cancelled plans are terminal.

A new or reactivated active ServicePlan requires its Asset to be `active` or `inactive`. `retired` and `replaced` Assets are not operationally eligible for future service policy. Asset replacement does not mutate ServicePlan state across bounded contexts; operational applicability is derived from both the Plan status and current Asset lifecycle.

No mutable "next due" fact is stored in this PR. Later reporting/reminder logic may derive due state from the plan plus ServiceEvents.

### ServiceEvent

A ServiceEvent is one immutable historical occurrence for one exact Asset.

`performedAt` means when the work happened. `recordedAt` means when Portfolio recorded it. Historical import therefore does not falsify event time.

A ServiceEvent may optionally reference a ServicePlan and/or WarrantyClaim. Any referenced Plan/Claim must resolve to the same Asset. No ordering invariant between `ServiceEvent.performedAt` and `WarrantyClaim.incidentOn` is imposed in this phase because that link expresses relevance to the claim, not necessarily work performed as a consequence of it.

ServiceEvent and its ServicePart children commit atomically and are append-only.

### ServicePart

A ServicePart is a component or consumable recorded inside one ServiceEvent. It is not a substitute for Asset identity.

If an installed component requires its own identifiers, placement, warranty, service history or later replacement chain, that component is modeled as another Asset instead of a ServicePart.

### Party boundary

Warranty provider and service provider are optional Party references.

Historical Warranty and ServiceEvent records require referenced Party existence, not current `active` status. An inactive/archived supplier must remain referencable by old or imported service history. A new or reactivated ServicePlan is different because it is future operational policy: its provider Party, when present, must be active.

## Deferred

Canonical #16 does **not** create:

- Cost rows or invoice projections (#18),
- Issue/WorkOrder records (#19),
- Improvement WorkMaterial inventory (#17),
- automatic reminders/notifications,
- a mutable next-due projection,
- an Asset component hierarchy,
- automatic transfer of Warranty or Service history to a replacement Asset.

Asset replacement creates a new physical identity. Prior Warranty/Service history stays with the predecessor unless a later business rule explicitly creates successor records.

## Consequences

- coverage, claims, plans and completed work have separate grains;
- service history remains valid across Asset movement because it references physical identity, not placement;
- replacement cannot silently inherit predecessor service history or keep that predecessor operationally due merely because its stored Plan remains `active`;
- historical service entry has explicit occurrence time;
- WarrantyClaim history has explicit recording provenance and cannot assert a future incident;
- historical provider references and future operational provider eligibility remain distinct;
- Maintenance and Cost remain downstream consumers instead of becoming hidden dependencies of this PR.
