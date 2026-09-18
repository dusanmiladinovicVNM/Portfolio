# Roadmap

The sequence is dependency-driven. Later phases must not pull concepts backward into earlier entity grains.

## Phase 0 — foundation

- architecture and ADRs
- monorepo/package boundaries
- TypeScript strictness
- PostgreSQL migration convention
- first Portfolio domain tests

## Phase 1 — Portfolio

- Property
- Unit
- Space
- first API/query vertical slice
- authorization added before exposure to end users

## Phase 2 — Parties and ownership

- Party
- UnitOwnership
- contacts/addresses only as complexity requires

## Phase 3 — Tenancy

- Tenancy
- TenancyParty
- lifecycle/status transitions
- overlap rules

## Phase 4 — Contracts

- LeaseAgreement
- agreement parties
- amendments
- effective term versions
- signed-document immutability

## Phase 5 — Documents

- Document
- DocumentVersion
- DocumentLink
- FileStoragePort
- Google Drive adapter

## Phase 6 — Inspections

Use HandoverApp as feature reference only.

- schema/version model
- section responses
- findings
- attachments
- signatures
- final immutable snapshot
- field/offline behavior

## Phase 7 — Asset registry

- Asset
- identifiers
- location history
- condition history
- tenancy inventory assignment

## Phase 8 — Warranty and service

- Warranty
- WarrantyClaim
- ServicePlan
- ServiceEvent
- ServicePart

## Phase 9 — Improvements

- ImprovementProject
- WorkItem
- WorkMaterial
- ProjectAsset

## Phase 10 — Costs

- normalized Cost ledger
- source links
- capex/opex classification as reporting metadata

## Phase 11 — Maintenance

- Issue
- WorkOrder
- connection to assets, inspections and service events

## Phase 12 — Timeline and reporting

- DomainEvent projection
- unit dossier timeline
- investment and maintenance summaries

## Professional-stack port

Introduce a Fastify API when the operational need justifies it.

Expected change:

```text
Supabase Edge transport → Fastify transport
Supabase provider DB     → any PostgreSQL provider if needed
Drive adapter            → S3-compatible adapter if needed
```

Expected non-change:

- domain model
- invariants
- application commands/queries
- API contracts
- SQL semantics
