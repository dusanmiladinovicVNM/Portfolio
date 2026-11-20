# Portfolio — P2: finalized Report retains authorized original Evidence access

Date: 2026-11-20 · Epic #124 · Base `main@4e2c21e87f4241328774a224a2690541c81ae9dd`.

## Confirmed gap

UX-4B/4C added all-room canonical Evidence listing and exact DocumentVersion on-demand preview/download in the **Evidence** task phase, but `inspectionWorkflowStageAvailable('finalized', 'evidence')` correctly returns false. UX-3B explicitly exposes only **Report** after finalization. The existing `InspectionCompletedOverview` showed per-room Evidence *counts* but not the original files. This P2 prevented direct access to original field photographs through finalized Inspection UI.

## Fix without lifecycle regression

- Leave the five-phase navigation and its lifecycle whitelist **unchanged**. After finalization only `report` is available; `evidence` must **not** become a second writable stage.
- Render the **same** owner-validated `InspectionEvidenceOverview` inside Report, next to `InspectionCompletedOverview` and final PDF. The Report version passes `readOnly`, renders every canonical linked room/Inspection-level Evidence relation (excluding the final_report relation), and removes all room edit/navigation controls.
- Keep exact `documentVersionId` from the canonical bundle. Reading original bytes is always a **separate on-click authenticated** `GET /document-versions/:id/content`; Inspector document access is constrained by the existing server's Inspection ownership policy.
- Reuse the safe raster MIME allowlist, inline Blob URL cleanup, 403 error/retry, focus restore, responsive layout and no eager binary prefetch implemented and tested in UX-4C.
- The finalized Evidence overview exposes **no upload**, no attach, no section edits, no Report/Inspection mutation, and no ability to create a new DocumentVersion. The immutable final snapshot and generated report remain the authoritative completion record; the overview is a way to inspect existing canonical Evidence records, not to edit the snapshot.
- This does **not** invent a new read-only `evidence` task phase, new route, storage URL, public thumbnail endpoint, or duplicate document component.

## Acceptance criteria

1. After existing lock → Sign → Finalize flow, the Report stage contains canonical room and Inspection-level Evidence with exact captions, while all editable field/Evidence workspaces remain absent.
2. Finalized Evidence task button remains disabled; Room edit/route buttons are absent from Report.
3. Opening a finalized original triggers **one** authenticated exact-version GET only upon click. Simulated 403 renders an alert, never a photo. Explicit retry performs one new GET, then displays image and download action.
4. Closing the preview restores keyboard focus and revokes its Blob URL. No background reads on opening Report; no write/POST on view or download; canonical URL unchanged.
5. Existing final-report idempotency, immutable snapshot, CAS, multi-room Evidence upload/recovery, signature invalidation and backup/restore gates remain green.
6. Separate real-role/hosted UAT is still required before general production acceptance.

## Independent remaining P2

Multi-upload stored-only recovery is **not** addressed here. The parent currently holds one `StoredOnlyEvidenceVersion` per `InspectionId:SectionInstanceId`; test `Upload A → Upload B → room switch → return → attach both` in a separate PR, without changing immutable Report or duplicating binary uploads.
