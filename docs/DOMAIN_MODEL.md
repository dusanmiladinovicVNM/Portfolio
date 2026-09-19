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
  ├─ Property                 required while currently located
  ├─ optional Unit            must belong to Property
  ├─ optional Space           requires Unit and must belong to it
  ├─ correctable name/manufacturer/model
  ├─ AssetIdentifier[]        structured append-only identifiers
  └─ AssetReplacement         predecessor → successor physical identity
```

Valid located shapes are therefore `Property only`, `Property + Unit`, or `Property + Unit + Space`. A building lift, central boiler or fire-control panel does not require a synthetic `COMMON` Unit. A replaced historical Asset has no current placement projection.

`Asset.id` is the immutable physical identity. `code` is stable business identity. `name`, `manufacturer` and `model` are correctable master metadata and may be corrected through an optimistic-CAS mutation without creating a new physical Asset. Dedicated metadata history is not introduced here; future AuditEvent/DomainEvent infrastructure should capture actor/time/delta for such corrections.

PR #14 deliberately does not expose a move command. Current Property/Unit/Space placement is protected from mutation until canonical PR #15 introduces `AssetLocationHistory`; that history will make placement temporal without changing Asset identity. Replacement is also not a move: the successor inherits the predecessor's exact current placement.

An Asset starts active and has an optimistic aggregate version. Supported metadata corrections and lifecycle transitions each advance that version exactly once. Normal lifecycle transitions may temporarily inactivate or permanently retire it. The `replaced` status is established only together with an append-only successor relationship, leaving the old physical identity intact.

Serial, product, inventory and similar identifiers are first-class append-only child records rather than notes. Identifier values are canonicalized against surrounding whitespace at the DB boundary. `inventory_tag`, `imei` and `mac_address` are globally unique; serial/product/barcode remain intentionally weaker until their business scope is explicitly defined. MAC/IMEI type-specific canonicalization is deferred rather than guessed prematurely.

Canonical PR #15 adds temporal and tenancy history around the stable physical Asset identity:

```text
Asset
  ├─ AssetLocationHistory[]        authoritative temporal placement
  ├─ AssetConditionAssessment[]    append-only condition facts
  └─ TenancyAssetAssignment[]      tenancy inventory membership
       ├─ moveIn snapshot
       └─ moveOut snapshot
```

`assets.property_id/unit_id/space_id` remain a current projection for efficient reads, but are not an independent source of truth. Located Assets must match exactly one open AssetLocationHistory interval; a replaced Asset has zero open intervals and a null projection.

A move is one transaction: close the old interval, append the new interval, update the projection and CAS `Asset.version`. Replacement closes the predecessor interval at `replacedAt`, opens the successor at the same placement/timestamp and clears the predecessor projection. Tenancy inventory is independent of movement: assignment records inventory scope, not ownership, location or exclusive possession.

Condition assessments are append-only. Move-in/move-out snapshots may reference exact condition assessments and preserve missing/present truth without overwriting a global condition field. New inventory assignment is limited to draft/planned/active Tenancies; move-in is limited to planned/active and move-out to active/notice-given/move-out-pending. A `present` snapshot additionally requires the Asset's current Unit to equal the Tenancy Unit at recording time, while `missing` remains valid after the Asset has moved elsewhere. Historical backfill will require a later explicit occurrence-time model.

Canonical PR #16 adds Warranty and Service as separate operational grains around the same stable physical Asset identity:

```text
Asset
  ├─ Warranty[]
  │    └─ WarrantyClaim[]
  ├─ ServicePlan[]
  └─ ServiceEvent[]
       └─ ServicePart[]
```

A Warranty is one append-only coverage record with a coverage interval and optional provider Party. Warranty expiry is derived from dates. A WarrantyClaim is a separate optimistic workflow under that exact coverage record and preserves `recordedAt` plus `recordedByUserId`. Its incident date must be inside coverage and cannot be later than the UTC calendar date of `recordedAt`; later submission or resolution does not rewrite when the incident happened.

A ServicePlan records expected future service policy/schedule, not completed work and not a WorkOrder. One-time plans have one due date; recurring plans add a positive month cadence. A new or reactivated active plan requires an `active` or `inactive` Asset; `retired` and `replaced` Assets are not operationally eligible. Replacement does not reach across bounded contexts to end the predecessor's plan automatically: effective applicability is derived from `plan.status === active` together with an operationally eligible Asset. No mutable next-due projection is introduced yet.

A ServiceEvent is append-only completed-work history. It preserves `performedAt` separately from `recordedAt` so historical imports do not falsify occurrence time. Optional ServicePlan and WarrantyClaim links must resolve back to the same Asset. ServiceEvent and ServicePart rows commit atomically.

ServicePart is intentionally a service-line component/consumable, not an Asset hierarchy. If an installed component needs independent identity, placement, warranty or future service history, it is modeled as another Asset.

Provider Party rules distinguish history from future operations. Warranty and ServiceEvent history require Party identity existence but may reference an inactive or archived supplier. A new or reactivated ServicePlan, by contrast, requires its provider Party (when present) to be active.

Asset replacement does not transfer predecessor Warranty/Service history to the successor. Existing predecessor ServicePlans remain historical records but cease to be operationally applicable once that Asset is `replaced`; they may be ended/cancelled but not reactivated, and no new active plan may be created for that predecessor. Cost, Improvement material flows and Maintenance Issue/WorkOrder creation remain downstream canonical phases.
### ImprovementProject

Canonical PR #17 separates planned work from completed-work evidence:

```text
ImprovementProject
  └─ WorkItem[]
       └─ WorkRecord[]
            ├─ WorkMaterial[]
            └─ ProjectAsset[]
```

An ImprovementProject is one managed renovation/improvement initiative. It has immutable physical scope at Property level with optional Unit and Space, using the same hierarchy rules as the rest of Portfolio. Property-only scope represents common/building works; this phase does not invent synthetic Units or a premature multi-scope model.

Project lifecycle is `draft -> planned -> in_progress -> completed`, with cancellation from non-terminal states. Project identity/scope remain stable; name, description and planned dates are correctable only before work begins. Completion requires every WorkItem to be terminal, cannot precede any child terminal timestamp, and Project completion/cancellation cannot be backdated behind existing WorkRecord occurrence history. Project cancellation also cannot predate child WorkItem creation/start/completion history, while a later WorkItem cancellation remains legal as cleanup after the parent has already been cancelled.

WorkItem is expected/planned scope. It is not proof that the work happened. Its lifecycle is `planned -> in_progress -> completed` with cancellation from planned/in-progress. Title/description may be corrected optimistically while planned; definition freezes once the item starts. Starting/completing a WorkItem requires the parent Project to be in progress, and its completion/cancellation timestamp cannot be backdated behind existing WorkRecord occurrence history.

WorkRecord is append-only historical work truth under one exact WorkItem. `Project.startedAt` and `WorkItem.startedAt` are business occurrence boundaries. `performedAt` must fall at or after both starts, at or before the earliest Project/WorkItem terminal cutoff, and at or before `recordedAt`. Historical work can still be recorded later; importing work that predates the Portfolio record requires a future explicit import flow that reconstructs historical start timestamps rather than bypassing these bounds. A WorkRecord may reference a contractor Party by stable identity even if that Party is now inactive.

Normal WorkRecord creation is one sealed transaction:

```text
WorkRecord
+ WorkMaterial[]
+ ProjectAsset[]
+ seal
= one commit
```

The database requires the parent WorkRecord to be sealed at commit and rejects later mutation or child append. Cross-table lifecycle invariants are concurrency-safe through row locking: WorkItem writes share-lock Project, WorkRecord writes share-lock WorkItem then Project, and evidence children share-lock the unsealed WorkRecord. Parent lifecycle UPDATEs therefore serialize with child creation and revalidate a committed state rather than depending on a racy check-then-write.

WorkMaterial records exact positive material/consumable quantity with decimal semantics. It contains no money and is not an Asset. If a component needs identifiers, placement, warranty, service history or replacement lineage, it belongs in Asset Registry instead.

ProjectAsset records that work `affected` an existing Asset or involved `installation_work` / `removal_work` on it. The latter labels intentionally describe contractor activity, not canonical Asset placement/lifecycle at `performedAt`. ProjectAsset is evidence only: it does not move, retire, replace or independently assert physical location. Canonical physical changes remain Asset-domain truth; physical replacement stays in AssetReplacement.

Canonical #17 deliberately does not create Cost/invoice records, Maintenance Issue/WorkOrder, material stock/procurement or contractor billing. Those later contexts may link back to Project/WorkRecord without becoming their source of truth.

### Maintenance

Canonical #19 separates reported maintenance problems from the operational tasks used to address them.

```text
MaintenanceIssue
  └─ MaintenanceWorkOrder[]
       └─ ServiceEventLink[]

InspectionFinding -> optional MaintenanceIssue origin
Cost -> MaintenanceIssue | MaintenanceWorkOrder
```

MaintenanceIssue is one reported problem. It owns immutable physical scope (Property plus optional Unit, Space and Asset), optional originating InspectionFinding, occurrence/recording provenance, priority and the Issue lifecycle. Unit/Space hierarchy must be coherent. When an Asset is present, the Issue resolves the authoritative AssetLocationHistory interval at `reportedAt`; recording the Issue later must not substitute the Asset's current projection. Later Asset movement, retirement or replacement never rewrites the Issue's historical scope, and PostgreSQL rejects a later backdated location-history closure that would make an already-recorded Issue fall outside the interval it captured.

An InspectionFinding may originate at most one MaintenanceIssue. The Finding remains Inspection truth, must belong to the same Unit, and must already exist when the Issue is reported: `Issue.reportedAt >= Finding.createdAt`. Maintenance never edits Inspection content; PostgreSQL only freezes the linked Finding's `createdAt` provenance needed to preserve this cross-context invariant.

MaintenanceWorkOrder is one operational task under one exact Issue. One Issue may have several WorkOrders. WorkOrder lifecycle is `draft -> assigned -> in_progress -> completed` with cancellation from any non-terminal state. A WorkOrder cannot be created before its parent Issue was recorded: `WorkOrder.createdAt >= Issue.recordedAt`. Assignment may target one active internal User or active Party and may be changed before work starts. Task definition and assignment freeze after start.

Issue resolution requires at least one completed WorkOrder and every WorkOrder terminal. Issue cancellation requires every existing WorkOrder cancelled. Parent/child writes share a PostgreSQL lock protocol: WorkOrder writes lock the parent Issue, so terminal Issue transitions serialize with concurrent child creation or lifecycle changes.

ServiceEvent remains Asset/Service completed-work truth. Maintenance stores only an append-only relational link. A linked ServiceEvent must belong to the exact Issue Asset and its `performedAt` must lie inside the WorkOrder execution interval. WorkOrder completion cannot predate already-linked service work, and a WorkOrder with linked ServiceEvents cannot be cancelled. Link creation locks the WorkOrder so it serializes with cancellation/completion checks.

Maintenance owns no money fields. Cost remains financial truth and may use MaintenanceIssue or MaintenanceWorkOrder as typed CostSource values.

## Keys + Access

Canonical #20 models physical access media and their custody history without pretending to model the complete lock/access-control system.

```text
AccessItem
  └─ AccessItemTransaction[]
        └─ Tenancy
```

AccessItem is one exact physical `key`, `card` or `remote`. It has immutable Property/optional Unit/Space inventory scope, stable code, label and recording provenance. Property scope may represent a shared building entrance item; Unit/Space scope narrows which Tenancy may receive it. This scope is inventory association, not authoritative door/lock/programming permission truth.

AccessItemTransaction is the append-only custody source of truth. Supported events are `issued`, `returned` and `lost`. Current state is derived from the latest per-item sequence: no history or returned means available; issued means held by that Tenancy; lost means unavailable under that Tenancy's responsibility. There is deliberately no mutable current-holder column or parallel assignment table.

Custody is Tenancy-grained. Party/TenancyParty remains the identity source and is not copied into access history. New issue is allowed only to `active`, `notice_given` or `move_out_pending` Tenancy. Property-scoped items may be issued to any Tenancy whose Unit belongs to that Property; Unit/Space-scoped items require the exact Tenancy Unit.

A lost item cannot be reissued. If it is recovered, a `returned` transaction by the same holding Tenancy makes it available again. Return/loss may be recorded after the Tenancy later ended because those events close or preserve already-existing custody history; Tenancy end itself does not erase or silently repair outstanding access items.

Transaction chronology is monotonic and append-only. `AccessItem.recordedAt <= occurredAt <= recordedAt`, and later item transactions cannot move occurrence or recording chronology backwards. PostgreSQL row-locks the AccessItem during transaction insertion and independently rechecks sequence, holder, Tenancy scope/state and temporal rules so concurrent issue attempts serialize.

Canonical #20 does not yet model AccessPoint/door topology, master-key hierarchy, credential secrets, electronic permission schedules, per-Person custody, lost-key billing or historical pre-registration import.

### Cost

Canonical #18 defines Cost as one append-only positive monetary allocation to exactly one typed business source. Cost is a financial fact/projection and never substitutes for the source entity's own state or lifecycle.

```text
Cost
  ├─ exactly one CostSource
  └─ optional outgoing CostReversal
         └─ optional replacement Cost
```

Supported source grains are Property, Unit, Space, Asset, WarrantyClaim, ServiceEvent, ImprovementProject, WorkItem, WorkRecord, WorkMaterial, MaintenanceIssue and MaintenanceWorkOrder. The database uses typed foreign keys plus a discriminator and rejects ambiguous or mismatched source shapes.

Amount is exact two-decimal money. PostgreSQL stores the unrounded value as exact `numeric`, then independently rejects values with more than two decimal places and amounts outside the domain's 16-digit whole-part range; direct SQL therefore cannot silently turn `1.005` into a rounded ledger fact. Cost currencies are deliberately limited to the configured set `CHF|EUR|RSD`; this phase does not claim generic ISO 4217/minor-unit support. Unlike currencies are never implicitly summed.

`incurredOn` records the business date and cannot be later than the UTC date of immutable `recordedAt`. Supplier is an optional Party identity reference and may remain valid after that Party becomes inactive. `invoiceReference` is only an external reference string; there is no Invoice/AP aggregate in canonical #18.

Cost rows are immutable. Corrections use full reversal plus an optional replacement Cost. A Cost can have at most one outgoing reversal, and one replacement Cost can belong to at most one incoming correction. Replacement and reversal are created atomically by the application and share both `recordedAt` and `recordedByUserId`; PostgreSQL enforces the same parity. Ledger reads expose both the outgoing reversal and the incoming correction so predecessor/successor history can be traversed without inventing a separate full-chain endpoint.

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
