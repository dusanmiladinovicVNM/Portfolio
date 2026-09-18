# ADR 0012: Unit lifecycle and Tenancy temporal truth

**Status:** Accepted

## Unit status

Unit does not own occupancy state.

`Unit.status` is administrative lifecycle only:

- `active`
- `inactive`
- `archived`

Values such as `vacant`, `occupied` and `turnover` are not canonical Unit state.

Vacancy/occupancy must be derived from Tenancy for the relevant date. Future readiness/turnover workflow belongs to operations/inspection/maintenance, not to Unit master identity.

## Planned reservation versus actual occupancy

They are different temporal truths.

### Planned reservation

A Tenancy in `planned` reserves its `plannedStart..plannedEnd` interval.

Two planned reservations for one Unit cannot overlap.

A new planned reservation also cannot overlap already known actual occupancy. Therefore an open-ended active Tenancy blocks creation of a successor reservation until a known termination boundary exists.

### Actual occupancy

Statuses `active`, `notice_given`, `move_out_pending` and `ended` participate in actual occupancy collision rules.

Two actual occupancy intervals for one Unit cannot overlap.

Activation checks actual occupancy only. A future planned reservation does not block activation of the Tenancy that is becoming actual.

Actual facts have priority over plans. If actual occupancy later overruns an existing future reservation, recording the actual fact is not rejected merely because of the reservation. The future Tenancy cannot activate until the actual conflict is resolved.

## TenancyParty history

The current TenancyParty model is not temporal.

Until temporal membership exists, parties may only be added/changed while Tenancy is `draft` or `planned`.

Once actual occupancy begins, party composition is frozen. A future feature that supports mid-tenancy party changes must introduce explicit temporal membership rather than rewriting this rule.

## Notice dates

For a notice-bearing Tenancy:

```text
actualStart <= noticeGivenAt <= terminationEffectiveAt
```

The domain and PostgreSQL both enforce the ordering.
