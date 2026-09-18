# ADR 0005: UUID primary keys plus human-readable codes

**Status:** Accepted

## Decision

Internal entity identity uses UUID primary keys.

Human-facing references use a separate code field where useful, for example `PROP-00001`, `UNIT-00012`, `AST-00124`.

## Why

Display/reference formats can change without changing relational identity. UUIDs also avoid central sequence coupling during imports, offline workflows and future integrations.

## Consequences

- display code is never a foreign key;
- imported legacy IDs, if needed, are stored as explicit source references;
- changing a code does not change entity identity.
