# ADR 0016: Inspection schema versions, section concurrency and form-fact boundary

**Status:** Accepted

## Context

The legacy HandoverApp proved several field requirements:

- schema-driven forms evolve over time;
- inspections are edited section-by-section on unreliable connections;
- the office may create work that a different inspector performs;
- cached inspection payloads improve perceived performance;
- locking/signing must validate authoritative server state.

Its implementation also coupled those requirements to Google Sheets rows, copied tenant/property strings, Drive folders and whole-system inspection-centric storage.

Portfolio needs the requirements without inheriting that grain.

## Decision

### Inspection identity

Inspection is one event over one Unit.

It may reference one Tenancy, but only when that Tenancy belongs to the same Unit.

Inspection stores stable references rather than copied Property, tenant or landlord master strings.

```text
Unit
 └─ Inspection
      ├─ optional Tenancy
      ├─ exact InspectionSchemaVersion
      ├─ assignedToUserId
      ├─ SectionState[]
      ├─ Response[]
      └─ Finding[]
```

### Schema versioning

A schema version is relational:

```text
InspectionSchemaVersion
  └─ Section
       └─ Item
```

Items carry type, options, static required flag and optional visibility/required conditions.

New versions begin as draft.

Only published versions may create new Inspections.

After publish, schema content is immutable. Retirement prevents new use without rewriting existing inspections.

An existing Inspection always points to the exact schema version it started with.

### Three concurrency grains

Inspection lifecycle/assignment uses `Inspection.version`.

Field autosave uses `InspectionSectionState.revision`.

Closing transitions use monotonic `Inspection.contentRevision` as a global content barrier.

This is intentional.

A kitchen autosave must not conflict merely because someone saved the meter section. However lock/finalization must prove that the authoritative response set did not change after validation. Every content mutation increments `contentRevision`; lock CASes both lifecycle version and the content revision it validated.

### Typed dynamic responses

One InspectionResponse is one answer to one schema item.

The value is stored as JSONB because the schema is dynamic, but it is not an unstructured aggregate blob:

- row identity is relational;
- item/section/schema FKs are relational;
- PostgreSQL validates JSON value shape against the referenced item type/options;
- application/domain validation performs the same rule before persistence.

### Form answer versus domain fact

InspectionResponse is evidence of what the form recorded.

It does not automatically become canonical Asset, MeterReading, KeyTransaction or other operational truth.

Later domains may project/promote a response into their own entities through explicit application workflows.

This prevents the inspection form from becoming a second master database.

### Findings

InspectionFinding records an observed condition/problem at section/item grain.

It is not an Issue or WorkOrder.

A later maintenance workflow may link/promote it while preserving the original finding.

### Authorization

`createdByUserId` and `assignedToUserId` are separate.

Inspectors have inspection write capability but application commands additionally enforce ownership: an inspector may access/mutate only inspections assigned to that user.

Admin/manager roles may operate across assignments.

### Lifecycle

PR #11 defines the content boundary:

```text
draft → in_progress → locked → finalized
   └──────────────→ cancelled
```

PR #11 implements creation, start, section editing, findings, lock and cancellation.

`locked` closes response/finding mutation both in application code and PostgreSQL.

Direct `draft → locked` is not valid; a field inspection must start before it can be locked.

Section writes are PATCH semantics: callers explicitly set and/or clear selected answers. Omitted answers are unchanged.

PR #13 owns signatures, controlled unlock semantics, final immutable snapshot and transition to finalized.

## Consequences

- old inspections never change form meaning when a schema evolves;
- offline/autosave conflicts are localized to one section;
- alternate repositories cannot bypass content-lock rules because the application owns them too;
- direct SQL cannot rewrite published schema structure or write locked inspection content;
- later Assets/Keys/Meters domains remain free to define their correct business grain;
- HandoverApp remains a feature/failure-mode bank rather than a migration target.
