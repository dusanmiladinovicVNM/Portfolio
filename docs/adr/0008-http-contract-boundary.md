# ADR 0008: Provider-neutral HTTP contract

**Status:** Accepted

## Decision

Portfolio exposes business use cases through an HTTP contract owned by `@portfolio/http`.

The handler is based on standard Web `Request`/`Response` types and receives an already verified external identity. It has no Supabase dependency.

The MVP Supabase host is a composition adapter:

1. verify/authenticate the user with Supabase;
2. extract the verified JWT subject;
3. pass `VerifiedIdentity { provider, subject }` to the HTTP handler;
4. let the application resolve the internal Actor and authorize the use case.

## Response shape

Success:

```json
{ "data": {} }
```

Failure:

```json
{ "error": { "code": "FORBIDDEN", "message": "..." } }
```

Expected mappings include:

- 400 invalid transport request
- 401 unauthenticated/unmapped identity
- 403 insufficient Portfolio capability
- 404 missing resource/route
- 409 business uniqueness conflict
- 500 unexpected infrastructure failure

## Consequences

React will depend on Portfolio's HTTP contract, not Supabase tables.

Moving to Fastify later requires a new host adapter, not new page/domain/application contracts.
