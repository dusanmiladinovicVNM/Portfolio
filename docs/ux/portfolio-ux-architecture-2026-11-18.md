# Portfolio — UX-0 audit, task map and target information architecture

**Status:** Product direction approved by owner 2026-11-19; implementation acceptance and hosted UAT remain separate  
**Epic:** [#124](https://github.com/dusanmiladinovicVNM/Portfolio/issues/124)  
**Audited base:** main at 316544ec0f76baee94efbeed7d344939f4b81f0e (2026-11-18)  
**Evidence:** repository source + [hosted UAT baseline](../uat/hosted-acceptance-baseline-2026-10-30.md) + [risk-based production acceptance](../uat/risk-based-production-acceptance-2026-11-18.md) + [domain invariants](../INVARIANTS.md). No new direct user-observation study was performed.

## 1. Decision record

### Approved product decisions — 2026-11-19

The product owner explicitly approved the following direction for Epic #124. These are **product/presentation decisions**, not proof of successful UAT, new permission grants, changes to API/domain state, or authorization to bypass release gates.

| ID | Approved decision | Non-negotiable implementation interpretation |
| --- | --- | --- |
| UX-D01 | **Task-first navigation** | Work/assigned next action takes priority; Property/Unit dossier remains accessible with exact object identity and deep links. No second router or unconditional global directory for restricted Inspector actors. |
| UX-D02 | **Five guided Inspection stages** | Setup → Inspect rooms/sections → Evidence summary → Review & Sign → Report. These are UX stages; canonical lifecycle remains draft → in_progress → locked → finalized, with cancelled terminal. Review occurs before lock; Sign only after lock. Navigation among legally available stages is permitted. |
| UX-D03 | **Photo and Finding in active room + central Evidence review** | Capture directly at the exact room/item, then aggregate linked evidence for review. A stored binary is never treated as attached until its exact canonical DocumentVersion relation is confirmed. |
| UX-D04 | **Assigned Inspector may lock** | Preserve existing server capability for assigned Inspector to create/self-assign where permitted, start, edit, review, lock and sign. Unlock and finalize remain manager/admin-only (when otherwise authorized), and final PDF generation requires authorized manager/admin. No permission may be inferred from a UI role flag alone. |
| UX-D05 | **Next only after confirmed save** | For an edited section, `Save & continue` or equivalent awaits canonical, matching PATCH acknowledgement before changing room/stage. Pending/failed/conflicted/ambiguous writes must block advancing without discarding edits. Plain Previous/Next are navigation, not implicit save; existing dirty guard remains until replacement task flow is proven and reviewed. |
| UX-D06 | **Primary language: Swiss German (`de-CH`)** | Plan German labels and field messaging for new task surfaces; design translation keys for later languages. Do not translate API identifiers, persisted enum values, machine status codes, exact contracts, or browser locators casually. English remains in existing production screens until a focused localization PR is tested. |
| UX-D07 | **Staged PR merge + UAT** | Documentation/design approval precedes reviewed runtime merges. Keep UX-2A (#132) independent of UX-2B (#133) until verified integrated diff and CI. Real assistive-technology and mobile UAT remain tracked acceptance gates; a passing browser mock is not equivalent. |

**Separate operational choice (Issue #129):** GitHub Actions alone, e-mail for alerts. This is **an explicitly accepted tooling restriction**, not acceptance of an actual 15-minute monitoring guarantee. Github's scheduled runs have observed multi-hour gaps. Retrospective gap detection/catch-up and GitHub notification configuration belong to a separate operational PR; absent an independent scheduler, the system cannot guarantee timely dead-man notification while no Actions job starts.

**Change control:** Any proposal to alter UX-D01–D07 requires a new owner decision and review of impact. Until UX-3 implements the approved safe Continue action and `de-CH` UI, #132/#133 remain targeted accessibility/focus corrections, not a claim that these product workflows are already live.


**Recommendation:** Retain React/TypeScript, existing typed application API, canonical PostgreSQL, URL-owned navigation, Unit route identities, section autosave/CAS, binary ownership, finalized snapshots, and existing domain commands. Redesign the presentation hierarchy and task transitions, beginning with Inspection, and introduce only a small number of shared UX primitives.

**Not proposed:** database/domain migrations, changing lifecycle enums, new standalone Inspection domain, server authorization driven by UI, new UI framework, offline/PWA synchronization, rewriting all frontend modules, or business writes directly from the browser to PostgreSQL.

Existing infrastructure already includes a grouped Unit dossier navigation (Occupancy/Operations/Unit & equipment/Records), primary workspace navigation (Overview/Work/Find/Properties/Parties/Administration), active Inspection section links and a five-step presentation stepper. This is a substantial starting point and must not be reimplemented without evidence.

### Evidence labels

- **CONFIRMED CODE:** directly observed in audited source at the pinned SHA.
- **CONFIRMED UAT:** explicitly recorded in the hosted manual register, within that register's limits.
- **UX HYPOTHESIS:** likely operator impact; requires observed usability validation.
- **ACCEPTANCE GAP:** a risk-based hosted test is not yet proved; not automatically an implementation defect.

## 2. Current screen / task inventory and qualitative assessment

| Surface | Current entry/navigation | Jobs enabled | Assessment and intended direction |
| --- | --- | --- | --- |
| Sign-in and workspace shell | App.tsx; WorkspaceNavigation.tsx | Authentication, global navigation, session, role entry | KEEP shell and role gate; clarify labels, context, mobile density. |
| Dashboard | PortfolioDashboard.tsx, PortfolioCommandCenter.tsx | Portfolio overview, attention list, reporting as-of | KEEP projection and command center; prioritize action-now over reporting explanation. |
| Work | OperationalWorkQueue.tsx | Domain/attention filters; link to target work | KEEP canonical work source and direct routes; focus actor-appropriate task/next action. |
| Find | PortfolioDiscovery.tsx | Search Property/Unit and work | KEEP cross-object routing; validate switch-object speed in UAT. |
| Properties | PropertyDirectory.tsx, PropertyUnits.tsx, PropertyCommandCenter.tsx | Locate Property/Unit, property-scoped operations | KEEP identity; improve Property → Unit → task wayfinding. |
| Unit dossier | UnitDossier.tsx, UnitDossierNavigation.tsx, UnitOverview.tsx | 11 dossier tabs, grouped navigation and context trail | REFINE local IA; no second parallel global nav; reduce persistent nav noise. |
| Inspection | UnitInspections.tsx, InspectionOrchestrationPanel.tsx, FindingsEvidence, Finalization | Setup, section save, findings, evidence, signatures, lock, finalization and report | PRIMARY REDESIGN: task states, evidence and role-aware surfaces; preserve write owners. |
| Tenancy / contracts | UnitTenancies.tsx, UnitContracts.tsx and lease editors | Lifecycle, parties, agreements, amendments, PDFs | STAGED workflow decomposition after Inspection pattern proves useful. |
| Maintenance / assets | UnitMaintenance.tsx, UnitAssets.tsx and service views | Issue, WorkOrder, ServiceEvent, physical assets | STAGED task-specific views; protect origin/owner/cross-domain transitions. |
| Documents / timeline | UnitDocuments.tsx, UnitTimeline.tsx, DocumentBinaryActions.tsx | Reference and open immutable artifacts, audit history | KEEP authoritative document resolution and chronology; make documents easy to open in context. |
| Administration | StaffAdministration.tsx, InspectionSchemaAdministration.tsx | Manage staff, draft/publish schemas | DISTINCT administrative workspace; not prominent to field staff. |

Assessment categories are design judgments based on code composition, not measured usability scores. Performance, error rate and task completion baseline remain unmeasured.

## 3. Ten highest-priority findings

| ID | Priority / kind | Confirmed location and evidence | Operator consequence | Target / verification |
| --- | --- | --- | --- | --- |
| UX01 | P1 UX debt | InspectionFindingsEvidence.tsx evidence list around lines 963–1010 shows kind/caption/scope but no binary action; Open/Download occurs in Advanced document-version selector around lines 1230–1270. Hosted UAT confirms need to expand Advanced. | Cannot view attached photo where it is referenced. | Evidence card shows permitted preview, Open and Download for exact version; ownership-denied response never leaks binary. |
| UX02 | P1 UX debt | InspectionFindingsEvidence.tsx scoped upload around lines 393–530 stores exact DocumentVersion and explicitly prompts user to attach below; separate attach form around 1273–1328. | Field operator must understand storage vs relation and may mistake upload for successful attachment. | One visible “Add photo / file” task with explicit “Uploading → Linking → Attached” stages; call existing APIs safely; canonical attach proof required before success. |
| UX03 | P1 UX debt | UnitInspections.tsx renders section grid plus Findings/Evidence, then InspectionFinalizationPanel after it; hosted UAT describes long, scattered workflow. | Review/sign/report not clearly the current actionable phase. | Focus stage view with one primary next step and secondary details only when relevant. |
| UX04 | P1 UX debt | InspectionWorkflowStepper.tsx is an ordered list of lifecycle-derived states and not an action/navigation control; inspection-workflow.ts maps status + completion to current step. | A step is visible without necessarily bringing the operator to the required work. | Preserve the presentation projection but add an actionable step context / “Continue” route; never invent persisted statuses. |
| UX05 | P1 role UX mismatch | InspectionFinalizationPanel.tsx renders Unlock and Finalize controls when locked, without an actor-role prop; application inspection-commands.ts explicitly denies Inspector unlock/finalize. | Field Inspector sees actions that must fail authorization. Not a proven server security bypass. | Hide actionable privileged controls for Inspector and show handoff/status; server capability stays authoritative. Validate role matrix with hostile API tests separately. |
| UX06 | P1 recovery UX | UnitInspections.tsx around lines 1061–1110 exposes “Reload server version and discard local edits” after revision conflict. Local answers remain visible before this explicit discard. | Only surfaced recovery action is destructive; operator must manually reconcile. | Conflict view compares current server and local answers where feasible, with Copy/Retry/Discard under controlled CAS; never silently overwrite. |
| UX07 | P2 IA debt | UnitDossierNavigation.tsx provides four groups and a text-only context trail; UnitDossier.tsx shows generic “← Property Units” and code/Unit number, not a full clickable Property → Unit → active job trail. | Object identity and quick return are less explicit during long tasks. | Compact contextual breadcrumb with actual user-readable object names and deterministic back-to-Work / back-to-Unit. |
| UX08 | P2 cognitive-load debt | InspectionOrchestrationPanel.tsx exposes “Published schema”, internal code and technical “assignment + schedule” copy; UnitInspections sections display section revision and item types. | Administrative vocabulary appears in the normal field task. | Office setup retains schema selection where needed; Inspector sees title, room, progress, owner and readable questions; diagnostics hold IDs/revisions. |
| UX09 | P2 cross-module UX debt | UnitMaintenance.tsx (2,268 lines; multiple WorkOrder/ServiceEvent forms) and UnitAssets.tsx (1,420 lines; several forms) compose numerous operations in domain-oriented panels. | Potential form competition and next-action ambiguity; actual task frequency not measured. | After Inspection UX validation, split priority work actions into clear stages and preserve deep links. Test representative repair and service tasks. |
| UX10 | P1 acceptance gap / UX hypothesis | styles.css contains mobile breakpoints (760/860 px), stacked sections and sticky save controls; risk-based acceptance still lists physical touch, camera, offline interruption/slow network and signature testing as not proven. | Responsive CSS existence is not proof that a field inspector can finish on a phone. | Execute device UAT for 320/375/768 px, keyboard/focus, camera permissions, touch signature, slow/failed upload, return to draft; record observed results. |

Priorities reflect operator impact and implementation ordering, not established production incident severity. #126/PR #127 binary access security was fixed and hosted-tested; no claim is made that the UX findings reopen it.

## 4. Personas and jobs-to-be-done

| Persona | Primary jobs | Needs to see first | Secondary / privileged actions |
| --- | --- | --- | --- |
| Inspector (field) | Open assigned Inspection, identify correct Unit/room, record responses, add Findings and photos, sign where permitted, resume after interruption | My work; site/context; room progress; current unsaved/saving/saved state; next allowed action | Version and upload diagnostics in Advanced; never present Unlock/Finalize as available operations |
| Manager (operations) | Assign/schedule, locate overdue work, oversee room completion, review and lock where permitted, resolve controlled unlock, finalize and produce report | Work attention, assignee/status, missing responses/signers, release-ready steps | Historical versions, schema diagnostics, recovery/administrative exceptions |
| Admin (governance) | Configure staff and published schemas, oversee business lifecycle, troubleshoot evidence and access, execute permitted completion/recovery | Portfolio and administrative queue, blockers requiring authority | Full technical provenance and audit controls deliberately separated from daily field UI |

**Important permissions nuance:** current application commands allow an Inspector to create an Inspection only within their permitted assignment scope (self-assignment restriction), start, edit, attach evidence, lock and sign their assigned Inspection. They reject Inspector unlock and finalization; report generation is manager/admin. Do not simplify this into a false “Inspectors can never create or lock” rule. Reverify capability policy against server/API before each UI gate change.

### Job routes (target)

1. Inspector: **Work → Assigned Inspection → current section → add evidence → review/lock (if authorized) → sign → manager handoff**.
2. Manager: **Work / Property → Unit → Inspection → check completion → lock/signatures → finalize → final report**.
3. Admin: **Administration → staff/schemas**, or **Work → exception requiring authority**. Administrative setup is not a default part of routine Inspection execution.

## 5. Existing and target information architecture

### Existing (verified)

- Workspace: Overview, Work, Find.
- Portfolio: Properties, Parties.
- Current context: Property and Unit dossier.
- Administration: Staff (Admin), Inspection schemas (Admin/Manager).
- Unit dossier: Overview, Tenancies, Contracts, Inspections, Maintenance, Spaces, Assets, Keys, Meters, Timeline, Documents (grouped as Occupancy/Operations/Unit & equipment/Records).
- Inspection: a selected Inspection inside Unit dossier with selected SectionInstance in the URL query; nested content, review/lock, signatures and report.

### Target (minimum change, same route ownership)

- **Home/Overview:** attention first; reporting below, grouped by frequency.
- **My/Team Work:** action cards with concrete next-step labels and direct links, role-aware scope, filters kept.
- **Find:** global entry to Property/Unit/work; display the path of each result.
- **Properties:** Property → Unit. Keep existing dossier tabs but present compact task shortcuts on Overview and focus the current tab's active job.
- **Unit > Inspections:** Inspection list → focused selected Inspection; within it, task-stage/room navigation. Reuse current inspectionId and sectionInstanceId URL context.
- **Unit > Records:** Documents and Timeline stay distinct; contextual binary links appear also beside the business record owning them.
- **Administration:** Staff and schema configuration remain separate and role-gated.

Do **not** introduce new top-level nav entries “Signatures”, “Evidence”, “Reports” or another parallel object directory just to mirror components. A potential dedicated inspection route is **not approved** by this design; retain current canonical Unit deep link unless usability measurement proves otherwise.

### Object context contract

Every focused task shows compact, readable **Property / Unit / Inspection** identity (code + name/number), status, responsible person and local progress. Breadcrumb ancestors are actual navigable links. “Back to Work” should preserve a useful return context without relying exclusively on browser history; never discard dirty edits implicitly.

Business-date reporting (asOf) and current operational queue date must remain semantically distinct. The UI must describe this in ordinary language; do not silently turn Work into an as-of historical snapshot.

## 6. Shared UI strategy

Small shared primitives only, implemented in later PRs:

- Page/Task Header: identity, breadcrumbs, lifecycle status, one contextual next action.
- Task Stage Navigation: presentation stage and progress; no new domain state.
- Async Action Status: unsaved, saving, saved, error, conflict, unconfirmed write outcome.
- Evidence Card: file label, safe thumbnail if supported, scope/caption, permitted Open/Download and fallback.
- Confirmation / Destructive Action: explicit consequence and identity, protected focus.
- Empty/Forbidden/Error/Loading panels: distinguish zero items, denied access and failed request.
- Mobile Task Action Bar: one primary CTA and safe sticky positioning; does not overlay fields.

Prefer adapting existing CSS and JSX primitives. Create abstraction only after at least two real consumers share the same semantics.

## 7. Component disposition

| Component | Action | Rationale |
| --- | --- | --- |
| App.tsx, workspace-route.ts, use-workspace-navigation.ts, WorkspaceLink.tsx | KEEP; targeted refinements only | Route identity, blocking and focus model are valuable. Add regression checks, not a second router. |
| WorkspaceNavigation.tsx | REFINE | Reduced mobile density and clearer current business context. |
| UnitDossier.tsx, UnitDossierNavigation.tsx | REFINE | Existing tabs/grouping retained; add clearer breadcrumb and task entry points. |
| UnitInspections.tsx | REFACTOR PRESENTATION | Decompose displayed stages and active section shell, retain autosave, CAS and owner guards. |
| InspectionWorkflowStepper.tsx, inspection-workflow.ts | EXTEND | Keep status projection; connect stage display to task actions. |
| InspectionOrchestrationPanel.tsx | REFINE | Distinct Setup experience; role/capability-aware presentation. |
| InspectionFindingsEvidence.tsx | REFACTOR PRESENTATION | Inline exact-version Evidence cards and guided upload/link progression. Existing binary/attach commands remain. |
| InspectionPreLockReviewPanel.tsx | KEEP / PLACE | Canonical fresh reread stays mandatory; surface in Review stage rather than distant bottom. |
| InspectionSignaturePad.tsx | KEEP / HARDEN UX | Preserve pointer drawing and explicit upload/registration; test touch and signer identity. |
| InspectionFinalizationPanel.tsx | REFINE / SPLIT VIEWS | Review, Sign, authorized Finalize and report are separate task surfaces. Retain safety-critical command/recovery logic. |
| InspectionCompletedOverview.tsx | KEEP / REFINE | Read-only canonical result, report access and collapsed history. |
| DocumentBinaryActions.tsx | REUSE | Exact version reads only; permissions stay on server. |
| Dashboard/Work/Unit Maintenance/Contracts/Assets | LATER | Validate Inspection navigation pattern, then port only useful primitives. |

## 8. Proposed PR sequence

| Sequence | Scope | Principal regression / rollback |
| --- | --- | --- |
| UX-1 — this PR | Architecture, task map, Inspection wireflow, evidence/role contract, acceptance | Documentation only; no runtime delta. |
| UX-2 | Task header, save-state and minimal shared primitives | Focus, dirty guard, CSS/mobile regression; revert primitives without schema changes. |
| UX-3 | Inspection focus navigation / stage orchestration | Preserve route ids, section autosave ownership, 409/CAS, stale read protection; optional progressive rollout. |
| UX-4 | Evidence card and guided scoped upload/link | Preserve exact DocumentVersion ID, permission boundaries, idempotency and ambiguous write recovery. |
| UX-5 | Review / signer handoff / role-aware finalization presentation | Preserve canonical fresh reread, unlock invalidation, required roles and immutable snapshot. |
| UX-6 | Unit dossier context and Work “continue” surfaces | Preserve deep links, query context and return navigation. |
| UX-7 | Maintenance / Tenancy / Assets targeted redesign | No cross-domain ownership change; separate PRs per workflow. |
| UX-8 | Desktop/tablet/mobile UAT and final polish | Measured operator completion + full release regression; do not conflate code checks with hosted UAT. |

No branch should combine a redesign with a silent API/domain migration. If a single-action evidence transaction proves necessary beyond existing commands, propose and review its backend contract separately.

## 9. Acceptance rubric — proposed targets, not measured facts

Prior to broad UI rollout, collect a reproducible baseline with 3 role personas, 5 representative tasks, task duration, number of transitions, success without technical help and recovery after interruption. Record failures and time-on-task by device. Narrow UX-2A/UX-2B safety fixes were allowed before the full baseline; do not retroactively claim that baseline was measured.

Suggested design gates:
- All target tasks show a single **primary** next action and a readable current object and state; rare actions are secondary/Advanced.
- At least 90% unassisted first-attempt task completion in the defined UAT sample **as a target**, not a claimed current result. Report denominator and participant count; no invented percentage for the baseline.
- From a visible assigned Work item, open the correct Inspection in one direct navigation; deep link/refresh restores exact current Inspection and room identity.
- For successful evidence: operator can see it in the current section, can Open/Download if authorized, and cannot confuse a stored-only binary with attached evidence.
- No “Saved/Attached/Finalized” message without canonical proof. An ambiguous result remains explicitly unconfirmed and safe to recover.
- 320/375/768 px layouts: no *unintended page-level* horizontal scrolling, minimum practical 44x44 px touch targets for key field actions, keyboard focus visible, screen reader labels, and touch signature that survives expected gestures.
- Test explicit dirty/failed autosave, CAS collision, stale review, double-submit, lost acknowledgement, permission denial, finalization immutability, authorized binary and forbidden binary.
- Zero regression to domain invariants, API authorization, #126/#127 cross-assignment binary fence, canonical DocumentVersions, generated PDF signature artwork, URL identity and release gate.

## 10. Required UAT evidence and release separation

The [2026-11-18 risk register](../uat/risk-based-production-acceptance-2026-11-18.md) still marks broader cross-role/object authorization, full provider-loss recovery, two-session concurrency, adversarial sign/unlock and physical mobile workflows as incomplete. They proceed independently. UX PR acceptance never upgrades those release gates to PASS just because browser unit tests or a screenshot succeed.

Inspection-specific wireflow, UI state contract and desktop/tablet/mobile sketches: [inspection-wireflow-2026-11-18.md](inspection-wireflow-2026-11-18.md).
Additional static mobile/accessibility code audit and next runtime test contracts: [inspection-mobile-accessibility-audit-2026-11-18.md](inspection-mobile-accessibility-audit-2026-11-18.md).

