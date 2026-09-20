# ADR 0027 — Business events and Unit timeline

## Status

Accepted for canonical PR #22 implementation.

## Context

Portfolio now has canonical write-side truth across Tenancy, leases, Documents,
Inspections, Assets, Service, Improvements, Costs, Maintenance, Access and
Meters.

The Unit dossier needs one cross-context chronology without creating a second
mutable source of truth or confusing technical audit with business history.

Some source facts are exact instants while others are date-only business facts.
A read model must not invent clock precision that the source domain never
captured.

## Decision

### Domain events are projections, not an event store

Canonical #22 does **not** introduce an append-only `domain_events` write
table and does not make application commands dual-write domain rows plus event
rows.

A Portfolio business event in this phase is a normalized read-model event
derived from existing canonical source facts.

Therefore:

```text
canonical domain tables
        ↓
business-event projection
        ↓
Unit Timeline
```

The direction never reverses. Timeline rows cannot mutate source domains.

Technical/security/audit logging remains a separate concern. A row UPDATE or
request trace is not automatically a business timeline event.

### Stable projected identity

Every projected event has a deterministic `eventKey` composed from its
event type and canonical source identity.

The same source state queried twice therefore returns the same event identity.

No random event UUID is generated at read time.

### Temporal precision

Every event exposes:

```text
occurredOn      YYYY-MM-DD
occurredAt      canonical UTC instant | null
precision       date | instant
```

For an exact instant:

```text
precision = instant
occurredAt != null
occurredOn = UTC date(occurredAt)
```

For a date-only business fact:

```text
precision = date
occurredAt = null
occurredOn = source business date
```

The timeline never converts a date-only Tenancy/lease/cost fact to fake
midnight occurrence.

Ordering is deterministic:

1. `occurredOn DESC`;
2. exact instants before date-only entries on the same date;
3. `occurredAt DESC` among exact instants;
4. `eventType`;
5. `eventKey`.

That deterministic ordering does **not** claim that a date-only event happened
before or after an exact instant on the same calendar day.

### Unit attribution

An event appears in one Unit timeline only when the source model provides a
deterministic Unit relationship.

Examples:

- Tenancy -> exact `unitId`;
- Inspection -> exact `unitId`;
- Access transaction -> transaction Tenancy -> exact Unit;
- Meter -> exact immutable Unit;
- MaintenanceIssue -> explicit Unit snapshot;
- Unit/Space/Unit-scoped Improvement Cost -> deterministic Unit.

Property-wide events are not copied into every Unit timeline.

A source whose Unit can only be guessed from current mutable state is omitted
until a historical attribution rule exists.

### Initial event families

Canonical #22 projects business events from:

- Tenancy;
- lease agreements, amendments and effective term versions;
- document links with deterministic Unit targets;
- Inspections and findings;
- Asset location, condition and Tenancy inventory;
- WarrantyClaim lifecycle instants and ServiceEvents when Asset historical
  location resolves the Unit at the event instant;
- Unit-scoped Improvements, WorkItems and WorkRecords;
- deterministically Unit-scoped Costs and reversals;
- Maintenance Issues and WorkOrders;
- Access custody transactions;
- Meter lifecycle, readings and Tenancy boundaries.

The projection intentionally prefers an omitted event over a falsely
attributed event.

### Current-state fields are not fake history

If a context stores only current status and no durable occurrence field for a
transition, canonical #22 does not infer the transition time from
`updatedAt`.

For example, the timeline may project `Tenancy.actualStart`,
`noticeGivenAt`, `terminationEffectiveAt` and `actualEnd`, because those
business dates survive as canonical facts.

It does not invent a separate historical `move_out_pending` transition event
when no canonical transition occurrence is retained.

### Projection payload

A timeline event contains:

- deterministic `eventKey`;
- Unit;
- category and event type;
- temporal precision;
- occurrence;
- optional source recording provenance;
- source type/id;
- optional related entity type/id;
- small JSON details payload containing display-supporting canonical facts.

The details payload is a read-model convenience, never authoritative business
state.

## Acceptance

Canonical #22 must prove at minimum:

1. timeline has no writable event store;
2. one source fact produces stable event identity across repeated reads;
3. date-only facts remain date-only;
4. instant facts are canonical UTC and expose matching UTC `occurredOn`;
5. cross-context ordering is deterministic;
6. wrong Unit events cannot leak into another Unit timeline;
7. Access events resolve through Tenancy Unit even for Property-scoped items;
8. Asset/Service events use historical location, not current Asset placement;
9. property-wide or ambiguously attributable sources are omitted;
10. one MeterReading remains one physical reading event even when it has two
    move-in/out boundary events;
11. Cost exact amounts are returned as strings;
12. category/date filtering does not change event identity;
13. API requires `portfolio:read`;
14. technical audit is not represented as Unit business history.

## Deferred

Canonical #22 does not implement:

- event sourcing;
- transactional outbox/integration events;
- security/audit log;
- materialized timeline cache;
- notification delivery;
- analytics aggregates;
- full-text timeline search;
- inferred Unit allocation of Property-wide costs/projects;
- reconstruction of transitions whose canonical occurrence was never stored.

Those can be added later without replacing the projection contract.
