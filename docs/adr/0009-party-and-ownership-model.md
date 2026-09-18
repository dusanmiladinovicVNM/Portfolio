# ADR 0009: Party master and ownership-period aggregate

**Status:** Accepted

## Party

A Party is the stable identity of one person or company.

Owner, tenant, contractor and supplier are **roles/relationships**, not separate master tables.

Party owns contact points and addresses. These records use Portfolio UUID identity and are persisted atomically with Party creation.

## Ownership

Unit ownership is modeled as an `OwnershipPeriod` aggregate:

```text
OwnershipPeriod
  unit
  validFrom
  validTo
  owners[]
      party
      shareBasisPoints
```

A period represents the complete legal ownership composition for that unit during the interval.

Examples:

```text
2025-01-01 → 2026-06-30
  Party A 100%

2026-07-01 → open
  Party A 50%
  Party B 50%
```

This is preferred over independent owner rows because ownership changes are changes to a composition, not isolated facts that should later be reconstructed.

## Share representation

Shares are integers in basis points:

- 10000 = 100%
- 5000 = 50%
- 1250 = 12.5%

This avoids binary floating-point errors in the domain model.

The aggregate enforces exactly 10000 basis points.

## Temporal integrity

Ownership periods for the same Unit may not overlap.

The application performs a readable pre-check. PostgreSQL independently enforces the invariant with a GiST exclusion constraint using `btree_gist`, protecting against concurrent writes.

## Portability

`btree_gist` is a standard PostgreSQL extension and remains isolated to database integrity. If a future PostgreSQL provider lacks it, the migration can replace that constraint without changing domain/application contracts.
