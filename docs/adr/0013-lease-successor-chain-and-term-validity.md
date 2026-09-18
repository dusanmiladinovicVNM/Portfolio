# ADR 0013: Lease successor chain and bounded term validity

**Status:** Accepted

## Context

LeaseAgreement already represented a legal record and TenancyTermVersion stored immutable commercial/legal snapshots.

Two semantic gaps remained:

1. `renewal` and `replacement` were labels without a predecessor/successor relationship;
2. an as-of term query could return the last known term forever, even after the governing agreement had expired.

## Decision

Lease agreements form a linear successor chain inside one Tenancy.

```text
Initial Agreement
      ↓
Replacement / Renewal
      ↓
Replacement / Renewal
```

An initial agreement has no predecessor.

A renewal/replacement must reference one currently signed predecessor in the same Tenancy.

A predecessor may have at most one non-cancelled direct successor.

## Signing a successor

Creating a draft successor does not supersede the predecessor.

When the successor is signed, one transaction must:

1. sign the successor;
2. supersede the predecessor;
3. emit the successor TenancyTermVersion.

If any step fails, all three changes roll back.

This preserves a useful distinction between a prepared future contract and a legally signed successor.

## Legal content is never rewritten

A signed predecessor's `effectiveTo` is legal document content and remains immutable.

Signing a successor does not shorten or rewrite that field.

Instead, the governing window used for historical term resolution is derived as:

```text
agreement.effectiveFrom
    through min(
      agreement.effectiveTo,
      signedSuccessor.effectiveFrom - 1 day
    )
```

where a missing bound is treated as open-ended.

This means an early replacement can take over without falsifying the text of the old signed agreement.

## Effective term query

For a requested date, a term version is eligible only when:

- its own `effectiveFrom <= requestedDate`;
- its governing agreement has started;
- the governing agreement has not passed its signed `effectiveTo`;
- no signed successor has already become effective.

The latest eligible term version wins.

Therefore an expired agreement does not silently supply terms years later, and terms from a superseded agreement remain historically visible before the successor boundary.

## Term-source integrity

A new term version may only be emitted from a signed legal source.

Its source must:

- belong to the same Tenancy;
- be signed at emission time;
- have the same effective date as the term snapshot.

PostgreSQL independently enforces these facts.

## Portability

The successor-chain model is domain/application/PostgreSQL semantics.

It has no Supabase-specific dependency and remains valid under a future Fastify + managed PostgreSQL deployment.
