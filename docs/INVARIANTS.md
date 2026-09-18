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
7. Party type determines its legal-name shape: a person has person-name fields; a company has a legal company name.
8. A Party may have multiple contact points and addresses, but at most one primary record per contact/address type.
9. One OwnershipPeriod represents the complete ownership composition of one Unit for one date interval.
10. Ownership shares inside one period are unique per Party and total exactly 10000 basis points (100%).
11. Ownership periods for the same Unit never overlap.
12. Ownership cannot be newly assigned to an inactive/archived Party.

## Tenancy and contracts

13. Tenancy and LeaseAgreement are different concepts.
14. A signed LeaseAgreement is immutable.
15. Changes to signed legal terms create an amendment/successor version; they do not rewrite history.
16. Effective tenancy terms must be answerable for an arbitrary historical date.
17. Multiple tenants are modeled as TenancyParty relationships, never tenant1/tenant2 columns.

## Inspections

18. Inspection references Unit/Tenancy; it does not own property or party master data.
19. A finalized/signed inspection has an immutable snapshot.
20. Form answers are not automatically canonical domain facts. Meter readings, assets, keys, damages and similar facts require their own domain records where applicable.

## Assets

21. Asset represents one physical identity.
22. Moving an Asset does not create a new Asset.
23. Replacing an Asset does create a new Asset; the old one remains in history.
24. Serial/product identifiers are historical identity data and must not be collapsed into an unstructured notes field.
25. Service events are append-only history.
26. Asset condition assessments preserve history rather than overwriting a single condition field.

## Improvements and maintenance

27. ImprovementProject is work; Asset is a physical item; Material is consumed input. They are not interchangeable.
28. Issue and WorkOrder are different grains: a problem can exist before a work order and may require more than one work order.
29. Cross-context workflows cannot bypass the owning domain to mutate its state.

## Money and documents

30. Monetary values use decimal/numeric semantics, never binary floating point.
31. Signed/final legal documents are immutable versions and must have a content hash.
32. Binary storage location is infrastructure data, not business identity.
33. Financial corrections preserve prior history through correction/reversal records where material.

## Architecture

34. Domain code cannot import Supabase, React, Deno, Google APIs or future Fastify infrastructure.
35. UI components cannot coordinate multi-table business transactions.
36. Multi-record business commands have one explicit transactional boundary.
37. Database constraints enforce invariants that can be stated relationally.
