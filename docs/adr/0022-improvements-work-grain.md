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

Project completion requires every WorkItem to be terminal (`completed|cancelled`). Cancellation does not rewrite child history; child operational applicability is derived from parent + child lifecycle.

### WorkItem

One planned piece of project scope.

It is expected work, not evidence that work happened.

Lifecycle:

```text
planned -> in_progress -> completed
   \            \-> cancelled
    \--------------> cancelled
```

Starting or completing a WorkItem requires its ImprovementProject to be `in_progress`. WorkItems may still be cancelled after parent cancellation to clean up planned scope without rewriting prior facts.

### WorkRecord

One append-only historical occurrence of work under one WorkItem.

`performedAt` is when the work happened.
`recordedAt` is when Portfolio recorded it.

Historical entry is therefore explicit and does not depend on current Project/WorkItem status.

A WorkRecord may reference one contractor Party. Historical work requires Party identity existence, not current active status.

### WorkMaterial

A WorkMaterial is a material/consumable fact attached to one WorkRecord.

It is not an Asset.

Quantity is stored as an exact positive decimal string in the domain/API and PostgreSQL `numeric` in persistence. Money is deliberately absent; canonical #18 owns financial Cost.

If an installed component needs stable identity, identifiers, placement, warranty, service history or later replacement, it is an Asset instead of WorkMaterial.

### ProjectAsset

ProjectAsset is append-only evidence that one existing Asset participated in one WorkRecord with one action:

- `affected`
- `installed`
- `removed`

ProjectAsset never changes Asset status, placement, replacement lineage or service state.

Those mutations remain owned by the Asset bounded context. An `installed` or `removed` project link records project history; it is not a second source of Asset lifecycle truth.

There is deliberately no `replaced` ProjectAsset action. Physical replacement is represented by the AssetReplacement domain; a project may separately record the predecessor as removed and successor as installed.

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
