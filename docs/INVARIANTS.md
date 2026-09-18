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
22. LeaseAgreement is a legal record separate from the operational Tenancy.
23. AgreementParty is a legal snapshot; signed agreement party composition must not follow later live Party/Tenancy changes.
24. A signed LeaseAgreement is immutable except for explicit lifecycle metadata transitions.
25. A signed LeaseAmendment is immutable.
26. Every signed agreement/amendment that changes effective terms emits exactly one immutable TenancyTermVersion.
27. Signing and term-version creation are one transaction; a signed legal record without its effective term snapshot is invalid.
28. Effective tenancy terms must be answerable for an arbitrary historical date from append-only term versions.
29. Money uses exact decimal semantics across API/domain/storage; JS floating-point numbers are not canonical money.
30. A term version source must belong to the same Tenancy as the term version.
31. Multiple tenants are modeled as TenancyParty relationships, never tenant1/tenant2 columns.

## Inspections

32. Inspection references Unit/Tenancy; it does not own property or party master data.
33. A finalized/signed inspection has an immutable snapshot.
34. Form answers are not automatically canonical domain facts. Meter readings, assets, keys, damages and similar facts require their own domain records where applicable.

## Assets

35. Asset represents one physical identity.
36. Moving an Asset does not create a new Asset.
37. Replacing an Asset does create a new Asset; the old one remains in history.
38. Serial/product identifiers are historical identity data and must not be collapsed into an unstructured notes field.
39. Service events are append-only history.
40. Asset condition assessments preserve history rather than overwriting a single condition field.

## Improvements and maintenance

41. ImprovementProject is work; Asset is a physical item; Material is consumed input. They are not interchangeable.
42. Issue and WorkOrder are different grains: a problem can exist before a work order and may require more than one work order.
43. Cross-context workflows cannot bypass the owning domain to mutate its state.

## Money and documents

44. Monetary values use decimal/numeric semantics, never binary floating point.
45. Signed/final legal documents are immutable versions and must have a content hash.
46. Binary storage location is infrastructure data, not business identity.
47. Financial corrections preserve prior history through correction/reversal records where material.

## Architecture

48. Domain code cannot import Supabase, React, Deno, Google APIs or future Fastify infrastructure.
49. UI components cannot coordinate multi-table business transactions.
50. Multi-record business commands have one explicit transactional boundary.
51. Database constraints enforce invariants that can be stated relationally.
