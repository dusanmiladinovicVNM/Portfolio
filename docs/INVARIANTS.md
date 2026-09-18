# Domain invariants

These rules are architecture gates, not optional implementation notes.

## Portfolio

1. A Unit belongs to exactly one Property.
2. A Space belongs to exactly one Unit.
3. A Unit identity survives all tenant, agreement and inspection changes.
4. A Property/Unit must not store a current tenant as master identity data.
5. Unit lifecycle status is administrative only (`active/inactive/archived`); occupancy/vacancy is derived from Tenancy.
6. Archival/inactivation must not orphan historical records.

## Parties and ownership

7. A person/company has one Party identity; owner/tenant/contractor/supplier are roles or relationships.
8. Party type determines its legal-name shape: a person has person-name fields; a company has a legal company name.
9. A Party may have multiple contact points and addresses, but at most one primary record per contact/address type.
10. One OwnershipPeriod represents the complete ownership composition of one Unit for one date interval.
11. Ownership shares inside one period are unique per Party and total exactly 10000 basis points (100%).
12. Ownership periods for the same Unit never overlap.
13. Ownership cannot be newly assigned to an inactive/archived Party.

## Tenancy and contracts

14. Tenancy and LeaseAgreement are different concepts.
15. A Tenancy belongs to exactly one Unit and survives agreement amendments.
16. TenancyParty references Party; tenant identity is never copied into Tenancy columns.
17. Until TenancyParty becomes temporal, party composition may only change while Tenancy is draft/planned.
18. An active Tenancy requires at least one tenant/co-tenant.
19. Only one primary tenant/co-tenant may exist in a Tenancy.
20. Tenancy lifecycle changes occur through explicit transitions, not arbitrary status writes.
21. Ended and cancelled Tenancies are terminal.
22. Planned reservation and actual occupancy are different temporal concepts.
23. Planned reservations for the same Unit never overlap.
24. Actual occupancy periods for the same Unit never overlap.
25. A new planned reservation cannot overlap known actual occupancy.
26. Actual occupancy facts are not rejected merely because they later conflict with a future plan; the future Tenancy cannot activate until actual occupancy is resolved.
27. For notice-bearing Tenancy: actualStart <= noticeGivenAt <= terminationEffectiveAt.
28. Every Tenancy aggregate mutation increments an optimistic concurrency version.
29. LeaseAgreement is a legal record separate from the operational Tenancy.
30. AgreementParty is a legal snapshot; signed agreement party composition must not follow later live Party/Tenancy changes.
31. A signed LeaseAgreement is immutable except for explicit lifecycle metadata transitions.
32. A signed LeaseAmendment is immutable.
33. Every signed agreement/amendment that changes effective terms emits exactly one immutable TenancyTermVersion.
34. Signing and term-version creation are one transaction; a signed legal record without its effective term snapshot is invalid.
35. Effective tenancy terms must be answerable for an arbitrary historical date from append-only term versions.
36. Money uses exact decimal semantics across API/domain/storage; JS floating-point numbers are not canonical money.
37. A term version source must belong to the same Tenancy as the term version.
38. Multiple tenants are modeled as TenancyParty relationships, never tenant1/tenant2 columns.

## Inspections

39. Inspection references Unit/Tenancy; it does not own property or party master data.
40. A finalized/signed inspection has an immutable snapshot.
41. Form answers are not automatically canonical domain facts. Meter readings, assets, keys, damages and similar facts require their own domain records where applicable.

## Assets

42. Asset represents one physical identity.
43. Moving an Asset does not create a new Asset.
44. Replacing an Asset does create a new Asset; the old one remains in history.
45. Serial/product identifiers are historical identity data and must not be collapsed into an unstructured notes field.
46. Service events are append-only history.
47. Asset condition assessments preserve history rather than overwriting a single condition field.

## Improvements and maintenance

48. ImprovementProject is work; Asset is a physical item; Material is consumed input. They are not interchangeable.
49. Issue and WorkOrder are different grains: a problem can exist before a work order and may require more than one work order.
50. Cross-context workflows cannot bypass the owning domain to mutate its state.

## Money and documents

51. Monetary values use decimal/numeric semantics, never binary floating point.
52. Signed/final legal documents are immutable versions and must have a content hash.
53. Binary storage location is infrastructure data, not business identity.
54. Financial corrections preserve prior history through correction/reversal records where material.

## Architecture

55. Domain code cannot import Supabase, React, Deno, Google APIs or future Fastify infrastructure.
56. UI components cannot coordinate multi-table business transactions.
57. Multi-record business commands have one explicit transactional boundary.
58. Database constraints enforce invariants that can be stated relationally.
