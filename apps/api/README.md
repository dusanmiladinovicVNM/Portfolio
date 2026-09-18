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
