# Portfolio — UX-3B.2 Inspection task-stage isolation

Date: 2026-11-19  
Epic: #124  
Base: PR #140 merged at `e81418a88b773c2caef3d687b65eb58577b53a75`.

## Goal

Replace the all-at-once Inspection editor with one **visible task surface** at a time, without making a second lifecycle, remounting recoverable nested forms, or changing canonical `inspectionId` / `sectionInstanceId` deep links.

This slice is deliberately **not** the full UX-4 consolidated Evidence overview, not UX-5 role-capability presentation, and not a product-wide de-CH translation.

## Stage surfaces

| Presentation phase | Rendered surface | Source of authority |
| --- | --- | --- |
| Setup | Draft start callout; existing draft orchestration remains available above editor | `draft` status + server `start` |
| Inspect | Canonical required progress, room navigation and one SectionInstance answer form | SectionInstance PATCH expectedRevision / CAS |
| Evidence | Existing contextual Findings and Evidence for the selected room; room selection remains under Inspect | Exact Inspection, SectionInstance and DocumentVersion |
| Review & Sign | Existing canonical reread, pre-lock review, signatures and controlled unlock/finalize controls depending on status | Canonical lifecycle and server authorization |
| Report | Existing completed overview and immutable snapshot report actions | Canonical final snapshot / DocumentVersion |
| Cancelled | Preserved read-only multi-section view and cancelled lifecycle notice, no invented phase | Canonical cancelled status |

A phase switch uses the **same mounted React subtree** for Field, Evidence and Finalization/Review. Inactive surfaces receive native `hidden` and explicit CSS `display:none!important`, excluding them from keyboard/pointer/accessibility-tree navigation. The `inspection-layout` continues to own current room identity while Evidence expands to full width when visible.

No API command is invoked when changing a presentation phase. The server remains the only authoritative writer. The existing CAS conflict, dirty route blocker, Save & Continue and ambiguous write recovery are unchanged. Phase switching remains disabled when dirty or write/reconciliation is pending.

## Focus and route

UX-3B.1 synchronously focused an already-visible heading. Once phases are hidden, that would fail. UX-3B.2 records the explicit focus intention, updates active stage and focuses the heading **in a post-commit React effect**, only if the exact selected Inspection and stage still match. This is not an autofocus effect on every canonical bundle reload. Room links still use the exact existing URL and their established heading-focus flow. Stage selection remains ephemeral and scoped to Inspection and room.

The Evidence stage is explicitly labelled *active room only*. Selecting other rooms requires returning to Inspect and choosing another canonical SectionInstance. Do not imply that a per-room form is an all-rooms Evidence overview; full consolidation belongs in UX-4.

## Non-obvious state risks, addressed

- Do **not** conditionally mount `InspectionFindingsEvidence` as the phase changes: staged exact uploaded-version IDs must survive a visit to Inspect. Its existing key changes only when the exact Inspection/SectionInstance changes, as before.
- Do **not** conditionally mount `InspectionFinalizationPanel` between Review/Sign and Report: keeping it in one stable wrapper preserves pending action/recovery state through canonical lifecycle responses. Finalization itself still ends active field work.
- Preserve the fresh server Review reread. Switching Inspect/Review while newer field content is saved must produce a stale Review indication, never autoauthorise an old lock.
- While Review GET is held, switching back to Inspect and editing must still invalidate the old response; a stale response must not overwrite canonical state.
- `hidden` must be forced against author `display:grid` CSS. No visual-only hiding that leaves inactive controls keyboard-focusable.
- No new actor role checks in React; UX-5 must hide forbidden Unlock/Finalize actions using verified capabilities rather than weakening server policy.

## QA acceptance

- Typecheck + unit tests, including five-phase lifecycle availability.
- Browser checks for visible phase isolation, stage target focus, owner-safe deep link, 320/375/390/768 viewport.
- Original lifecycle browser tests adapted to operator actions through visible stage buttons.
- Exact uploaded Evidence DocumentVersion persists through Evidence→Inspect→Evidence, without a second upload.
- Fresh Review survives selection but is invalidated after canonical field edit; CAS 409 and ambiguous response retry remain guarded.
- Lock/signature registration, invalidated signatures after unlock, immutable final snapshot, report resolve and backup/restore rehearsal all pass.
- Separate real-phone, actual touch and assistive technology UAT remains outstanding; CI cannot substitute it.

**Merge gate:** green full CI + review for accidental remount, stale hidden user actions, role leakage or lost identity. Release/deploy verification is separate.
