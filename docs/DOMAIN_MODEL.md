# Domain model

## Core aggregate chain

```text
Property
  └─ Unit
      ├─ Space
      ├─ Ownership
      ├─ Tenancy
      │   ├─ TenancyParty
      │   ├─ LeaseAgreement
      │   └─ Inspection
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

A dated condition/handover event for a Unit and optionally a Tenancy. It references master data rather than owning copies of tenant/property identity.

### Asset

One physical identifiable item with stable identity across location changes, servicing and eventual retirement/replacement.

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
