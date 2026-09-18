# Domain invariants

These rules are architecture gates, not optional implementation notes.

## Portfolio

1. A Unit belongs to exactly one Property.
2. A Space belongs to exactly one Unit.
3. A Unit identity survives all tenant, agreement and inspection changes.
4. A Property/Unit must not store a current tenant as master identity data.
5. Archival/inactivation must not orphan historical records.

## Parties and ownership

6. A person/company has one Party identity; owner/tenant/contractor/supplier are roles or relationships.
7. Ownership is historical and time-bounded where applicable.

## Tenancy and contracts

8. Tenancy and LeaseAgreement are different concepts.
9. A signed LeaseAgreement is immutable.
10. Changes to signed legal terms create an amendment/successor version; they do not rewrite history.
11. Effective tenancy terms must be answerable for an arbitrary historical date.
12. Multiple tenants are modeled as TenancyParty relationships, never tenant1/tenant2 columns.

## Inspections

13. Inspection references Unit/Tenancy; it does not own property or party master data.
14. A finalized/signed inspection has an immutable snapshot.
15. Form answers are not automatically canonical domain facts. Meter readings, assets, keys, damages and similar facts require their own domain records where applicable.

## Assets

16. Asset represents one physical identity.
17. Moving an Asset does not create a new Asset.
18. Replacing an Asset does create a new Asset; the old one remains in history.
19. Serial/product identifiers are historical identity data and must not be collapsed into an unstructured notes field.
20. Service events are append-only history.
21. Asset condition assessments preserve history rather than overwriting a single condition field.

## Improvements and maintenance

22. ImprovementProject is work; Asset is a physical item; Material is consumed input. They are not interchangeable.
23. Issue and WorkOrder are different grains: a problem can exist before a work order and may require more than one work order.
24. Cross-context workflows cannot bypass the owning domain to mutate its state.

## Money and documents

25. Monetary values use decimal/numeric semantics, never binary floating point.
26. Signed/final legal documents are immutable versions and must have a content hash.
27. Binary storage location is infrastructure data, not business identity.
28. Financial corrections preserve prior history through correction/reversal records where material.

## Architecture

29. Domain code cannot import Supabase, React, Deno, Google APIs or future Fastify infrastructure.
30. UI components cannot coordinate multi-table business transactions.
31. Multi-record business commands have one explicit transactional boundary.
32. Database constraints enforce invariants that can be stated relationally.
