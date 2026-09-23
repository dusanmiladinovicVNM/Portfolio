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
| #9 | Core Boundary Hardening — DTOs, routing, lockfile, transaction rule | DONE |
| #10 | Documents foundation — versioned evidence + FileStoragePort | DONE |
| #11 | Inspection domain backbone | DONE |
| #12 | Inspection hardening — concurrency, immutability, PATCH semantics | DONE |
| #13 | Inspection evidence and finalization | DONE |
| #14 | Asset Registry | DONE |
| #15 | Asset history + tenancy inventory | DONE |

## Evidence and operational domains

### PR #10 — Documents foundation (DONE)

- Document
- DocumentVersion
- DocumentLink
- immutable/final version rules
- content hash
- FileStoragePort
- Google Drive first adapter

Binary storage must not become business identity.

### PR #11 — Inspection domain backbone (DONE)

Use HandoverApp as a feature bank only.

- Inspection
- inspection type/lifecycle
- versioned schema
- sections/responses
- findings
- Unit/Tenancy references

### PR #12 — Inspection hardening (DONE)

- `Inspection.contentRevision` closing barrier
- per-section revision remains local autosave concurrency
- immutable Inspection historical identity
- immutable schema child ownership
- OLD/NEW parent protection for content rows
- explicit DB lifecycle transition guard
- `PATCH` section semantics with `set[]` / `clear[]`
- DB/domain parity for multiselect duplicates
- adversarial concurrency and direct-SQL sabotage tests

### PR #13 — Inspection evidence and finalization (DONE)

- document/photo links
- signatures
- immutable final snapshot
- generated final evidence/PDF boundary
- finalization invariants
- controlled unlock/signature invalidation policy

### PR #14 — Asset Registry (DONE)

- Asset
- manufacturer/model/serial
- structured identifiers
- Property placement with optional Unit/Space
- correctable name/manufacturer/model metadata
- lifecycle/status
- replacement relationships

### PR #15 — Asset history + tenancy inventory (DONE)

- AssetLocationHistory
- condition assessments/history
- TenancyAssetAssignment
- move-in/move-out inventory truth

### PR #16 — Warranty + Service (DONE)

- Warranty
- WarrantyClaim
- ServicePlan
- ServiceEvent
- ServicePart

Service history must reference the exact physical Asset identity.

### PR #17 — Improvements / Works (DONE)

- ImprovementProject
- WorkItem
- WorkMaterial
- ProjectAsset
- contractor/work history

### PR #18 — Unified Cost Ledger (DONE)

- normalized Cost
- source links
- supplier/invoice references
- exact money
- CAPEX/OPEX reporting metadata

Cost is a financial projection/fact, not a substitute for its source business entity.

### PR #19 — Maintenance (DONE)

- Issue
- WorkOrder
- assignment/status/priority
- Inspection finding → Issue linkage
- Asset/Service/Cost links

### PR #20 — Keys + Access (DONE)

- keys
- cards
- remotes
- issue/return/loss history
- Tenancy assignments
- immutable access-item transactions

### PR #21 — Meters + Utilities (DONE)

- meter identity
- Unit/Space placement
- readings
- move-in/move-out readings
- historical consumption basis

## Read models and product surface

### PR #22 — Domain Events + Unit Timeline (DONE)

- business-event projection
- Unit dossier timeline
- cross-context chronology
- technical audit remains separate from domain timeline

### PR #23 — Reporting / Portfolio projections (DONE)

- Unit overview
- occupancy/tenancy status
- contract status
- investments/costs
- maintenance
- asset/service summaries
- portfolio dashboards

### PR #24 — React/Vite web + Unit dossier (DONE)

- authenticated internal shell
- URL-owned navigation
- Unit-centric UX
- typed API client
- Portfolio/Party/Tenancy/Contracts/Documents/Assets read surfaces
- authorized DocumentVersion Open/Download
- no raw database business writes from React

### PR #25 — Online Inspection field workflow (DONE)

- Unit-scoped Inspection workspace
- Start lifecycle CAS
- schema-driven section editing
- explicit section Save with revision CAS
- dirty-navigation protection
- stale async completion ownership guards
- concurrent per-target mutation tracking
- conflict UX that preserves the local draft

Offline persistence is explicitly not part of the MVP field workflow.

## MVP write surfaces (DONE)

The online MVP launch workflows are now usable without manual SQL or ad-hoc API calls.
PRs #27–#38 completed the browser write surfaces, with #38 closing the final
operational gap for Asset Warranty, WarrantyClaim, ServicePlan and standalone
ServiceEvent administration.

Sequence:

1. Core setup
   - create Party
   - create Property
   - create Unit
   - create Space
2. Leasing administration
   - create Tenancy and parties
   - plan / activate / notice / move-out / end / cancel
   - create/sign LeaseAgreement and amendments
   - signed-document workflow
3. Assets and meters
   - create/edit/move Assets
   - basic warranty/service history
   - create Meters and record readings
4. Maintenance and service
   - Issue
   - WorkOrder
   - assignment/status
   - ServiceEvent linkage
   - Inspection finding → Maintenance Issue
5. Inspection orchestration and completion
   - create / schedule / assign
   - assigned-work view
   - findings
   - evidence/photos
   - signatures
   - lock/finalize
   - immutable final report

The PR #38 MVP usability sweep verified the agreed launch workflows through the
browser E2E path: core setup, leasing and signed documents, Asset lifecycle plus
warranty/service history, Meters, Maintenance/Service, and Inspection orchestration
through immutable final report.

This completes the **write-surface** gate only. The MVP is not release-ready until
the production hardening and release gates below are complete.

## Production hardening + MVP release

The functional/write-surface gate is complete. Production hardening is intentionally
split so security, storage, recovery and release proof do not become one unreviewable PR.

| PR | Scope | Status |
| --- | --- | --- |
| #39 | Authorization + security release hardening | DONE |
| #40 | Storage/upload production hardening | DONE |
| #41 | Backup + restore + migration rehearsal | DONE |
| #42 | Observability + deployment/recovery runbooks | DONE |
| #43 | Full lifecycle MVP release gate | IN PROGRESS |

Final MVP gate includes:

- authorization/security gates;
- bounded/streaming document upload ingestion;
- backup automation;
- restore rehearsal;
- migration rehearsal;
- audit checks;
- observability;
- deployment runbook;
- recovery runbook;
- full lifecycle E2E on the release candidate.

A release is not complete until restore has been proven.

## Post-MVP — offline field capability

Offline is intentionally frozen until after the online MVP has launched and
real field usage has established the actual failure modes and sync needs.

Post-MVP scope may include:

- IndexedDB cached Inspection snapshots
- local section drafts
- command outbox
- reconnect/retry
- idempotent replay
- photo upload queue
- stale revision/conflict reconciliation
- service worker/PWA offline behavior

The server remains canonical. Offline state must not become a parallel source of
business truth.

## Professional-stack port

The professional-stack port is deliberately **not** part of the MVP PR sequence.

Introduce it only when an operational requirement justifies the infrastructure change.

Expected replacement:

```text
React/Vite web                stays
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
