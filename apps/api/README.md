# API

MVP host composition for Supabase Edge Functions.

## Boundary

Supabase verifies the external user credential. The host extracts the verified JWT subject and passes only:

```ts
{ provider: 'supabase', subject: '<verified sub>' }
```

to the provider-neutral HTTP/application layers.

Portfolio authorization is **not** taken from JWT role claims. The application resolves the verified subject through `auth_identities` to an active internal `app_users` record and applies Portfolio capabilities.

## Database connection

The host uses Postgres.js with:

- `max: 1`
- `prepare: false`
- TLS required

This matches Supabase's transaction-pooler guidance for transient/serverless runtimes.

The connection URL is runtime configuration and must come from project secrets/environment. It is never committed.

## Portability

A future Fastify host replaces this package's composition/authentication edge. It reuses:

- `@portfolio/http`
- `@portfolio/application`
- `@portfolio/infrastructure`
- the PostgreSQL schema

No business use case depends on Supabase runtime types.

## Operations

The composition root accepts optional `serviceVersion`, `readinessTimeoutMs` and `logger` values.

Production should pass the exact release commit SHA as `serviceVersion`. It is
returned by the health endpoints so an operator can prove which build is
serving traffic.

If no logger is supplied, the host emits one JSON object per operational event
to stdout/stderr. A deployment may inject another `OperationalLogger` sink
without changing application behavior.

Health endpoints:

~~~text
GET <basePath>/health/live
GET <basePath>/health/ready
~~~

They are intentionally unauthenticated. Liveness has no dependency probe;
readiness executes a minimal PostgreSQL query with a bounded dependency budget (1000 ms by default) and returns 503 without leaking provider/database error details when the probe fails or times out.
