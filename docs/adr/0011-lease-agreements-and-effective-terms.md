# ADR 0011: Lease documents and effective terms are separate histories

**Status:** Accepted

## Decision

Tenancy remains the operational occupancy relationship.

LeaseAgreement is the legal agreement governing that relationship.

```text
Tenancy
  ├─ LeaseAgreement
  │   └─ AgreementParty → Party
  ├─ LeaseAmendment
  └─ TenancyTermVersion
```

## Signed-document immutability

Agreement content and AgreementParty composition become immutable after signing.

A signed amendment is also immutable.

PostgreSQL triggers enforce this independently of application code.

Future PDF/document storage will link immutable binary/document versions to these legal records. Binary storage is intentionally not introduced in this PR.

## Effective term history

Current rent, deposit and notice terms are **not mutable columns on Tenancy**.

Every signed agreement or amendment emits one complete immutable `TenancyTermVersion` snapshot.

A version has `effectiveFrom`, but no mutable `validTo`. Terms effective on any historical date are resolved as:

```sql
latest version where effective_from <= requested_date
```

This makes the term ledger append-only and removes the need to rewrite the previous version when a new amendment starts.

Only one term version may start on the same date for one Tenancy.

## Money

Money crosses TypeScript boundaries as canonical decimal strings.

Examples:

- `850.50`
- `120.00`
- `1700.00`

The domain never uses JS floating-point numbers for money.

PostgreSQL stores money as `numeric(18,2)`.

## Agreement parties

Agreement parties are a legal snapshot, not a live query of TenancyParty.

Tenant/co-tenant/guarantor legal roles must correspond to matching TenancyParty roles when a new agreement is created/signed.

Landlord and authorized signatory are legal agreement roles and do not imply Party master duplication.

## Atomicity

Signing an agreement/amendment and creating its effective term snapshot is one repository transaction.

The system must never persist:

- a signed agreement with no initial term version;
- a signed amendment with no resulting term version.

## Portability

The domain/application model is provider-neutral.

PostgreSQL constraints/triggers are portable to the planned professional PostgreSQL stack. Supabase remains the MVP host only.
