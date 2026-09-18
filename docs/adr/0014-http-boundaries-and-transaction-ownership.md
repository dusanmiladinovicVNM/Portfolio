# ADR 0014: HTTP response boundaries and transaction ownership

**Status:** Accepted

## Context

By PR #8, request validation schemas already existed, but handlers often serialized domain objects directly.

That created an accidental coupling:

```text
domain object shape == public JSON shape
```

At the same time, architecture documentation said commands own transaction boundaries while some repository methods correctly used local PostgreSQL transactions for aggregate operations.

Both boundaries needed to be explicit before adding Documents and more bounded contexts.

## HTTP response decision

Public HTTP responses are explicit DTOs defined by `packages/contracts`.

Every exposed domain object is mapped through a dedicated `toXResponse()` mapper.

Handlers must not return domain/application objects directly.

A new internal domain field therefore remains internal until the response contract and mapper are deliberately changed.

Request validation and response mapping are separate concerns:

- request schemas validate untrusted transport input;
- response mappers define the stable outward projection.

The root handler does not own business-specific routes. Portfolio, Party, Ownership, Tenancy and Contracts each have their own route module.

## Transaction ownership decision

The application command owns the **semantic** transaction boundary: it defines which business effects form one indivisible operation.

The infrastructure adapter owns the mechanism that realizes atomicity.

When one repository/bounded-context port owns all affected records, that repository method may use a local database transaction.

Example:

```text
sign successor agreement
  + supersede predecessor
  + insert term snapshot
```

is one Contracts operation and may be implemented atomically inside LeaseRepository.

A generic application UnitOfWork is intentionally not introduced yet.

It becomes justified only when a real command must atomically coordinate multiple independent repository ports and the operation cannot be modeled cleanly behind one owning port.

## Consequences

- domain evolution cannot silently widen the HTTP API;
- transport modules remain small as more bounded contexts are added;
- repository-local transactions remain valid rather than being treated as architecture violations;
- cross-repository transaction infrastructure is deferred until an actual use case requires it;
- a future Fastify host can reuse the same response contracts and transaction semantics.
