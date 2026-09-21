# ADR 0028 — Reporting and Portfolio projections

## Status

Accepted for canonical PR #23 implementation.

## Context

Portfolio has authoritative write models and a cross-context Unit Timeline.
The next product surface needs operational summaries without allowing dashboard
logic to become a second business model.

Reporting has two different temporal classes that must not be conflated:

1. facts that can be evaluated against an explicit business date;
2. current operational state whose historical state is not fully retained.

Money introduces another boundary: CHF, EUR and RSD cannot be silently added
into one portfolio total.

## Decision

### Read-only projection model

Canonical #23 adds no writable reporting tables.

```text
canonical write models
       ↓
parameterized read-only SQL projections
       ↓
ReportingRepository
       ↓
Unit overview / Portfolio dashboard
```

Reporting output can never be written back into domain entities.

### Explicit business as-of date

Every reporting query receives an explicit `asOf: DateOnly`.

The database projection does not call `CURRENT_DATE` to decide occupancy,
contract coverage or cost cutoff. This keeps application and PostgreSQL
semantics deterministic and testable.

The `asOf` date is **not** a claim that Portfolio can reconstruct every
historical current-state field.

### As-of facts

The following use durable business dates and are evaluated against `asOf`:

- actual occupancy interval from Tenancy `actualStart/actualEnd`;
- currently retained planned reservation interval;
- LeaseAgreement effective coverage;
- effective TenancyTermVersion;
- Cost `incurredOn <= asOf`.

Actual occupancy is derived from Tenancy temporal truth, never from
`Unit.status`.

A Unit is reported as:

```text
occupied
planned
vacant
```

in that precedence order.

`occupied` means an actual occupancy interval covers `asOf`.

`planned` means no actual occupancy covers `asOf` and a currently retained
planned Tenancy interval covers `asOf`.

Otherwise the Unit is `vacant`.

This projection does not reconstruct a planned reservation that has since been
activated/cancelled if the old planned lifecycle state is no longer canonical.
It therefore must not be marketed as full historical BI.

### Contract coverage

For the reporting Tenancy, **legal** contract coverage is:

```text
effective
future_signed
missing
```

It is the **current canonical signed legal chain evaluated at `asOf`**, not a
historical reconstruction of what Portfolio knew on that date.

An effective agreement must have signed identity and a legal period covering
`asOf`. A signed successor bounds its predecessor at the successor's
`effectiveFrom`, even though canonical lease history deliberately does not
rewrite the predecessor's original `effectiveTo`. Therefore a superseded
agreement may still be the correct effective agreement for a date before its
signed successor becomes effective.

When no signed agreement governs `asOf`, the next signed agreement in the
current canonical chain may be returned as `future_signed`.

Draft Agreements are **not** legal as-of coverage. They are current workflow
state and are exposed separately as:

```text
currentDraftAgreementCount
```

The selected agreement's current lifecycle status is returned as current
metadata only; it does not replace legal successor-boundary semantics.

The effective TenancyTermVersion follows the same canonical legal chain and the
latest valid `effectiveFrom <= asOf`. Recurring charges remain exact strings
and retain their source billing frequency; reporting does not invent monthly
normalization.

### Current operational state

These values are explicitly named `currentOperations` and do **not** pretend
to be historical at `asOf`:

- open MaintenanceIssue counts and priorities;
- nonterminal MaintenanceWorkOrder count;
- current Asset placement/status counts;
- current active ServicePlan count;
- current open WarrantyClaim count;
- current active Meter count.

A request with an old `asOf` therefore means:

```text
historically evaluable occupancy/contract/cost cutoff
+
current operational workload/inventory
```

The API exposes that distinction instead of hiding it.

### Cost reporting

Cost reporting uses the current effective ledger:

- original Costs with an outgoing CostReversal are excluded;
- replacement Costs participate normally unless they are themselves reversed;
- only `incurredOn <= asOf` participates.

This is a **currently corrected ledger filtered by business date**, not a
historical "what the system knew on that date" ledger.

Money is always grouped by currency. No cross-currency total exists.

Each summary keeps:

- CAPEX;
- OPEX;
- unclassified;
- total.

All values are exact two-decimal strings.

### Unit cost attribution

Unit reporting only includes Costs whose Unit attribution is deterministic from
durable parent truth:

- Unit;
- Space -> immutable Space.unitId;
- Unit-scoped ImprovementProject;
- WorkItem / WorkRecord / WorkMaterial -> Project Unit;
- MaintenanceIssue -> immutable Unit snapshot;
- MaintenanceWorkOrder -> Issue Unit.

Property-wide Costs are not copied into every Unit.

Asset/WarrantyClaim/ServiceEvent direct Cost sources are not assigned to a Unit
from current Asset placement because Cost occurrence has date precision while
Asset location has instant precision. Guessing the Unit would corrupt reporting.

Portfolio-wide cost totals can include every effective Cost because they need
no Unit attribution.

### Unit lifecycle / occupancy separation

Reporting does not use the legacy database `units.status` column to derive
occupancy.

Physical Unit lifecycle and occupancy are separate concepts; Tenancy is the
occupancy source of truth.

Canonical #23 therefore avoids propagating any legacy occupancy flag into the
new projection.

### Portfolio dashboard

The dashboard contains:

- current Property/Unit inventory counts;
- Unit occupancy counts at `asOf`;
- current operational Maintenance/Asset/Service/Meter counts;
- current-effective portfolio Cost totals through `asOf`, grouped by currency;
- per-Property Unit/occupancy/current-operations summaries.

It is a summary/read model only.

## Acceptance

Canonical #23 must prove at minimum:

1. no writable reporting table is introduced;
2. every query receives an explicit valid `asOf` date;
3. Unit occupancy comes from Tenancy temporal truth, not Unit status;
4. actual occupancy takes precedence over planned reservation;
5. date-only occupancy/contract facts remain date-only;
6. effective agreement selection follows the canonical signed successor chain:
   a predecessor governs only until a signed successor's effective boundary;
7. superseded current status does not erase predecessor historical business-date
   coverage before the successor boundary;
8. draft agreements are exposed only as current workflow metadata
   (`currentDraftAgreementCount`), never as legal as-of coverage;
9. effective terms use the latest valid `effectiveFrom <= asOf` under the same
   legal chain;
10. recurring money remains exact and frequency-aware;
11. current operational counts are labeled current rather than historical;
12. reversed Costs do not contribute to effective totals;
13. replacement Costs contribute normally when not reversed;
14. unlike currencies are never summed;
15. Unit costs use only deterministic durable Unit attribution;
16. Property-wide and ambiguous Asset/Service/Warranty Costs do not leak into
    Unit totals;
17. Portfolio cost totals include all effective Costs independent of Unit
    attribution;
18. Property dashboard rows cannot leak another Property's Units;
19. Reporting reads require `portfolio:read`;
20. reporting projections are not accepted as write commands.

## Deferred

Canonical #23 does not implement:

- accounting/P&L;
- FX conversion;
- budget vs actual;
- invoicing or receivables;
- occupancy-rate time series;
- historical current-state reconstruction;
- materialized reporting warehouse;
- BI cubes;
- monthly normalization of non-monthly rent;
- cost allocation heuristics for ambiguous Asset/Service/Warranty sources;
- revenue recognition.

Those require explicit future semantics rather than dashboard arithmetic.
