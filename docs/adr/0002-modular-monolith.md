# ADR 0002: Modular monolith with ports and adapters

**Status:** Accepted

## Decision

Portfolio is a modular monolith. Business modules have explicit ownership boundaries. External services are accessed through ports implemented by infrastructure adapters.

## Why

A solo-developed internal system benefits from one deployable application and one relational database. Microservices would add deployment, observability and distributed-transaction costs without a matching business benefit.

Ports/adapters preserve replaceability of MVP providers.

## Consequences

- modules communicate through explicit application use cases;
- cross-module writes are coordinated by the application layer;
- no framework types leak into domain APIs;
- future extraction of a module is possible but not an MVP goal.
