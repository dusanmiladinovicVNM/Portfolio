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

Metadata/version model for files. Binary storage is external and accessed through a storage port.

## Feature-bank rule

The existing HandoverApp may answer questions such as:

- which inspection workflows users need;
- what autosave behavior works in the field;
- how photos/signatures/finalization should feel;
- which offline failure modes exist.

It does **not** define the new entity grain, persistence model, API shape or authentication architecture.
