# Architecture

## Context

Portfolio is a greenfield internal property-lifecycle system. The old HandoverApp is a feature bank, not a codebase to migrate.

The MVP intentionally uses inexpensive infrastructure, but the architecture must not depend on that infrastructure.

## Architectural style

**Modular monolith with ports and adapters.**

The system is split by business capability rather than by technical layers shared across the whole codebase.

Planned bounded contexts:

1. Portfolio
2. Parties
3. Ownership
4. Tenancy
5. Contracts
6. Inspections
7. Assets
8. Maintenance
9. Improvements
10. Costs
11. Documents
12. Timeline/Audit

## Dependency direction

```text
apps/web ───────────────┐
apps/api ───────────────┤
                       ▼
                packages/application
                       ▼
                  packages/domain
                       ▲
                       │ implements ports
                       │
          infrastructure / integrations
```

### Hard rule

`packages/domain` may import **no framework or infrastructure package**.

In particular it must not import:

- Supabase clients
- Deno APIs
- Node-specific infrastructure APIs
- React
- Google APIs
- storage SDKs

`packages/application` may depend on domain and on port interfaces, but not concrete infrastructure implementations.

## MVP infrastructure

The MVP uses:

- Supabase PostgreSQL as canonical relational storage
- Supabase Auth when authentication is introduced
- Supabase Edge Functions as the first HTTP transport/application host
- Google Drive behind `FileStoragePort` for binary documents

Supabase is a provider, not the system architecture.

## Future port

Expected later topology:

```text
React/Vite PWA
    ↓ HTTP/JSON
Fastify API
    ↓
same application layer
    ↓
same domain layer
    ↓
PostgreSQL repositories
    ↓
managed PostgreSQL

FileStoragePort → S3/R2/etc.
```

Porting must not require changes to domain entities, business invariants, use-case contracts, or database semantics.

## Data ownership

Each bounded context owns its writes.

Examples:

- Portfolio owns Property, Unit and Space lifecycle.
- Tenancy owns Tenancy state.
- Contracts owns agreement/amendment state.
- Assets owns asset identity and lifecycle.
- Maintenance cannot mutate an Asset directly; it requests an Asset-domain operation where required.

Cross-context workflows belong in the application layer.

## Database rules

PostgreSQL is canonical.

Use database constraints for facts that must remain true regardless of caller:

- PK/FK
- UNIQUE
- NOT NULL
- CHECK
- exclusion constraints where appropriate

Do not hide core business workflows in triggers.

Small mechanical triggers may be considered later only when their behavior is explicit and tested.

## Commands and queries

No CQRS framework is required, but use cases are classified as:

- **Query**: reads state and has no business side effects.
- **Command**: changes state and owns the semantic transaction boundary.

The application command decides what must succeed or fail as one business operation. Infrastructure decides how that atomicity is implemented.

A repository operation may use its own database transaction when the complete mutation belongs to one repository/bounded-context port. This is the current pattern for operations such as signing a LeaseAgreement together with its term snapshot and predecessor supersession.

Do not introduce a generic UnitOfWork merely to move transaction syntax upward.

Introduce an application-level TransactionManager/UnitOfWork port only when a real command must atomically coordinate multiple independent repository ports and no single owning repository operation can represent that business mutation cleanly.

A command that changes multiple records must execute atomically regardless of which adapter realizes the transaction.

## HTTP contract boundary

Domain/application objects are not serialized directly as public JSON.

Each route maps returned domain state through an explicit response DTO mapper whose shape is defined by `packages/contracts`.

This prevents an internal domain-field addition or refactor from silently changing the HTTP API.

Route modules are split by bounded context. The root HTTP handler owns only cross-cutting transport concerns such as authentication, base-path routing, dispatch and error mapping.

## Frontend boundary

React components must not scatter raw table writes.

UI code calls typed application/API clients such as:

```text
createUnit(...)
terminateTenancy(...)
replaceAsset(...)
finalizeInspection(...)
```

The implementation behind those contracts may change from Supabase Edge Functions to Fastify without changing page-level behavior.

## Historical truth

Long-lived business evidence is append-only or versioned where appropriate.

Examples:

- signed agreements are immutable;
- agreement changes create amendments/new term versions;
- asset service events are historical records;
- asset location changes preserve history;
- finalized inspections preserve immutable snapshots;
- financial corrections use compensating records rather than destructive rewriting.
