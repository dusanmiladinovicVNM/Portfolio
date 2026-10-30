# Portfolio — hosted manual UAT acceptance baseline

**As of:** 2026-10-30  
**Environment:** Vercel Production Web `https://portfolio-iota-wine-47.vercel.app`; Supabase project `fiowxgamyjjcondlheqg`; canonical PostgreSQL; Google Drive-backed DocumentVersions.  
**Data:** dedicated demo / UAT records. No real tenants or legal records are used as proof in this document.

## Scope, evidence standard, and caveats

This is a **manual UAT register**, not a claim that all Portfolio requirements or every role / concurrency / operational recovery path passed in production.

Evidence levels:
- **UI PASS** — operator performed a step and confirmed behavior with a screenshot or an explicit acknowledgement.
- **DB VERIFIED** — the assistant independently performed **read-only** queries of production PostgreSQL after the operator's UI write and checked canonical identity/state/counts.
- **CODE/CI ONLY** — repository tests or release rehearsals provide evidence, but no matching hosted manual UAT is claimed.
- **OPEN / BLOCKED** — a remaining requirement, negative test, or defect. Do not include it in the PASS count.

Production data was not altered directly through SQL as part of these manual checks. A `go` response confirms an operator action, not an automated proof of every rendered field. Screenshot and SQL evidence were inspected in the UAT conversation; this register does **not** claim that screenshot originals or query transcripts were uploaded as GitHub artifacts.

## Business workflow UAT matrix

| Area | Manual acceptance evidence | Result | Important coverage limitations |
| --- | --- | --- | --- |
| Public hosting / authentication / deep route | Public web sign-in, unit dossier, inspection deep link and refresh; see [public web smoke](../runbooks/public-web-production-smoke-2026-09-24.md). | UI PASS / previous documented smoke | Does not substitute for multi-role security tests. |
| Property / Unit / Space | Hosted navigation, identity and exact Unit/Space ownership in later module tests. | UI PASS for tested paths | Full create/edit/delete matrix not covered by this dated record. |
| Party / Tenancy / Lease | Lease lifecycle, amendments and renewal; temporal `asOf` and signed agreement PDF/Document links were exercised in earlier UAT. | UI PASS for tested paths | Complex role/temporal permutations remain open. |
| Documents / Google Drive | Authenticated storage, versioned PDFs, Open/Download, immutability on final versions. | UI PASS, selected DB VERIFIED | Secondary backup and recovery to a replacement storage provider not proven here. |
| Assets, warranties and service | Asset/service surfaces and service event records exercised. | UI PASS for selected paths | Wider warranty-claim/asset replacement and edge cases remain open. |
| Maintenance | Unit maintenance issue, WorkOrder assignment, execution, ServiceEvent linkage, completion and issue resolution. Selection of a wrong-owner WorkOrder is rejected by UI. | UI PASS, selected DB VERIFIED | UI owner guard is **not** equivalent to hostile cross-tenant API authorization proof. |
| Operational work | Today / Overdue ServicePlans, Property-vs-Unit routing, Issue/WorkOrder owner rejection and recovery. | UI PASS for UAT-01..11 | Authorization, concurrency and comprehensive date boundaries remain open. |
| Keys & access | Key return, reissue and custody workflow exercised. | UI PASS | Loss / replacement / retirement boundary variants remain open. |
| Meters | Electricity reading and 12 kWh delta checked; data-entry error handling and tenancy boundaries investigated. | UI PASS for tested readings | Correction of a wrong historic reading and broader billing integrity are not closed. |
| Unit Timeline | Cross-module chronology, page 1/next-page, ordering and pagination (>50 records). | UI PASS | Exhaustive proof that every domain event is projected remains open. |
| Inspections | **See full canonical reproduction below**. Schema, conditions, section CAS autosave, findings, Evidence, binary read, signatures, lock, finalization and immutable snapshot. | UI PASS / DB VERIFIED | PDF artwork defect #119; broader multi-role and controlled-unlock adversarial UAT pending. |
| Reporting / Dashboard | Hosted dashboard reads and selected historical `asOf` views. | UI PASS for tested paths | Comprehensive financial aggregates and all historical cutoffs remain open. |

## Reproducible Inspection baseline — 2026-10-30

Unit `ZH-BIR123-301` / `dc55b65c-d468-4636-b25e-ec8afb96de6c`, Property `ZH-BIR-123`.

Inspection:
- Code: `UAT-INSP-RICH-301-001`
- UUID: `de781025-5f7c-443a-b7ae-acd0a9fac196`
- Type: `periodic`
- Published schema `UAT-INSP-RICH`, version 1
- Final state: `finalized`, lifecycle version **5**, content revision **9**
- Final snapshot: exactly one, version **1**, source lifecycle version **4**, source content revision **9**
- Frozen snapshot payload: **4 SectionInstances, 6 responses, 1 Finding, 1 photo Evidence, 1 active Agent signature**, 0 unlocks
- Four sections: General; Open Office; IT / Technical Room; Meeting Room. Two room descriptions become visible and required when rating is `minor_defect` or `major_defect`.
- Room ratings: Office `good`; IT `minor_defect`; Meeting `major_defect`; **6/6 effective required** in canonical review.

| UAT checkpoint | Observed outcome | Evidence |
| --- | --- | --- |
| Schema draft, conditional rules and publish | Four SectionInstances instantiated; repeated room scope attached to distinct Space identities. | UI PASS / DB VERIFIED |
| Start, autosave and section revisions | Six saved responses; content revisions advanced independently of lifecycle. | UI PASS / DB VERIFIED |
| Finding | Exactly one Major finding, `Ceiling water damage near ventilation outlet`, attached to Meeting's exact section instance/item. | UI PASS / DB VERIFIED |
| Photo binary upload | Google OAuth configuration was repaired after HTTP 500s; exact `image/png` DocumentVersion v1 stored on Google Drive. | UI PASS / DB VERIFIED after recovery |
| Evidence relation | Exactly one Meeting-specific photo relation to the exact stored DocumentVersion; `IT / Technical Room` correctly displayed **0 findings and 0 evidence** despite another section having a photo. | UI PASS / DB VERIFIED |
| Binary retrieval | Operator opened and downloaded the stored PNG from Advanced Document workflow. | UI PASS |
| Canonical review and lock | 6/6 effective required responses; status `locked`, lifecycle 4; content revision 8. | UI PASS / DB VERIFIED |
| Drawn Agent signature | PNG signature DocumentVersion `final`, active signer `Portfolio UAT Test Agent`; content revision 9. | UI PASS / DB VERIFIED |
| Finalization | Status `finalized`, lifecycle 5, immutable snapshot v1 with all expected content. | UI PASS / DB VERIFIED |
| Final PDF | `inspection-UAT-INSP-RICH-301-001-final.pdf`, final v1 in Drive, 10,338 bytes; PDF readable; contains all textual responses, finding and evidence reference. | UI PASS / DB VERIFIED |
| **Graphical signature** | PDF lists Agent name/time and signature PNG filename, but **does not embed drawn artwork**. | **FAIL / #119** |
| Hard reload and final report re-read | Final state and snapshot unchanged; existing report loaded without creating another snapshot, DocumentVersion or revision. | UI PASS / DB VERIFIED |

### Related defects and operational incidents

1. **P2 release blocker** — [#119](https://github.com/dusanmiladinovicVNM/Portfolio/issues/119): signature artwork missing from final Inspection PDF. Implementation draft [PR #121](https://github.com/dusanmiladinovicVNM/Portfolio/pull/121); no merge or production visual UAT claimed at creation of this baseline. Existing immutable finalized PDFs **must not** be rewritten. Re-test with a **new** demo Inspection.
2. **P3 PDF presentation backlog** — select values `minor_defect` / `major_defect` shown as internal codes instead of human-readable frozen option labels; unsupported Unicode `·` becomes `?`; section heading may be orphaned at page bottom. Target one separate PDF polish PR after #121.
3. **UX / navigation** — an Evidence card displays filename/metadata but lacks direct Open/Download; user must expand Advanced Document version management. Address during Inspection UX redesign, not via an ad-hoc interim patch.
4. **Google OAuth** — External/Testing OAuth credentials can expire after seven days; a production binary upload failed with 500 while the client secret/refresh token configuration was repaired; subsequent upload/download passed. Production-grade Google OAuth credential lifecycle remains an operational release gate.
5. **Observability incident** — [#120](https://github.com/dusanmiladinovicVNM/Portfolio/issues/120) captured aggregate 5xx errors around the failed Drive upload. Verify alert closure after healthy monitoring, independently from PDF changes.

## Remaining risk-based acceptance gates

| Priority | Hosted proof still required | Proposed acceptance |
| --- | --- | --- |
| P0 | Production PostgreSQL backup + restore / full project-loss recovery | Verify last successful encrypted backup, restore to disposable target, exact row/count/hash and supported app continuation. Never destroy production. |
| P0 | Off-provider Google Drive binary backup + restore | Validate accepted encrypted backup of exact canonical DocumentVersion set and binary read from recovered storage. |
| P0 | API authorization across admin/manager/inspector and unrelated properties | Direct authenticated API negative tests (not only disabled UI controls). No cross-tenant/object read or mutation. |
| P1 | Concurrency/CAS and lost-response recovery | Two independent sessions, conflicting writes, retained drafts, idempotent retries and clear recovery UX. |
| P1 | Inspection negative lifecycle and multiple signatures | Controlled unlock/signature invalidation/re-lock, stale review, rejected edits after finalization, 2+ signatures, invalid media and corrupted storage. |
| P1 | Inspection → Maintenance → Service full cross-module ownership | Exact originating Finding/Issue/WorkOrder/ServiceEvent references and permissions. |
| P1 | Dashboard/time-travel/reporting arithmetic | Historical `asOf` boundaries, money totals, unit/tenancy state and cross-module reconciliation. |
| P1 | Mobile/tablet field usage | Touch signature, photo capture/upload, responsive layouts, focus/errors/dirty navigation and constrained network. |
| P1 | Production monitoring and OAuth lifecycle | `/health/ready`, active issue/alert resolution and long-lived Google OAuth publishing/credential-rotation policy. |
| P2 | UX acceptance after redesign | End-to-end operator tasks completed without navigating technical DocumentVersion/SectionInstance internals. |

## Release gate boundaries

Automated CI and `pnpm release:rehearse` complement hosted UAT; neither independently proves all provider configuration, production policy or visual PDF correctness. See [MVP release gate](../runbooks/mvp-release-gate.md), [production backup and restore](../runbooks/production-backup-restore.md), and [binary backup and recovery](../runbooks/production-binary-backup-restore.md).

**Current acceptance statement:** Core online business workflows are usable in the tested demo dataset, and the comprehensive Inspection end-to-end journey is verified through immutable finalization. The hosted product is **not fully release-approved**: visible signed PDF output (#119), recovery evidence, direct role-boundary testing and remaining risk-based UAT must be resolved. UI/UX redesign can begin after stabilizing #119 and should not be deferred until all remaining negative scenarios pass.
