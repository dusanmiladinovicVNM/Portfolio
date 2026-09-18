# ADR 0006: Explicit PostgreSQL repository adapter

**Status:** Accepted

## Decision

The MVP persistence implementation uses explicit PostgreSQL queries behind application repository interfaces.

The first runtime driver is Postgres.js, isolated in `@portfolio/infrastructure`.

## Why

The domain is relational and PostgreSQL is already the canonical store. Keeping SQL explicit:

- makes data access behavior reviewable;
- keeps PostgreSQL constraints visible;
- avoids coupling the business model to Supabase's generated Data API;
- avoids making an ORM's metadata model another canonical representation;
- allows the same repository implementation to run from the MVP Edge host and a later Node/Fastify host.

## Supabase boundary

Supabase remains the MVP provider. Edge/serverless code must connect through the provider-recommended pooled connection mode and may configure the driver for that runtime.

Runtime connection configuration belongs to the host, not the repository.

## Future change

An ORM may be introduced later if repeated mapping/query complexity produces a demonstrated maintenance benefit. Such a change must remain inside infrastructure and must not alter domain/application contracts.
