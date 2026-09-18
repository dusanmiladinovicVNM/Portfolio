# ADR 0010: Tenancy is an operational lifecycle aggregate

**Status:** Accepted — temporal collision model amended by ADR 0012

## Decision

A Tenancy represents the operational occupancy/rental relationship for one Unit.

It is not a lease document and does not own duplicated tenant identity data.

```text
Unit
  └─ Tenancy
      └─ TenancyParty → Party
```

LeaseAgreement will be a separate bounded context linked to Tenancy.

## Lifecycle

```text
draft → planned → active → notice_given → move_out_pending → ended
  └──────────────→ cancelled
planned ─────────→ cancelled
active ───────────────────────────────────────────────→ ended
notice_given ─────────────────────────────────────────→ ended
```

Terminal states are `ended` and `cancelled`.

Lifecycle changes are explicit application commands. Generic status updates are not exposed.

## Temporal occupancy

The original version of this ADR modeled planned reservations and actual occupancy as one mixed effective period.

That decision is superseded by [ADR 0012](./0012-unit-and-tenancy-temporal-truth.md).

The canonical model now treats:

- planned reservation;
- actual occupancy;

as separate temporal concepts with separate collision rules.

## Concurrency

Tenancy is versioned from `version = 1`.

Every aggregate mutation increments the version. Repository updates compare the persisted version with the version originally read.

Application/HTTP mutation requests also carry `expectedVersion`, preventing stale clients from silently applying lifecycle actions to a newer state.

## Parties

TenancyParty references the shared Party master.

Initial roles:

- tenant
- co_tenant
- guarantor
- authorized_occupant

At least one tenant/co-tenant is required before activation.

The MVP relationship applies to the tenancy as a whole. Temporal party membership is intentionally deferred until a real mid-tenancy party-change workflow requires it, likely together with contract amendments.

## Portability

All rules above are domain/application/PostgreSQL rules. Supabase contributes hosting only.
