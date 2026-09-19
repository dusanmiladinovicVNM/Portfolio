# Domain model

## Core aggregate chain

```text
Property
  ├─ Unit
  │   ├─ Space
  │   ├─ Ownership
  │   └─ Tenancy
  │       ├─ TenancyParty
  │       ├─ LeaseAgreement
  │       └─ Inspection
  ├─ Asset
  ├─ ImprovementProject
  ├─ Issue / WorkOrder
  └─ Cost
```

Cross-cutting concepts:

- Party
- Document
- DomainEvent
- AuditEvent

## Current implementation scope

The first implemented bounded context is **Portfolio**:

### Property

Grain: one real-estate property/building/site with a stable identity.

A Property is not a Unit and does not represent a tenancy.

### Unit

Grain: one independently managed/rentable unit within a Property.

A Unit survives changes of tenant, agreement and inspection.

### Space

Grain: one named physical subdivision of a Unit, such as kitchen, bedroom, balcony, cellar or parking-related space.

Space exists so inspections, assets, work and costs can later be localized without encoding room names in free text.

## Planned model

### Party

One person or company identity. Roles such as owner, tenant, contractor and supplier are expressed through relationships, not duplicate master records.

### Ownership

Time-bounded relationship between a Party and a Unit.

### Tenancy

The operational occupancy/rental relationship for a Unit over time. It is not the legal document itself.

### LeaseAgreement

A legal agreement associated with a Tenancy. Signed versions are immutable. Changes are represented through amendments or successor agreements.

### Inspection

One dated condition/handover event for exactly one Unit and optionally one Tenancy from that same Unit.

```text
Inspection
  ├─ schemaVersionId ──→ immutable InspectionSchemaVersion
  ├─ SectionState[]       per-section optimistic revision
  ├─ Response[]           one typed form answer per schema item
  └─ Finding[]            observed issue/condition during this inspection
```

The Inspection lifecycle is currently:

```text
draft → in_progress → locked → finalized   (#13 completed evidence/finalization)
   └──────────────→ cancelled
```

`Inspection.version` protects lifecycle/assignment state. It is deliberately **not** used for section autosave. Each section has its own revision so two field edits in different sections do not conflict unnecessarily and the later offline workflow can reconcile at the correct grain.

An Inspection references one exact published schema version. Publishing freezes the schema version's sections/items/conditions. A later schema version never rewrites an existing Inspection.

Responses are schema-driven evidence, not automatically canonical property facts. A meter value typed into a handover form remains an InspectionResponse until the Meters domain records the corresponding MeterReading. The same boundary applies to keys, assets and other operational facts.

A Finding is an observed condition/problem. It is not yet an Issue or WorkOrder; canonical PR #19 may promote/link a finding into maintenance workflow without changing the historical inspection evidence.

The inspector assignment is explicit and separate from `createdByUserId`. An inspector may work only on inspections assigned to them; admin/manager roles have broader operational access.

PR #13 completes the evidentiary lifecycle:

```text
Inspection
  ├─ Evidence[]       exact immutable DocumentVersion references
  ├─ Signature[]      append-only signature events
  ├─ UnlockRecord[]   append-only controlled-unlock audit
  └─ FinalSnapshot    exactly one authoritative immutable snapshot
```

Evidence can attach at Inspection, Section or Item grain. Binary identity remains owned by Documents/FileStorage.

Signature requirements are part of the exact InspectionSchemaVersion through `requiredSignatureRoles`. A signature records an evidentiary signer role, signer-name snapshot and, where applicable, the Party holding that role. For `tenant`, the application verifies that the Party is a tenant/co-tenant of the Inspection's exact Tenancy. For `landlord`, it verifies that the Party is an owner of the inspected Unit on the Inspection lock date. Other signature roles do not currently infer additional legal relationships beyond Party existence.

Unlocking a locked Inspection is an explicit admin/manager workflow. It returns the Inspection to `in_progress`, creates an append-only UnlockRecord, advances version/contentRevision and invalidates all active signatures. Prior signatures remain historical records.

Finalization creates one immutable FinalSnapshot and transitions `locked → finalized` in one database transaction. Snapshot row metadata identifies the locked source revision that was CAS-validated. Finalization requires the schema-required **active** signature roles, while the immutable snapshot payload preserves the resulting finalized Inspection header plus exact schema, responses, findings, evidence references, the complete signature history (including invalidated signatures) and the complete controlled-unlock history.

The final PDF is a derived projection of FinalSnapshot behind `PdfPort`. Rendering/storage is deliberately outside the atomic finalization transaction.

### Asset

One physical identifiable item with stable identity across placement changes, servicing and eventual retirement/replacement.

PR #14 establishes the registry grain:

```text
Asset
  ├─ Property                 required current placement context
  ├─ optional Unit            must belong to Property
  ├─ optional Space           requires Unit and must belong to it
  ├─ correctable name/manufacturer/model
  ├─ AssetIdentifier[]        structured append-only identifiers
  └─ AssetReplacement         predecessor → successor physical identity
```

Valid current-placement shapes are therefore `Property only`, `Property + Unit`, or `Property + Unit + Space`. A building lift, central boiler or fire-control panel does not require a synthetic `COMMON` Unit.

`Asset.id` is the immutable physical identity. `code` is stable business identity. `name`, `manufacturer` and `model` are correctable master metadata and may be corrected through an optimistic-CAS mutation without creating a new physical Asset. Dedicated metadata history is not introduced here; future AuditEvent/DomainEvent infrastructure should capture actor/time/delta for such corrections.

PR #14 deliberately does not expose a move command. Current Property/Unit/Space placement is protected from mutation until canonical PR #15 introduces `AssetLocationHistory`; that history will make placement temporal without changing Asset identity. Replacement is also not a move: the successor inherits the predecessor's exact current placement.

An Asset starts active and has an optimistic aggregate version. Supported metadata corrections and lifecycle transitions each advance that version exactly once. Normal lifecycle transitions may temporarily inactivate or permanently retire it. The `replaced` status is established only together with an append-only successor relationship, leaving the old physical identity intact.

Serial, product, inventory and similar identifiers are first-class append-only child records rather than notes. Identifier values are canonicalized against surrounding whitespace at the DB boundary. `inventory_tag`, `imei` and `mac_address` are globally unique; serial/product/barcode remain intentionally weaker until their business scope is explicitly defined. MAC/IMEI type-specific canonicalization is deferred rather than guessed prematurely.

Service, warranty, condition history and tenancy inventory remain later bounded-context work.
### ImprovementProject

A body of work performed on a Property/Unit. It is not an Asset. A project may install, remove or replace assets.

### Cost

A normalized financial fact linked to a source business event. Cost is not a substitute for the source entity.

### Document

Document is the stable business dossier for one logical file/evidence stream.

```text
Document
  ├─ DocumentVersion v1
  ├─ DocumentVersion v2
  └─ DocumentLink → domain target
```

A DocumentVersion is one immutable binary content identity. It stores file name, MIME type, byte size and SHA-256. Version content is never overwritten; a newer binary creates a newer version.

A stored version may be finalized once. Final versions are immutable evidence.

DocumentLink connects a Document to a concrete domain target such as Property, Unit, Party, Tenancy, LeaseAgreement or LeaseAmendment. Links may identify an exact DocumentVersion.

For legal evidence, `signed_original` always points to one exact **final** version and only to a signed agreement/amendment. AgreementParty therefore preserves membership/role, while the signed DocumentVersion preserves the rendered legal identity/address text that existed in the signed instrument.

Binary storage remains external behind FileStoragePort. Provider/file IDs are infrastructure locators only.

## Feature-bank rule

The existing HandoverApp may answer questions such as:

- which inspection workflows users need;
- what autosave behavior works in the field;
- how photos/signatures/finalization should feel;
- which offline failure modes exist.

It does **not** define the new entity grain, persistence model, API shape or authentication architecture.
