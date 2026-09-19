# ADR 0023: Unified Cost Ledger is append-only financial allocation

**Status:** Accepted

## Context

Canonical #18 introduces financial truth after Assets, Service and Improvements already have stable business grains.

The main modeling risks are:

- putting money fields back into ServiceEvent, WorkRecord or WorkMaterial;
- allowing one Cost to point at several sources and then double-counting it in reporting;
- treating supplier invoice reference as an Invoice aggregate before invoice/AP workflow exists;
- mutating financial history in place when a correction is discovered;
- summing different currencies as if they were directly comparable.

## Decision

The financial grain is:

```text
Cost
  ├─ exactly one CostSource
  └─ optional CostReversal
         └─ optional replacement Cost
```

### Cost

One Cost is one positive monetary allocation to one exact business source.

It records:

- positive exact decimal amount;
- ISO 4217 currency;
- `incurredOn` business date;
- reporting class `capex|opex|unclassified`;
- optional supplier Party;
- optional external invoice reference;
- description;
- immutable recording provenance.

`incurredOn` is a historical financial-fact date and cannot be after the UTC calendar date of `recordedAt`.

Supplier Party is historical identity: it must exist, but need not still be active.

Invoice reference is an external reference string, **not** an Invoice aggregate. Multiple Cost rows may deliberately share the same supplier + invoice reference because one supplier invoice may contain several allocations.

### CostSource

Every Cost has exactly one source. Supported sources in this phase are:

- Property
- Unit
- Space
- Asset
- WarrantyClaim
- ServiceEvent
- ImprovementProject
- WorkItem
- WorkRecord
- WorkMaterial

A Cost source identifies what the money is allocated **to**. Cost never becomes the source entity's state machine and cannot mutate it.

Exactly one source avoids ambiguous allocation and double-counting. If one invoice covers several sources, the user records several Cost rows whose amounts are the explicit allocations.

The database stores typed nullable foreign keys plus a source-kind discriminator and enforces that exactly one target is present and matches the discriminator. No opaque polymorphic UUID is accepted.

### Reporting class

`capex|opex|unclassified` is reporting metadata, not accounting advice or a tax determination.

`unclassified` is intentional: Portfolio must not invent CAPEX/OPEX certainty when the user has not classified the cost yet.

Because Cost is append-only, correcting reporting class uses the same reversal/replacement workflow as correcting amount, source or supplier.

### Corrections and reversals

Cost rows are immutable.

A CostReversal fully negates one exact prior Cost. One Cost may be reversed at most once.

A reversal may optionally identify one replacement Cost. This represents a correction:

```text
wrong Cost
   ↓ full reversal
replacement Cost
```

The replacement is itself a normal immutable Cost and may later be reversed again, producing an auditable correction chain.

A reversal without a replacement is a void/cancellation of the original financial fact.

Reversal time cannot predate the original Cost's `recordedAt`. When a replacement exists, it is created in the same application transaction as the reversal.

Partial corrections are represented as full reversal + corrected replacement Cost in this phase. Supplier credit-note/AP settlement semantics are deliberately not invented here.

### Currency

Each Cost retains its own currency.

Portfolio must never sum unlike currencies into one amount without an explicit future FX/conversion model. Reporting before that model groups/totals by currency.

## Boundaries

Canonical #18 does **not** create:

- supplier Invoice aggregate;
- accounts payable/payment state;
- tax/VAT calculation;
- purchase orders;
- bank reconciliation;
- FX conversion/rates;
- budget/forecast entities;
- Maintenance Issue/WorkOrder (#19).

Cost is a financial fact/projection linked to existing business truth, not a substitute for it.

## Consequences

- Service/Improvement/Maintenance contexts remain free of embedded mutable money;
- reporting can aggregate Costs without reading free-text amounts from operational records;
- one Cost cannot be accidentally counted under multiple source links;
- invoice references remain lightweight until real invoice workflow is justified;
- corrections preserve the original fact and actor/time provenance;
- multi-currency reporting remains honest instead of silently adding incompatible units.
