# Portfolio

Greenfield property-lifecycle system for internal company use.

Portfolio is designed around the long-lived identity of a property/unit rather than around a single inspection. The existing HandoverApp is a **feature bank only**: it informs requirements and UX, but its GAS/Sheets architecture and data model are not inherited.

## Architectural direction

- **Frontend:** React + TypeScript + Vite
- **MVP runtime:** Supabase Free
- **Canonical data store:** PostgreSQL
- **MVP API host:** Supabase Edge Functions
- **Files:** storage abstraction; Google Drive adapter first
- **Business core:** pure TypeScript, independent of Supabase/GAS
- **Later professional port:** Fastify/Node + managed PostgreSQL + S3-compatible storage without rewriting the domain/application core

Dependency rule:

```text
web / transport
      ↓
application
      ↓
domain
      ↑
infrastructure implements ports
```

Supabase, Google Drive, Deno, React and future Fastify code must not leak into the domain package.

## Current milestone

Bootstrap the architecture and establish the first vertical domain slice:

```text
Property → Unit → Space
```

See [docs/ROADMAP.md](docs/ROADMAP.md).
