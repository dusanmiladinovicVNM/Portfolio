# Canonical PR roadmap

This is the canonical implementation sequence for Portfolio.

The order is dependency-driven. A planned PR may be split if evidence shows that its domain grain is too broad, but features must not be pulled forward in a way that makes later contexts depend on provisional truth.

## Foundation and rental core

| PR | Scope | Status |
| --- | --- | --- |
| #1 | Bootstrap architecture + Portfolio core | DONE |
| #2 | Portable persistence + first application/API vertical slice | DONE |
| #3 | Auth + HTTP/API boundary | DONE |
| #4 | Party + Ownership | DONE |
| #5 | Tenancy backbone | DONE |
| #6 | LeaseAgreement + effective terms | DONE |
| #7 | Core Hardening A — Unit/Tenancy temporal truth | DONE |
| #8 | Core Hardening B — lease successor chain + bounded term history | DONE |
| #9 | Core Boundary Hardening — DTOs, routing, lockfile, transaction rule | IN PROGRESS |

## Evidence and operational domains

### PR #10 — Documents foundation

- Document
- DocumentVersion
- DocumentLink
- immutable/final version rules
- content hash
- FileStoragePort
- Google Drive first adapter

Binary storage must not become business identity.

### PR #11 — Inspection domain backbone

Use HandoverApp as a feature bank only.

- Inspection
- inspection type/lifecycle
- versioned schema
- sections/responses
- findings
- Unit/Tenancy references

### PR #12 — Inspection evidence and finalization

- document/photo links
- signatures
- immutable final snapshot
- generated final evidence/PDF boundary
- finalization invariants

### PR #13 — Asset Registry

- Asset
- manufacturer/model/serial
- structured identifiers
- Unit/Space placement
- lifecycle/status
- replacement relationships

### PR #14 — Asset history + tenancy inventory

- AssetLocationHistory
- condition assessments/history
- TenancyAssetAssignment
- move-in/move-out inventory truth

### PR #15 — Warranty + Service

- Warranty
- WarrantyClaim
- ServicePlan
- ServiceEvent
- ServicePart

Service history must reference the exact physical Asset identity.

### PR #16 — Improvements / Works

- ImprovementProject
- WorkItem
- WorkMaterial
- ProjectAsset
- contractor/work history

### PR #17 — Unified Cost Ledger

- normalized Cost
- source links
- supplier/invoice references
- exact money
- CAPEX/OPEX reporting metadata

Cost is a financial projection/fact, not a substitute for its source business entity.

### PR #18 — Maintenance

- Issue
- WorkOrder
- assignment/status/priority
- Inspection finding → Issue linkage
- Asset/Service/Cost links

### PR #19 — Keys + Access

- keys
- cards
- remotes
- issue/return/loss history
- Tenancy assignments
- immutable access-item transactions

### PR #20 — Meters + Utilities

- meter identity
- Unit/Space placement
- readings
- move-in/move-out readings
- historical consumption basis

## Read models and product surface

### PR #21 — Domain Events + Unit Timeline

- business-event projection
- Unit dossier timeline
- cross-context chronology
- technical audit remains separate from domain timeline

### PR #22 — Reporting / Portfolio projections

- Unit overview
- occupancy/tenancy status
- contract status
- investments/costs
- maintenance
- asset/service summaries
- portfolio dashboards

### PR #23 — React/Vite PWA + Unit dossier

- authenticated internal shell
- navigation
- Unit-centric UX
- typed API client
- Portfolio/Party/Tenancy/Contracts/Documents/Assets surfaces
- no raw database business writes from React

### PR #24 — Field workflow + offline

- inspection field UX
- section autosave
- IndexedDB/local cache
- reconnect/retry
- optimistic conflict handling
- photo/signature workflows
- mobile/PWA behavior

## PR #25 — Production hardening + MVP release

Final MVP gate:

- backup automation
- restore rehearsal
- migration rehearsal
- full lifecycle E2E
- authorization/security gates
- audit checks
- observability
- deployment runbook
- recovery runbook

A release is not complete until restore has been proven.

## Professional-stack port

The professional-stack port is deliberately **not** part of the MVP PR sequence.

Introduce it only when an operational requirement justifies the infrastructure change.

Expected replacement:

```text
React/Vite PWA                stays
API contracts                 stay
application commands/queries  stay
domain                        stays
PostgreSQL semantics          stay

Supabase Edge Functions
          ↓
Fastify / Node host

Supabase PostgreSQL
          ↓
managed PostgreSQL provider

Google Drive adapter
          ↓
S3/R2-compatible adapter
```

If moving from Supabase to Fastify requires redesigning Tenancy, Contracts, Assets, Inspections or application use cases, the portability boundary was designed incorrectly.
