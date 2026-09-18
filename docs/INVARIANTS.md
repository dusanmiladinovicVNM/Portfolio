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
30. A Tenancy has at most one non-cancelled initial LeaseAgreement root.
31. A renewal/replacement references exactly one signed predecessor in the same Tenancy and becomes effective after that predecessor starts.
32. A predecessor has at most one non-cancelled direct successor.
33. Signing a successor, superseding its predecessor and emitting the successor term snapshot are one transaction.
34. A successor never rewrites the predecessor's signed `effectiveTo`; historical governing validity is derived from the signed legal period plus the signed successor boundary.
35. AgreementParty snapshots legal membership/role, not mutable Party display fields. Names, addresses and other rendered legal identity in a signed instrument are preserved by the exact final signed DocumentVersion.
36. A signed LeaseAgreement is immutable except for explicit lifecycle metadata transitions.
37. A signed LeaseAmendment is immutable.
38. Every signed agreement/amendment that changes effective terms emits exactly one immutable TenancyTermVersion.
39. Signing and term-version creation are one transaction; a signed legal record without its effective term snapshot is invalid.
40. Effective terms exist only inside the governing agreement's legal date range and before any signed successor becomes effective.
41. A term version source must belong to the same Tenancy, must be signed when the term is emitted, and its effective date must equal the legal source effective date.
42. Money uses exact decimal semantics across API/domain/storage; JS floating-point numbers are not canonical money.
43. Multiple tenants are modeled as TenancyParty relationships, never tenant1/tenant2 columns.

## Inspections

44. An Inspection belongs to exactly one Unit; an optional Tenancy reference must belong to that same Unit.
45. A new Inspection references one exact **published** InspectionSchemaVersion whose inspection type matches the Inspection type.
46. Published/retired InspectionSchemaVersion structure is immutable; new form evolution creates a new version rather than rewriting history.
47. Inspection content (responses/findings) is editable only while the Inspection is draft or in progress.
48. Inspection concurrency has three grains: lifecycle uses Inspection.version; each section autosave uses its own revision; closing transitions also CAS a monotonic Inspection.contentRevision incremented by every content mutation.
49. An inspector may access/mutate only Inspections explicitly assigned to that internal user; createdBy and assignedTo are different facts.
50. Every InspectionResponse belongs to an item in the Inspection's exact schema version/section and its value type/options must match that item definition.
51. Locking requires an in-progress Inspection, every currently visible required/conditionally-required item to have an answer, and an unchanged contentRevision between authoritative validation and lifecycle CAS.
52. A Finding is an observed inspection condition; it is not an Issue or WorkOrder and cannot silently mutate those domains.
53. Inspection historical identity (code/type/Unit/Tenancy/schema/creator) is immutable after creation. A finalized/signed Inspection will have an immutable evidence snapshot; PR #13 owns signatures, final snapshot and final document generation.
54. Published schema children cannot move between schema versions/sections, and Inspection content rows cannot be retargeted between Inspections after insert.
57. Section writes use PATCH semantics: omitted answers remain unchanged and explicit clear removes an answer.
58. Form answers are not automatically canonical domain facts. Meter readings, assets, keys and similar facts require their own domain records where applicable.

## Assets

57. Asset represents one physical identity.
58. Moving an Asset does not create a new Asset.
59. Replacing an Asset does create a new Asset; the old one remains in history.
60. Serial/product identifiers are historical identity data and must not be collapsed into an unstructured notes field.
61. Service events are append-only history.
62. Asset condition assessments preserve history rather than overwriting a single condition field.

## Improvements and maintenance

63. ImprovementProject is work; Asset is a physical item; Material is consumed input. They are not interchangeable.
64. Issue and WorkOrder are different grains: a problem can exist before a work order and may require more than one work order.
65. Cross-context workflows cannot bypass the owning domain to mutate its state.

## Money and documents

66. Monetary values use decimal/numeric semantics, never binary floating point.
67. Each DocumentVersion represents one binary content identity; its file metadata, SHA-256 and storage locator are immutable after registration.
68. A final DocumentVersion is append-only evidence and cannot return to a mutable/stored state.
69. A `signed_original` link identifies one exact final DocumentVersion, may only target a signed LeaseAgreement/LeaseAmendment, and is immutable once created.
70. Binary storage location is infrastructure data, not business identity; Google Drive file IDs must never become Document or DocumentVersion IDs.
71. External binary storage and PostgreSQL cannot share one ACID transaction. Upload registration therefore uses an idempotent storage object key and compensating delete when DB registration fails.
72. Financial corrections preserve prior history through correction/reversal records where material.

## Architecture

73. Domain code cannot import Supabase, React, Deno, Google APIs or future Fastify infrastructure.
74. UI components cannot coordinate multi-table business transactions.
75. Multi-record business commands have one explicit transactional boundary.
76. Database constraints enforce invariants that can be stated relationally.
