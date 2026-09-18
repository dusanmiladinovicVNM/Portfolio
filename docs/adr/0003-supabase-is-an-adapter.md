# ADR 0003: Supabase is MVP infrastructure, not architecture

**Status:** Accepted

## Decision

Supabase Free provides MVP PostgreSQL, Auth and Edge Function hosting. Supabase-specific code is restricted to transport/infrastructure adapters.

## Rules

- no Supabase imports in `packages/domain`;
- no Supabase imports in domain-facing application contracts;
- React components do not perform raw multi-table business mutations;
- complex writes execute behind an application command with one transaction boundary;
- RLS is defense-in-depth/authorization infrastructure, not the sole location of business rules.

## Port path

A later Fastify/Node host must be able to call the same application use cases and repository contracts.
