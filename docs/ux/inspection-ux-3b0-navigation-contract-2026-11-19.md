# Portfolio — UX-3B.0 / UX-3B.1 task-phase ownership and navigation contract

**Date:** 2026-11-19  
**Epic:** #124 · **Baseline:** `main` at `17715745e694803c9aa794ccffb82df48d64a1a2`  
**Status:** Runtime first slice; full five-stage task isolation, Evidence overview and de-CH translation remain separate work.

## Confirmed source composition

- `UnitDossier` owns the canonical Property/Unit context, while `workspace-route.ts` owns `inspectionId` and optional `sectionInstanceId` in the existing Unit URL.
- `UnitInspections` owns the exact selected SectionInstance draft, autosave, section expectedRevision, merged canonical responses and Save & Continue intent. Its existing navigation blocker is not bypassed.
- `InspectionFindingsEvidence` owns scoped Evidence upload/link and pending/ambiguous write recovery. It currently displays the **active room's Evidence**, not a consolidated full-Inspection Evidence overview.
- `InspectionFinalizationPanel` owns fresh pre-lock canonical reread, Lock, signature registration, Unlock, Finalize and final report resolution. Its local pending/recovery state must not be unmounted during basic phase selection.
- `InspectionWorkflowStepper` was a noninteractive projection `Setup → Inspect → Review → Sign → Complete`; `in_progress + complete required answers` automatically marked Review current. Required answer completeness alone does **not** prove all Evidence checked or consent to lock.
- In the locked state, the existing finalization UI still renders Unlock and Finalize regardless of actor presentation role; the server enforces capabilities. This is a **role-UX debt**, not evidence of server bypass. Role-aware presentation is a separate reviewed follow-up (UX-5), not a new React-only authorization rule in this PR.

## Scope approved for UX-3B.1

Exactly five **presentation** phases: `setup`, `inspect`, `evidence`, `review_sign`, `report`. The visual labels follow the owner-approved German UX direction; the rest of the app is **not yet localized**.

| Canonical lifecycle | Default selected phase | Navigable focus targets |
| --- | --- | --- |
| draft | setup | Setup heading |
| in_progress | inspect | Room heading, contextual Evidence heading, existing fresh Review heading |
| locked | review_sign | Existing signature/manager handoff heading |
| finalized | report | Existing final report heading |
| cancelled | none | Cancelled status only |

**Selecting a phase is navigation, not a save, lock, signature, completed milestone, lifecycle change or authorization grant.**

The user's in-page stage selection is *ephemeral*. It is keyed to the exact Inspection ID and constrained by the latest canonical status. If a different Inspection is opened, or the status changes so that the selected phase is not available, the UI derives the safe default from the new current lifecycle. Hard refresh still restores the canonical Inspection and room from the existing deep link; the ephemeral stage choice is not promised to survive refresh. Do not create a new URL field without a separate reviewed routing contract.

No change to domain enums, PostgreSQL, application commands, HTTP routes, signature role policy, schemas, the canonical reporting `asOf` or the SectionInstance URL.

## Safety implementation boundary

1. Phase buttons target **already mounted** headings and change focus/scroll only. In UX-3B.1, the other room/Evidence/Review components remain mounted. Do not accidentally destroy in-memory exact uploaded DocumentVersion IDs, pending operations, signature state or review snapshots.
2. When a section is dirty, any section write is pending, a Save & Continue intent is active, or conflict/save error awaits recovery, navigation *away from the currently selected phase* is blocked. Section PATCH and the existing route navigation blocker remain authoritative for route changes.
3. Phase availability is a UX boundary, **not** a role/capability check. The server owns permission enforcement; future role-aware action presentation must be driven by verified actor capabilities.
4. Before lock, the canonical fresh Review and expected versions still govern; a chosen `review_sign` UI phase grants no right to lock. After lock, signatures retain their role/Party requirements; finalization and PDF generation remain separate commands.
5. Stepper labels earlier phases `previous`, **never `complete`**, because crossing their presentation position does not prove task completion. Never emit a checkmark based on position.
6. The compact breadcrumb uses existing owner-safe Property and Unit routes. Business Property display name is not available in `UnitInspections`; do not invent it. Unit number/code and Inspection code come from the canonical owner-verified data.

## Explicit limitations and next slices

- UX-3B.1 is **not yet** a single-active-stage UI. It supplies meaningful focus navigation into mounted task surfaces, then UX-3B.2 isolates displayed tasks once local recovery ownership is proved.
- The Evidence button currently points to the active room's existing Findings/Evidence heading, **not** a consolidated all-rooms review. The latter belongs in UX-4, with exact DocumentVersion scope, secure binary access and canonical attach proof.
- The Review & Sign phase intentionally contains multiple legal lifecycle substeps; it is not one atomic action.
- The Report phase is only available after canonical finalization, never from a chosen UI phase.
- Product-wide de-CH copy extraction, mobile assistive-technology UAT, role-aware Unlock/Finalize hiding and complete per-stage layout are not claimed in this PR.

## Acceptance checklist

- [ ] Unit tests: exact five labels/order, lifecycle default, availability and stale-selection fallback, no false completion.
- [ ] Browser: draft Setup-only; `in_progress` Inspect/Evidence/Review navigation moves focus to mounted heading; exact Unit/Inspection/SectionInstance URL remains unchanged; no React unmount.
- [ ] Browser: dirty/pending section prevents changing phase; existing Save & Continue and CAS 409/ambiguous-ack tests retain behavior.
- [ ] Responsive: 320/375/390/768 CSS px phase bar stays locally scrollable; no unexpected page overflow or loss of keyboard focus.
- [ ] Full CI: existing lifecycle/ownership/Evidence/signatures/report/backup/recovery gates.
- [ ] Real phone touch, screen readers and operator task completion: independent UAT (not proved by code or headless browser).

**Merge rule:** only after full CI, independent code review and explicit confirmation that no source-of-truth or actor authorization was moved into phase selection. Any new production UI is subject to normal post-merge release and hosted UAT, which are separate evidence.
