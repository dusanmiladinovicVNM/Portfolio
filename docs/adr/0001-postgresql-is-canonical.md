# ADR 0001: PostgreSQL is the canonical relational store

**Status:** Accepted

## Decision

Portfolio business state is stored canonically in PostgreSQL.

Supabase is the MVP PostgreSQL provider; it is not the canonical abstraction.

## Consequences

- schema changes are versioned as PostgreSQL migrations;
- relational integrity is expressed with standard PostgreSQL constraints;
- provider-specific features are avoided unless isolated and justified by an ADR;
- moving to another PostgreSQL provider must be a dump/restore plus infrastructure change, not a domain rewrite;
- spreadsheets may be used for export/reporting but not as canonical business storage.
