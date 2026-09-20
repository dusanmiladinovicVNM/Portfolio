# ADR 0026 — Meters, readings and Tenancy boundary readings

## Status

Accepted for canonical PR #21 implementation.

## Context

Portfolio needs canonical utility measurement truth for Unit dossiers, handovers and later reporting. Inspection responses may contain meter-like numbers, but form answers are evidence and must not silently become canonical utility facts.

The model must distinguish:

1. one exact physical meter;
2. one physical register observation;
3. the business role that an observation plays at a Tenancy move-in or move-out boundary;
4. later consumption projection derived from observations.

These are different grains.

## Decision

### Canonical Instant policy

Every Portfolio field that represents an instant, rather than a date-only business date, requires an explicit timezone in external/domain input:

```text
...Z
or
...+02:00
```

Offset-less values such as:

```text
2026-09-20T00:30:00
```

are invalid because JavaScript runtime timezone and PostgreSQL session timezone could otherwise assign different instants to the same text.

The shared domain `asInstant()` and contracts `instantSchema` both enforce the explicit offset and normalize accepted values to UTC ISO. This policy is cross-context and is also used by Access, Assets, Service, Cost, Improvements, Inspections, Maintenance and Documents. Date-only fields such as Tenancy actualStart/actualEnd remain date-only and are not converted into instants.

### Meter

One `Meter` is one exact physical cumulative utility meter.

Supported utility classifications are:

- `electricity`
- `gas`
- `water`
- `heat`

Supported measurement units are:

- `kwh`
- `m3`

Canonical pair rules:

```text
electricity -> kwh
heat        -> kwh
water       -> m3
gas         -> m3 | kwh
```

A Meter belongs to exactly one Unit and optionally one Space from that Unit.

In canonical #21, Unit/Space placement is immutable. This deliberately prevents historical readings from being silently reinterpreted after a mutable placement change. Physical Meter relocation is deferred until a proper placement-history model exists.

`code` is stable internal business identity. `serialNumber` is physical descriptive identity but canonical #21 does not claim global serial-number uniqueness across manufacturers/providers.

`label` is correctable metadata under optimistic versioning.

### Meter lifecycle

Every new Meter starts:

```text
status = active
version = 1
retiredAt = null
retirementRecordedAt = null
retiredByUserId = null
retirementReason = null
```

Lifecycle:

```text
active -> retired
```

Retirement is terminal.

`retiredAt` is the physical/business occurrence; `retirementRecordedAt` is when Portfolio recorded that retirement. They are intentionally separate.

At the moment retirement is written:

```text
installedAt <= retiredAt <= retirementRecordedAt
Meter.recordedAt <= retirementRecordedAt
retiredAt >= latest reading occurrence already persisted at that moment
```

Later historical backfill remains legal only when:

```text
installedAt <= reading.readAt <= retiredAt
```

so retirement does not prevent recording a previously missed historical observation, but no observation may claim to occur after physical retirement.

Reading INSERT takes a share lock on the Meter row. Meter retirement UPDATE locks the same row. Therefore retirement and concurrent reading insertion serialize.

### MeterReading

One `MeterReading` is one append-only physical register observation:

- exact Meter;
- exact decimal register value;
- `readAt` business occurrence;
- immutable recording provenance;
- optional note.

Historical occurrence is allowed, but system provenance cannot predate the parent registration:

```text
readAt may be < Meter.recordedAt
MeterReading.recordedAt >= Meter.recordedAt
MeterReading.recordedAt >= readAt
```

Reading value is a non-negative exact decimal with at most:

- 18 whole digits;
- 6 decimal places.

Domain/API use canonical decimal strings; PostgreSQL stores unconstrained exact `numeric` and rejects excess scale/range instead of silently rounding.

MeterReading is append-only. It does not own a Tenancy reference and does not have a `move_in|move_out` context column.

That separation is intentional because one physical observation can serve more than one business boundary.

### MeterReadingBoundary

`MeterReadingBoundary` is an append-only semantic link:

```text
MeterReading
   └─ MeterReadingBoundary
        ├─ Tenancy
        └─ move_in | move_out
```

For example, a turnover observation may eventually serve as both the outgoing Tenancy move-out reading and incoming Tenancy move-in reading without duplicating the physical observation.

A boundary requires:

- Meter and Tenancy exact same Unit;
- `move_in`: UTC calendar date of `reading.readAt` equals immutable `Tenancy.actualStart`;
- `move_out`: UTC calendar date of `reading.readAt` equals immutable `Tenancy.actualEnd`.

PostgreSQL uses:

```sql
(timezone('UTC', reading.read_at))::date
```

so session timezone cannot change boundary semantics.

Each exact `Meter + Tenancy + boundary type` may exist at most once.

Boundary insertion locks the Meter row before checking that uniqueness rule, so concurrent inserts cannot both establish contradictory move-in/move-out truth.

### Tenancy parent truth

Canonical #20 already made `Tenancy.unitId` and once-set `actualStart` immutable.

Canonical #21 extends the same authoritative parent rule:

```text
actualEnd:
  null -> value is allowed when Tenancy ends
  once non-null -> immutable
```

This is global Tenancy hardening, not a Meter-specific snapshot workaround.

### Historical consumption basis

Consumption is derived only between consecutive readings of the same exact Meter, ordered by occurrence.

If:

```text
later value >= earlier value
```

the exact decimal difference is exposed as consumption basis.

If:

```text
later value < earlier value
```

the observation history is preserved, but the interval is:

```text
continuity = decrease_detected
consumption = null
```

Canonical #21 does not guess whether that decrease means rollover, reset, replacement, correction or data error.

This avoids inventing negative consumption.

Historical consumption basis is not a utility bill, tariff calculation or financial allocation.

### Authorization

- `meters:read`: read Meter/readings/boundaries;
- `meters:write`: create/correct label/retire Meter master data;
- `meter_readings:write`: append readings and boundary links.

Inspector receives `meters:read` and `meter_readings:write`, but not `meters:write`.

This permits field observations without allowing field users to rewrite Meter master identity/lifecycle.

## Acceptance

At minimum canonical #21 must prove:

1. Meter creation with exact utility/unit pair validation;
2. Space belongs to exact Meter Unit;
3. new Meter starts active/version 1 without retirement provenance;
4. physical identity/utility/placement/installation provenance cannot be rewritten;
5. label is correctable with optimistic versioning;
6. reading values preserve exact six-decimal canonical precision;
7. direct SQL over-scale reading is rejected without rounding;
8. readings cannot predate installation;
9. reading after retirement is rejected;
10. historical reading at/before retirement may be recorded later;
11. retirement cannot predate reading history already present at transition time;
12. retirement-vs-reading race serializes on the Meter row;
13. MeterReading is append-only;
14. one reading may carry multiple Tenancy boundary roles;
15. boundary Tenancy must belong to Meter Unit;
16. move-in UTC date equals Tenancy actualStart;
17. move-out UTC date equals Tenancy actualEnd;
18. actualEnd is immutable once established;
19. one Meter+Tenancy+boundary-type exists at most once;
20. concurrent duplicate boundary insertion serializes;
21. lower later register value does not produce invented negative consumption;
22. inspector may append reading/boundary facts but may not create/retire Meter master data;
23. offset-less canonical instant input is rejected while explicit offsets are UTC-normalized;
24. MeterReading.recordedAt cannot predate Meter.recordedAt while historical readAt remains legal;
25. retirementRecordedAt cannot predate Meter.recordedAt while historical retiredAt remains legal.

## Deferred

Canonical #21 intentionally does not model:

- utility provider/customer accounts;
- tariffs, advances, billing or invoices;
- Cost linkage for utility bills;
- Property/common-area meters;
- Meter placement history or physical relocation;
- explicit Meter replacement lineage;
- multi-register/tariff-register meters;
- rollover/reset semantics;
- MeterReading correction/reversal workflow;
- automatic conversion of InspectionResponse into MeterReading;
- cross-Meter consumption stitching after replacement.

Those need their own explicit grain/invariants rather than hidden assumptions inside reading arithmetic.
