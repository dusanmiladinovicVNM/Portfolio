# ADR 0022: Improvement work separates planned scope from historical work facts

**Status:** Accepted

## Context

Canonical #17 adds Improvements / Works after Asset, temporal placement, tenancy inventory, Warranty and Service are already stable.

The main modeling risk is collapsing several different grains into one mutable project row:

- project lifecycle,
- planned work scope,
- completed work history,
- material consumption,
- Asset involvement,
- contractor history,
- later financial Cost,
- later Maintenance Issue/WorkOrder.

That would create duplicate truth and make Cost/Maintenance depend on provisional project data.

## Decision

The Improvements bounded context uses these grains:

```text
ImprovementProject
  └─ WorkItem[]
       └─ WorkRecord[]
            ├─ WorkMaterial[]
            └─ ProjectAsset[]
```

### ImprovementProject

One managed improvement/renovation initiative.

It has one current scope placement:

- Property is required;
- Unit is optional but must belong to Property;
- Space is optional, requires Unit and must belong to it.

Property-only scope represents common/building works. A project spanning several Units remains Property-scoped in this phase rather than inventing a synthetic Unit or a premature many-scope model.

Lifecycle:

```text
draft -> planned -> in_progress -> completed
  \        \            \-> cancelled
   \--------\----------------> cancelled
```

Completed and cancelled projects are terminal.

Project completion requires every WorkItem to be terminal (`completed|cancelled`), cannot predate any child terminal timestamp and cannot move behind existing WorkRecord history.

Project cancellation has a deliberately asymmetric child-history rule: `cancelledAt` cannot predate any existing WorkItem `createdAt`, `startedAt` or `completedAt`, and cannot move behind existing WorkRecord occurrence time. It does **not** need to be after a child WorkItem `cancelledAt`, because planned/in-progress child items may be cleanup-cancelled after the parent Project was already cancelled. Cancellation does not rewrite child history; child operational applicability is derived from parent + child lifecycle.

### WorkItem

One planned piece of project scope.

It is expected work, not evidence that work happened.

Lifecycle:

```text
planned -> in_progress -> completed
   \            \-> cancelled
    \--------------> cancelled
```

Starting or completing a WorkItem requires its ImprovementProject to be `in_progress`. While a WorkItem remains `planned`, its title/description are correctable through optimistic CAS; once it starts, its definition is frozen. WorkItem completion/cancellation cannot place a terminal cutoff before any already-recorded work occurrence. WorkItems may still be cancelled after parent cancellation to clean up planned scope without rewriting prior facts.

### WorkRecord

One append-only historical occurrence of work under one WorkItem.

`performedAt` is when the work happened.
`recordedAt` is when Portfolio recorded it.

`Project.startedAt` and `WorkItem.startedAt` are business occurrence boundaries, not merely UI transition timestamps. A WorkRecord must therefore occur at or after both starts, at or before the earliest Project/WorkItem terminal timestamp, and never after `recordedAt`. Historical entry is still supported by recording the work later, but this PR does not let a newly-created Project retroactively claim work from before its own historical start. A future import workflow must reconstruct historical start timestamps explicitly.

A WorkRecord may reference one contractor Party. Historical work requires Party identity existence, not current active status.

### WorkMaterial

A WorkMaterial is a material/consumable fact attached to one WorkRecord.

It is not an Asset.

Quantity is stored as an exact positive decimal string in the domain/API and PostgreSQL `numeric` in persistence. Money is deliberately absent; canonical #18 owns financial Cost.

If an installed component needs stable identity, identifiers, placement, warranty, service history or later replacement, it is an Asset instead of WorkMaterial.

### ProjectAsset

ProjectAsset is append-only evidence that one existing Asset participated in one WorkRecord with one action:

- `affected`
- `installation_work`
- `removal_work`

These values deliberately describe the contractor/work activity, not the Asset's canonical physical placement or lifecycle at that timestamp. ProjectAsset never changes or independently asserts Asset status, placement, replacement lineage or service state.

Those truths remain owned by the Asset bounded context. When Portfolio later models a physical install/remove workflow, that owner context must record the canonical Asset transition separately. There is deliberately no `replaced` ProjectAsset action; physical replacement remains AssetReplacement truth.

### Contractor boundary

Contractor identity is stored on historical WorkRecord, not as a second mutable Party copy.

No contractor invoice, payable or Cost record is created here.

## Transaction boundary

Normal WorkRecord creation commits:

```text
WorkRecord
+ WorkMaterial[]
+ ProjectAsset[]
= one transaction
```

The record and children are append-only historical facts.

Cross-table invariants use a common PostgreSQL row-lock protocol rather than an application mutex:

- WorkItem insert/update takes a shared row lock on its parent ImprovementProject during validation;
- WorkRecord insert takes shared row locks in deterministic order: WorkItem first, then ImprovementProject;
- WorkMaterial/ProjectAsset insert takes a shared lock on the unsealed WorkRecord;
- Project/WorkItem lifecycle UPDATE already owns the conflicting row-update lock.

This serializes parent terminal transitions with concurrent child inserts. A child that starts first completes under the old parent state and is visible to the parent transition; a parent transition that starts first makes the child wait and revalidate against the committed terminal state.

## Deferred

Canonical #17 does **not** create:

- Cost/invoice rows (#18),
- Maintenance Issue/WorkOrder (#19),
- Asset lifecycle/location mutations,
- contractor billing,
- material stock/inventory,
- project documents beyond the existing generic Documents boundary,
- generic procurement/purchase-order workflow.

## Consequences

- planned work and completed work are different grains;
- materials cannot accidentally become Asset master data;
- Asset Registry stays authoritative for physical identity/lifecycle;
- contractor history remains durable even if the Party later becomes inactive;
- Cost can later link to Project/WorkRecord/Material without becoming their source of truth;
- Maintenance can later reference Improvement work without sharing a WorkOrder model.
