# Portfolio — UX-4B canonical all-room Evidence overview

Date: 2026-11-19 · Epic #124 · Base: `main@6c8020e1e3fd4bdf73d393a71b967d30e814c46b`

## Why

UX-3B.2 isolated Evidence into a task phase but retained a contextual editor for **one SectionInstance**. The Inspection operator cannot review all already linked photographs and documents across rooms without repeatedly switching room URLs. UX-4B adds a central, read-only view of the **existing owner-validated canonical Inspection Evidence relations**, without inventing a new library, cache or binary-access endpoint.

## Data/authority and composition

- Source is only `routeBundle.evidence` already returned by the typed Inspection bundle, after `assertInspectionBundleOwner`. No global Documents list, Version catalog or binary GET is introduced by the central overview.
- Include **every SectionInstance**, including those with 0 linked Evidence, using canonical room names and schema sections. Show an Inspection-level group for relations with `sectionInstanceId===null`.
- Exclude `kind==='final_report'` from operator field Evidence counts. Final report belongs in Report/immutable snapshot rather than per-room photos.
- Distinguish **canonically linked** Evidence from uploaded-but-unlinked bytes; UX-4A/issue #144 recovery remains in the exact room editor. Do not count staged or ambiguous upload state as a canonical Evidence relation.
- Display kind, caption and optional item label, but not storage IDs. Image preview and Open/Download (UX-4C) require a separate, authorized exact-version binary-access design; do not reconstruct URLs or expose a generic Document ID as a deep link.
- If an Evidence relation references a SectionInstance absent from the current canonical bundle, render an ownership integrity warning rather than silently attributing it to another room.

## Navigation

- A `Zum Raum und Nachweisen` button selects the **exact** canonical SectionInstance (not the schema-level Section) through the existing typed `unitRoute` and stays in Evidence presentation phase.
- Stage selection remains ephemeral and tied to `InspectionId + SectionInstanceId + lifecycle version + lifecycle status`; the URL retains canonical `inspectionId`, `sectionInstanceId` and `asOf`. No Evidence view status is persisted.
- Navigation is disabled while section edits are dirty, a save/attach is in flight, CAS conflict or ambiguous save recovery is outstanding, using the existing `stageNavigationBlocked` gate. Current room selection simply focuses its already-mounted Evidence heading.
- Suppress the old hidden Inspect-room-heading focus effect when navigating rooms inside Evidence; focus instead follows the newly visible Evidence target. Regular room navigation under Inspect continues its existing focus contract.
- The underlying room-scoped Findings+Evidence component remains keyed by exact room and retains the UX-4A/issue #144 recovery semantics across remount. The overview never writes a binary or Inspection relation.

## Acceptance

- [ ] New all-room groups are sourced solely from canonical bundle, including Inspection-level and Room A/Room B evidence; no cross-room mislabeling.
- [ ] The contextual editor does not present another room's Evidence as its own, even though the overview can display that Evidence.
- [ ] Buttons navigate between room contexts without leaving Evidence, exact URL preserved, focus goes to visible heading; no unexpected upload/attach POST.
- [ ] 320/375/390/768 px card width and touch targets stay inside viewport without page-wide horizontal overflow.
- [ ] Full existing browser test suite including double-ambiguous upload, CAS, fresh Review, signatures, immutable PDF and backup/restore passes.
- [ ] No database, backend, authorization or domain status changes.
- [ ] Independent hosted touch/VoiceOver/TalkBack UAT, signed binary access and image preview remain later acceptance work.

**Explicit UX-4C boundary:** This is the **central linked-Evidence index**, not yet an inline photo gallery. A user cannot open or download binary directly from a new overview card until a separately reviewed authorized version-read flow is implemented.
