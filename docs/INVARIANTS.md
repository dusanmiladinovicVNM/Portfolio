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
14. A Tenancy belongs to exactly one Unit and survives agreement amendments.
15. TenancyParty references Party; tenant identity is never copied into Tenancy columns.
16. An active Tenancy requires at least one tenant/co-tenant.
17. Only one primary tenant/co-tenant may exist in a Tenancy.
18. Tenancy lifecycle changes occur through explicit transitions, not arbitrary status writes.
19. Ended and cancelled Tenancies are terminal.
20. Effective tenancy periods for the same Unit never overlap.
21. Every Tenancy aggregate mutation increments an optimistic concurrency version.
22. A signed LeaseAgreement is immutable.
23. Changes to signed legal terms create an amendment/successor version; they do not rewrite history.
24. Effective tenancy terms must be answerable for an arbitrary historical date.
25. Multiple tenants are modeled as TenancyParty relationships, never tenant1/tenant2 columns.

## Inspections

26. Inspection references Unit/Tenancy; it does not own property or party master data.
27. A finalized/signed inspection has an immutable snapshot.
28. Form answers are not automatically canonical domain facts. Meter readings, assets, keys, damages and similar facts require their own domain records where applicable.

## Assets

29. Asset represents one physical identity.
30. Moving an Asset does not create a new Asset.
31. Replacing an Asset does create a new Asset; the old one remains in history.
32. Serial/product identifiers are historical identity data and must not be collapsed into an unstructured notes field.
33. Service events are append-only history.
34. Asset condition assessments preserve history rather than overwriting a single condition field.

## Improvements and maintenance

35. ImprovementProject is work; Asset is a physical item; Material is consumed input. They are not interchangeable.
36. Issue and WorkOrder are different grains: a problem can exist before a work order and may require more than one work order.
37. Cross-context workflows cannot bypass the owning domain to mutate its state.

## Money and documents

38. Monetary values use decimal/numeric semantics, never binary floating point.
39. Signed/final legal documents are immutable versions and must have a content hash.
40. Binary storage location is infrastructure data, not business identity.
41. Financial corrections preserve prior history through correction/reversal records where material.

## Architecture

42. Domain code cannot import Supabase, React, Deno, Google APIs or future Fastify infrastructure.
43. UI components cannot coordinate multi-table business transactions.
44. Multi-record business commands have one explicit transactional boundary.
45. Database constraints enforce invariants that can be stated relationally.
