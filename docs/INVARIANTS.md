# Domain invariants

These rules are architecture gates, not optional implementation notes.

## Portfolio

1. A Unit belongs to exactly one Property.
2. A Space belongs to exactly one Unit; `Space.unitId` is immutable after creation.
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
15. A Tenancy belongs to exactly one Unit and survives agreement amendments. `Tenancy.unitId` is immutable after creation.
16. TenancyParty references Party; tenant identity is never copied into Tenancy columns.
17. Until TenancyParty becomes temporal, party composition may only change while Tenancy is draft/planned.
18. An active Tenancy requires at least one tenant/co-tenant.
19. Only one primary tenant/co-tenant may exist in a Tenancy.
20. Tenancy lifecycle changes occur through explicit transitions, not arbitrary status writes.
21. Ended and cancelled Tenancies are terminal.
22. Planned reservation and actual occupancy are different temporal concepts. `actualStart` is established when actual occupancy begins and is immutable once non-null; `actualEnd` is established when actual occupancy ends and is immutable once non-null.
23. Planned reservations for the same Unit never overlap.
24. Actual occupancy periods for the same Unit never overlap.
25. A new planned reservation cannot overlap known actual occupancy.
26. Actual occupancy facts are not rejected merely because they later conflict with a future plan; the future Tenancy cannot activate until actual occupancy is resolved.
27. For notice-bearing Tenancy: actualStart <= noticeGivenAt <= terminationEffectiveAt.
28. Every Tenancy aggregate mutation increments an optimistic concurrency version.
29. LeaseAgreement is a legal record separate from the operational Tenancy; `LeaseAgreement.tenancyId` is immutable from creation, including while draft.
30. A Tenancy has at most one non-cancelled initial LeaseAgreement root.
31. A renewal/replacement references exactly one signed predecessor in the same Tenancy and becomes effective after that predecessor starts.
32. A predecessor has at most one non-cancelled direct successor.
33. Signing a successor, superseding its predecessor and emitting the successor term snapshot are one transaction.
34. A successor never rewrites the predecessor's signed `effectiveTo`; historical governing validity is derived from the signed legal period plus the signed successor boundary.
35. AgreementParty snapshots legal membership/role, not mutable Party display fields. Names, addresses and other rendered legal identity in a signed instrument are preserved by the exact final signed DocumentVersion.
36. A signed LeaseAgreement is immutable except for explicit lifecycle metadata transitions.
37. `LeaseAmendment.agreementId` is immutable from creation; once signed, the LeaseAmendment content is immutable.
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
48. Inspection concurrency has three grains: lifecycle uses Inspection.version; each section autosave uses its own revision; closing transitions also CAS a monotonic Inspection.contentRevision incremented by every supported repository-managed content mutation.
49. An inspector may access/mutate only Inspections explicitly assigned to that internal user; createdBy and assignedTo are different facts.
50. Every InspectionResponse belongs to an item in the Inspection's exact schema version/section and its value type/options must match that item definition.
51. Locking requires an in-progress Inspection, every currently visible required/conditionally-required item to have an answer, and an unchanged contentRevision between authoritative validation and lifecycle CAS.
52. A Finding is an observed inspection condition; it is not an Issue or WorkOrder and cannot silently mutate those domains.
53. Inspection historical identity (code/type/Unit/Tenancy/schema/creator) is immutable after creation. A finalized/signed Inspection will have an immutable evidence snapshot; PR #13 owns signatures, final snapshot and final document generation.
54. Published schema children cannot move between schema versions/sections, and Inspection content rows cannot be retargeted between Inspections after insert.
55. Section writes use PATCH semantics: omitted answers remain unchanged and explicit clear removes an answer.
56. Form answers are not automatically canonical domain facts. Meter readings, assets, keys and similar facts require their own domain records where applicable.
57. Signature requirements belong to the immutable InspectionSchemaVersion; finalization uses the exact policy captured by the Inspection's schema version.
58. InspectionEvidence references one exact DocumentVersion and may identify Inspection, Section or Item grain; evidence rows are append-only and cannot be attached after lock except the derived final_report after finalization.
59. Inspection signatures may be collected only while locked and must reference a final immutable DocumentVersion. At most one active signature exists per signer role.
60. A controlled unlock is admin/manager-only, creates one append-only UnlockRecord, advances version/contentRevision and invalidates every active signature atomically.
61. A FinalSnapshot is unique per Inspection and append-only. It records the locked source revision being finalized and contains the resulting finalized Inspection header.
62. Finalization requires every signature role required by the exact schema version and stores FinalSnapshot plus the lifecycle transition in one transaction.
63. A finalized Inspection cannot exist without the matching immutable FinalSnapshot.
64. Final PDF/report is derived from FinalSnapshot through PdfPort and is not part of the atomic finalization transaction.

## Assets

65. Asset represents one physical identity. A currently managed placement identifies one Property; Unit is optional, and Space is optional only when Unit is present. Any Unit must belong to that Property and any Space must belong to that Unit. A replaced historical Asset is intentionally unlocated.
66. Moving an Asset does not create a new Asset. Movement is represented by AssetLocationHistory while Property/Unit/Space on Asset remain only the current projection.
67. Replacing an Asset does create a new Asset; the old one remains in history and becomes `replaced` only in the same transaction that appends one predecessor→successor relationship.
68. Replacement transfers temporal placement rather than moving one identity: the predecessor location interval closes at `replacedAt`, the successor starts at that exact Property/Unit/Space and timestamp, the predecessor current projection becomes null, and replacement lineage is acyclic.
69. Asset identifiers are structured append-only records with canonical trimmed values. `inventory_tag`, `imei` and `mac_address` are globally unique; serial/product/barcode have no stronger cross-Asset uniqueness until their business scope is explicitly defined.
70. `Asset.id` is immutable physical identity and `code` is stable business identity. Name/manufacturer/model are correctable metadata. Supported metadata corrections, moves and lifecycle changes use optimistic concurrency; retired/replaced lifecycle states are terminal.
71. AssetLocationHistory is the authoritative temporal placement truth. Active/inactive/retired Assets currently retain exactly one open location interval and a matching current projection. A `replaced` Asset has zero open intervals and a null current projection.
72. An Asset move closes the current location interval, appends the next interval, updates the current placement projection and advances Asset.version in one transaction. Location intervals are contiguous, never overlap, and closed history is immutable.
73. AssetConditionAssessment is append-only condition history; there is no mutable `asset.condition` master field.
74. TenancyAssetAssignment links one physical Asset to one Tenancy inventory. The Asset must belong to that Tenancy's Unit when assigned; assignment does not itself change Asset location or ownership.
75. Move-in and move-out inventory snapshots are append-once facts. Move-out requires move-in, cannot predate it, and a missing Asset cannot carry a condition assessment.
76. TenancyAssetAssignment is inventory scope, not proof of current physical possession. The same Asset may therefore be in the inventory scope of different Tenancies, including a planned successor while another Tenancy still exists; no global one-open-assignment-per-Asset constraint applies.
77. New Tenancy inventory assignment is allowed only while Tenancy is `draft/planned/active`. Move-in snapshot is allowed only for `planned/active`; move-out snapshot only for `active/notice_given/move_out_pending`. Any snapshot recorded as `present` requires the Asset's current Unit projection to equal the Tenancy Unit at recording time; `missing` remains legal after the Asset has moved elsewhere.
78. The current inventory model records `assignedAt/recordedAt`, not historical occurrence time. Ended/cancelled Tenancies therefore cannot be backfilled through normal inventory commands. A future historical-import workflow must introduce explicit occurredAt/happenedAt semantics rather than pretending current recording time is event time.

## Warranty and service

79. Warranty belongs to one exact physical Asset identity. Asset replacement never silently migrates predecessor Warranty, Claim, ServicePlan or ServiceEvent history to the successor.
80. Warranty coverage is append-only. Coverage activity/expiry is derived from `validFrom/validTo`, not from a mutable warranty status.
81. WarrantyClaim belongs to exactly one Warranty and records immutable `recordedAt`/`recordedByUserId` provenance. Its incident date must fall inside that Warranty coverage interval and cannot be later than the UTC calendar date of `recordedAt`; later submission/resolution timestamps do not redefine when the covered incident happened.
82. WarrantyClaim lifecycle is explicit, optimistic and temporally monotonic from `recordedAt`: `submittedAt >= recordedAt`; `resolvedAt >= submittedAt`; `closedAt >= resolvedAt`; cancellation occurs at or after `submittedAt` when submitted, otherwise at or after `recordedAt`. Lifecycle is `draft -> submitted -> approved|rejected`, `draft|submitted -> cancelled`, and `approved -> closed`. Rejected/cancelled/closed are terminal and prior lifecycle timestamps are immutable once set.
83. ServicePlan belongs to one exact Asset and represents expected future service policy, not a WorkOrder and not proof that service occurred. New or reactivated active plans are allowed only for `active/inactive` Assets; `retired/replaced` Assets are operationally ineligible. Effective applicability is derived from both Plan and Asset state rather than by mutating plans from the Asset replacement transaction. One-time plans have no interval; recurring plans require a positive integer month interval. No mutable next-due projection is canonical in this phase.
84. ServicePlan lifecycle is optimistic: `active <-> paused`, `active|paused -> ended|cancelled`; ended/cancelled are terminal. Plan definition and Asset identity are immutable after creation in this phase. A provider Party, when present, must be active when a plan is created or reactivated.
85. ServiceEvent is append-only completed-work history for one exact Asset. `performedAt` is occurrence time, `recordedAt` is system recording time, and performedAt cannot be later than recordedAt.
86. Optional ServiceEvent references to ServicePlan or WarrantyClaim must resolve to the same physical Asset. Warranty and ServiceEvent history may reference inactive/archived provider Parties because historical identity requires existence, while a new or reactivated ServicePlan requires its provider Party to be active.
87. ServiceEvent plus its ServicePart children is one transaction. ServicePart is append-only service evidence, not a substitute for Asset identity; a component needing independent identifiers, placement, warranty or future service history must be modeled as another Asset.

## Improvements / Works

88. ImprovementProject is one managed body of planned work with immutable Property/optional Unit/Space scope. Unit must belong to Property and Space requires and belongs to Unit. Property-only scope represents building/common works in this phase.
89. ImprovementProject lifecycle is optimistic: `draft -> planned -> in_progress -> completed`, with cancellation from any non-terminal state. Name/description/planned dates may be corrected only while draft/planned; identity and physical scope are immutable. Completion requires every WorkItem to be completed or cancelled, cannot predate any WorkItem terminal timestamp, and no Project terminal timestamp may predate an existing WorkRecord occurrence. Project cancellation additionally cannot predate existing WorkItem creation/start/completion history; a WorkItem cleanup cancellation may occur after the parent cancellation and is deliberately excluded from that bound.
90. WorkItem is planned scope, not evidence that work occurred. It starts planned; title/description are correctable with optimistic CAS only while planned. It may start/complete only while its parent Project is in progress, and may be cancelled from planned/in-progress. Once started, its definition is frozen; completed/cancelled WorkItems are terminal, and their terminal timestamp cannot be earlier than any existing WorkRecord for that item.
91. WorkRecord is one append-only historical occurrence under one exact WorkItem/Project. `Project.startedAt` and `WorkItem.startedAt` are business occurrence boundaries: `performedAt` must be at or after both starts, at or before the earliest Project/WorkItem terminal time, and never later than `recordedAt`. Historical entry is recorded later against reconstructed historical start timestamps; normal commands do not permit work predating the modeled Project/WorkItem.
92. WorkRecord plus its WorkMaterial and ProjectAsset children is assembled and sealed in one transaction. At commit the WorkRecord must be sealed; after sealing neither the record nor its evidence children may be rewritten, deleted or appended to. Parent/child writes share a PostgreSQL row-lock protocol: WorkItem writes lock their Project; WorkRecord writes lock WorkItem then Project; evidence-child inserts lock the unsealed WorkRecord. Parent lifecycle transitions therefore serialize with child creation instead of relying on check-then-write races.
93. WorkMaterial is exact positive material/consumable quantity stored with decimal/numeric semantics. It is neither Asset identity nor financial Cost; money, procurement and supplier invoices belong to later bounded contexts.
94. ProjectAsset is append-only evidence that work `affected` an Asset or involved `installation_work` / `removal_work` on it. These are work semantics, not canonical physical-placement or lifecycle assertions. ProjectAsset never changes or independently claims Asset placement/status/replacement/service truth; those remain owned by the Asset bounded context.
95. Historical contractor identity on WorkRecord requires Party existence, not current active status. Contractor billing and payables are not part of Improvements.
96. Cross-context workflows cannot bypass the owning domain to mutate its state.

## Maintenance

97. MaintenanceIssue and MaintenanceWorkOrder are different grains: a reported problem can exist before work is commissioned and one Issue may require several WorkOrders.
98. MaintenanceIssue has immutable Property/optional Unit/Space/Asset scope. Unit must belong to Property and Space requires and belongs to Unit. For an Asset-scoped Issue, scope must equal the authoritative AssetLocationHistory interval containing `reportedAt` using `validFrom <= reportedAt < validTo` (or open-ended `validTo`); the current Asset projection at `recordedAt` is not historical truth. Once recorded, later Asset location-history closure may not move that `reportedAt` outside the captured interval.
99. One InspectionFinding may originate at most one MaintenanceIssue. The Finding must belong to the same Unit and `Issue.reportedAt >= Finding.createdAt`. Inspection retains ownership; once the Finding is used as an origin, the `createdAt` provenance required by this invariant cannot be rewritten.
100. MaintenanceIssue lifecycle is optimistic and terminal: `open -> resolved|cancelled`. Title/description/priority are correctable only while open; code, scope, origin and reported/recorded provenance are immutable.
101. Resolving an Issue requires at least one completed WorkOrder and every child WorkOrder terminal. Cancelling an Issue requires every existing WorkOrder cancelled. An Issue terminal timestamp cannot predate its recording time or any child terminal timestamp.
102. MaintenanceWorkOrder belongs to exactly one Issue and follows `draft -> assigned -> in_progress -> completed`, with cancellation from any non-terminal state. `WorkOrder.createdAt >= Issue.recordedAt`; a child WorkOrder cannot predate the parent Issue's system recording. Definition and assignment freeze once work starts; reassignment before start cannot move `assignedAt` backwards.
103. WorkOrder assignment targets exactly one active internal User or active Party at assignment time. Later deactivation does not rewrite historical assignment.
104. ServiceEvent remains Asset/Service truth. A Maintenance link is append-only, one ServiceEvent belongs to at most one WorkOrder in this phase, the Issue must be Asset-scoped, Asset identities must match, and `ServiceEvent.performedAt` must lie within the WorkOrder execution interval. WorkOrder completion cannot predate linked service work and a WorkOrder with linked ServiceEvents cannot be cancelled.
105. Maintenance stores no monetary amount, currency, invoice or payment truth. Cost remains the financial source of truth and may reference MaintenanceIssue or MaintenanceWorkOrder through the existing typed CostSource model.
106. Asset-scoped Issue inserts share-lock the AssetLocationHistory interval that contains `reportedAt`; closing an open interval during Asset movement therefore serializes with historical scope capture. Maintenance also guards the reverse sequential case: closing an open Asset location interval is rejected when the proposed `validTo` would invalidate an existing Issue snapshot. Origin-Finding lookup share-locks the Finding row. WorkOrder writes share-lock their parent Issue and ServiceEvent-link inserts share-lock their WorkOrder. These cross-row invariants therefore serialize with, and remain protected after, the mutations that could invalidate them.

## Money and documents

107. Monetary values use decimal/numeric semantics, never binary floating point.
108. Each DocumentVersion represents one binary content identity; its file metadata, SHA-256 and storage locator are immutable after registration.
109. A final DocumentVersion is append-only evidence and cannot return to a mutable/stored state.
110. Every DocumentLink is an append-once relationship fact: UPDATE and DELETE are forbidden. A `signed_original` link additionally identifies one exact final DocumentVersion and may only target a signed LeaseAgreement/LeaseAmendment. Future unlink/correction semantics require explicit reversal/supersession history rather than mutation of the original link.
111. Binary storage location is infrastructure data, not business identity; Google Drive file IDs must never become Document or DocumentVersion IDs.
112. External binary storage and PostgreSQL cannot share one ACID transaction. Upload registration therefore uses an idempotent storage object key and compensating delete when DB registration fails.
113. Financial corrections preserve prior history through correction/reversal records where material.
114. One Cost is one immutable positive exact monetary allocation to exactly one typed CostSource; source kind and target must agree.
115. Cost amount uses the current two-decimal money model: at most two decimal places and at most 16 whole-part digits. PostgreSQL preserves the incoming exact numeric value until explicit scale/range checks run, so direct SQL cannot silently round an over-scale amount. Cost currency is restricted to the configured set `CHF|EUR|RSD`; canonical #18 does not claim generic ISO 4217 minor-unit support.
116. `Cost.incurredOn` cannot be later than the UTC calendar date of immutable `recordedAt`.
117. Cost supplier identity requires Party existence, not current active status; invoice reference is external metadata and never becomes Invoice/AP source of truth.
118. One Cost may be reversed at most once and one replacement Cost may belong to at most one incoming correction.
119. When a Cost reversal has a replacement, replacement and reversal share both `recordedAt` and `recordedByUserId`; normal application creation is one transaction and PostgreSQL enforces the same relational parity.
120. Cost ledger reads expose both outgoing reversal and incoming correction lineage; the original and every replacement remain immutable historical facts.
121. Costs in unlike currencies are never implicitly summed without an explicit future FX/conversion model.

## Architecture

122. Domain code cannot import Supabase, React, Deno, Google APIs or future Fastify infrastructure.
123. UI components cannot coordinate multi-table business transactions.
124. Multi-record business commands have one explicit transactional boundary.
125. Database constraints enforce invariants that can be stated relationally.


## Keys + Access

126. AccessItem is one exact physical key/card/remote. Property is required; Unit is optional; Space requires Unit. Unit must belong to Property and Space to Unit. Scope is inventory association, not exact lock/door/electronic permission truth.
127. AccessItem code, physical identity, kind, Property/Unit/Space scope and original recording provenance are immutable. `label` is correctable metadata through optimistic versioning.
128. Every new AccessItem starts `active` at version 1 with null retirement provenance. Lifecycle is independent from custody: `active -> retired` is terminal and records immutable `retiredAt/retiredByUserId/retirementReason`. At the moment that retirement transition is written, `retiredAt` cannot predate AccessItem recording or the latest custody occurrence that already exists then; later `returned/lost` events may occur after `retiredAt`.
129. AccessItemTransaction is append-only custody history. Per AccessItem, sequence starts at 1 and advances exactly by one; updates/deletes are forbidden.
130. Current custody state is derived only from the latest transaction: no transaction or `returned` = available; `issued` = held by that Tenancy; `lost` = unavailable and still associated with that holding Tenancy. There is no parallel mutable current-holder truth.
131. New `issued` requires an `active` AccessItem and Tenancy in `active|notice_given|move_out_pending`. The UTC calendar date of `issued.occurredAt` must be >= `Tenancy.actualStart`; PostgreSQL must use `(timezone('UTC', occurred_at))::date`, never session-local `occurred_at::date`. Property-scoped item may serve any Tenancy in that Property; Unit/Space-scoped item requires that exact Tenancy Unit.
132. `returned` requires previous custody state `issued|lost`; `lost` requires previous state `issued`; both must reference the exact current holding Tenancy. A lost item cannot be reissued until returned. Return/loss remains legal after AccessItem retirement because lifecycle does not rewrite custody.
133. AccessItem transaction time is monotonic: `item.recordedAt <= occurredAt <= recordedAt`; later transactions cannot move either occurrence or recording time before the previous transaction. Equality is legal because sequence provides deterministic order.
134. Ending a Tenancy does not rewrite outstanding AccessItem custody. Return/loss may close an existing custody chain after Tenancy end, while a new issue to ended/cancelled/draft/planned Tenancy is forbidden.
135. PostgreSQL transaction insertion and AccessItem lifecycle/metadata updates serialize through the same AccessItem row lock. PostgreSQL independently revalidates active-item issuance, next sequence, Tenancy scope/state, UTC `actualStart` boundary, holder, custody transition and retirement temporal rules; concurrent issue/issue and retire/issue attempts therefore cannot both create contradictory truth.


## Meters + Utilities

136. Meter is one exact physical cumulative utility meter for exactly one Unit and optional Space of that Unit. Code, serial number, utility type, measurement unit, Unit/Space placement, installedAt and original recording provenance are immutable; label is correctable metadata through optimistic versioning.
137. Every new Meter starts active at version 1 with null retirement provenance. Lifecycle is terminal `active -> retired`; retirement records distinct `retiredAt` occurrence and `retirementRecordedAt/retiredByUserId/retirementReason` provenance.
138. At the moment Meter retirement is written, `retiredAt` cannot predate installation or any reading occurrence already persisted. Historical `retiredAt` may predate Meter registration, but `retirementRecordedAt >= Meter.recordedAt`. Later historical backfill remains legal only for `readAt <= retiredAt`; no reading may occur after retirement.
139. MeterReading is one append-only physical observation. Its value is an exact non-negative decimal with at most 18 whole digits and six decimal places; PostgreSQL must reject excess scale/range without typmod rounding.
140. MeterReading occurrence may predate system registration but cannot predate Meter installation; recording provenance cannot: `recordedAt >= readAt` and `MeterReading.recordedAt >= Meter.recordedAt`. One exact Meter+readAt occurrence is unique.
141. MeterReading carries no Tenancy/context role. MeterReadingBoundary separately links a reading to one Tenancy as `move_in|move_out`, allowing one physical observation to serve multiple business boundaries without duplicate observations.
142. MeterReadingBoundary requires exact Meter/Tenancy Unit parity. Move-in requires UTC date(readAt) = immutable Tenancy.actualStart; move-out requires UTC date(readAt) = immutable Tenancy.actualEnd. Session timezone must never determine this comparison.
143. One exact Meter+Tenancy+boundary type may exist at most once. Boundary insertion serializes on the Meter row before checking this cross-row uniqueness rule.
144. Meter reading INSERT share-locks the Meter while retirement UPDATE locks the same row; a retirement/read race cannot commit a reading whose occurrence is after the committed retirement boundary.
145. Historical consumption basis is calculated only between consecutive readings of the same exact Meter. If the later register value is lower, consumption is null and continuity is `decrease_detected`; the system must not invent negative usage or guess reset/rollover semantics.
146. Inspector may read Meter history and append MeterReading/MeterReadingBoundary facts, but Meter master creation/metadata/lifecycle mutation requires `meters:write`.

147. Every canonical field that represents an instant requires an explicit `Z` or numeric UTC offset at domain/API input and is normalized to UTC ISO; offset-less local datetime strings are invalid. Date-only business fields are not affected by this rule.


## Business Events + Unit Timeline

148. Unit Timeline is a read-only projection of canonical domain tables. No `domain_events` write table or command-side dual-write may become competing business truth.
149. Every projected event has the exact stable identity `eventKey = eventType + ":" + sourceId`. The domain projection boundary validates the formula; filtering, pagination and repeated reads must not change that identity.
150. Timeline temporal precision is explicit. Date-only facts have `precision = date`, `occurredAt = null` and retain the exact business date. Instant facts have canonical UTC `occurredAt`, `precision = instant`, and `occurredOn = UTC date(occurredAt)`.
151. Timeline ordering is deterministic but must not imply false intra-day chronology between a date-only event and an exact instant on the same calendar date.
152. An event may enter a Unit timeline only through deterministic durable parent truth. `Space.unitId`, `Tenancy.unitId`, `LeaseAgreement.tenancyId` and `LeaseAmendment.agreementId` are immutable, DocumentLink is append-only, and Asset/Service attribution uses historical AssetLocationHistory at event occurrence. Property-wide or otherwise ambiguous sources are omitted rather than guessed or copied to every Unit.
153. Current `status` and generic `updatedAt` must not be used to invent a historical transition whose canonical occurrence was not retained by the source domain.
154. Timeline `details` are denormalized read-model display facts only. Historical details must not present mutable current lifecycle state as if it were an event-time snapshot. Details are never accepted as commands and never override source entities.
155. Unit Timeline reads require `portfolio:read`. Technical audit/security/request logging remains separate from business-event chronology.


## Reporting + Portfolio projections

156. Reporting is a read-only projection layer over canonical domain truth. No writable reporting table, dashboard mutation path or reporting-side source of business truth may be introduced.
157. Every Reporting query receives an explicit valid `asOf` business date. Occupancy, legal contract coverage and Cost cutoff must not depend on `CURRENT_DATE`, session timezone or query execution day.
158. Unit occupancy is derived only from Tenancy temporal truth. Actual occupancy covering `asOf` takes precedence over a currently retained planned reservation; otherwise the Unit is vacant. `Unit.status` never determines occupancy. The domain projection boundary independently validates that the selected Tenancy interval covers `asOf`.
159. Legal contract coverage is `effective|future_signed|missing` and follows the current canonical signed successor chain evaluated at `asOf`. A predecessor ceases to govern at a signed successor's `effectiveFrom` even though predecessor `effectiveTo` is not rewritten. Current `superseded` status does not erase valid predecessor coverage for an earlier business date.
160. Draft LeaseAgreements are current workflow metadata only. They are exposed separately as `currentDraftAgreementCount` and never become legal historical/as-of coverage.
161. Effective Tenancy terms use the latest valid term version with `effectiveFrom <= asOf` whose source Agreement/Amendment belongs to the selected governing LeaseAgreement. A future Amendment on a predecessor must never leak across a signed successor boundary. Exact money and source billing frequency are preserved; Reporting never invents normalized recurring revenue.
162. `currentOperations` and other explicitly current fields are current-state projections, not historical reconstruction at `asOf`. An old `asOf` may legitimately be returned alongside today's operational workload/inventory.
163. Cost reporting uses the currently corrected ledger filtered by `incurredOn <= asOf`: a Cost with an outgoing reversal contributes nothing; a non-reversed replacement participates normally. This is not a historical "known-at-date" ledger.
164. Monetary reporting is grouped by currency. CAPEX, OPEX, unclassified and total must balance exactly within each currency; unlike currencies must never be implicitly summed.
165. Unit Cost attribution may use only deterministic durable Unit parent truth: direct Unit, immutable Space parent, immutable Unit-scoped Improvement/Work parent and immutable Maintenance scope. Property-wide and ambiguous Asset/Warranty/Service Costs are omitted from Unit totals rather than guessed.
166. Portfolio Cost totals may include every effective Cost source because portfolio aggregation requires no Unit attribution. Unit-level omission must not cause portfolio-level financial loss.
167. Property reporting rows may contain only Units/current operations belonging to that Property. Property occupancy buckets and portfolio occupancy buckets must each partition their corresponding Unit count, and Property rows must roll up exactly to matching Portfolio Unit/occupancy and shared current-operation totals. Obvious subcounts are bounded: urgent Maintenance Issues cannot exceed open Issues, and active/inactive Asset counts cannot exceed located Assets.
168. Reporting reads require `portfolio:read`. Reporting DTOs are outputs only and cannot be accepted as business write commands.
169. `MoneyAmount` is the bounded scalar type for one canonical monetary fact; Reporting sums use `ReportingMoneyAmount`, an exact non-negative two-decimal aggregate whose whole-part range is not capped to the scalar 16-digit limit. A valid set of scalar facts must not become an invalid projection solely because its exact sum is wider.
170. One Reporting response is one PostgreSQL observation. Every multi-statement Unit overview or Portfolio dashboard read runs inside one `REPEATABLE READ READ ONLY` transaction so all component queries share one snapshot; a concurrent commit becomes visible on the next request, never halfway through the current DTO.
