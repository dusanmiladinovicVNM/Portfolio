# Portfolio — UX-4A: stored-only Evidence recovery across rooms

Date: 2026-11-19 · Epic: #124 · Base: `main@c73fd372260f4178abf2992356fd3d4376a1d674`

## Observed failure mode

`InspectionFindingsEvidence` is keyed by `InspectionId:SectionInstanceId` and remounts when the exact room changes. A successfully uploaded binary may have an acknowledged, immutable `DocumentVersion`, yet have **no canonical Inspection Evidence relation**. Before UX-4A its `selectedDocumentId` and `selectedVersionId` were kept only within the room component. Going Room A → Room B → Room A lost the convenient exact-version recovery route. The binary was not deleted, but an operator could be tempted to upload a duplicate or attach a different version.

The existing UX-3B.2 Evidence → Inspect → Evidence test switched **phases in the same room**, so it did not cover this remount path.

## Scoped fix

- `UnitInspections` now retains only the **verified binary identity** `{documentId, versionId}` above the room-keyed child, indexed by exact `InspectionId:SectionInstanceId`.
- The saved selection is initialized when that same room's Evidence component remounts. The component reloads the current canonical Document and version catalog and displays the exact verified version before enabling the normal attach operation.
- If the cached exact version is missing from the canonical version catalog, do **not** silently fall back to a different/latest version. Present an error and leave the attach disabled.
- A fresh, server-verified scoped upload or advanced DocumentVersion upload records this in-page recovery identity. After a **canonically proven** attach, or a recovered attach after ambiguous acknowledgement, the matching stored-only marker is removed. Never clear a marker solely because a POST was attempted.
- Changing room must **not** expose Room A's stored-only identity in Room B. The cache clears on Inspection/Unit change and is never persisted to browser storage or to a second business table.
- No link creation, binary upload, reviewer acceptance or lifecycle status is inferred from this local cache. The canonical Evidence relation still requires the existing attach API and ownership checks.
- The field-level `SectionInstance` route remains canonical. Evidence and Finalization remain mounted across phase switches, as in UX-3B.2.

## Negative scope

This does **not** yet deliver the all-room Evidence overview, thumbnail previews or direct camera workflow of UX-4. It is also not a substitute for server-backed orphaned-upload discovery across browser reloads or devices.

The recovery cache is deliberately **session-local to the mounted Inspection workspace**; closing/reloading the tab may discard it. Users can still use the server Document catalog recovery path where allowed. An ambiguous upload with **no verified DocumentVersion** has different semantics: the stable retry key currently lives in the room component and should get its own explicit adversarial test before making cross-room navigation claims in UX-4B. Free-form unsent caption/kind/item values are not persisted by this patch and must be re-entered on returning to a room.

## Required regression

1. Successfully upload scoped Evidence in Room A, recovering the ambiguous first binary acknowledgement with the same idempotency key.
2. Before linking, capture the exact Document and DocumentVersion IDs, change to Room B and verify no Room A staged selection/attach is offered.
3. Return to Room A and verify the exact IDs are reselected from the current canonical catalog.
4. Attach without a second binary POST. Verify the canonical Room A Evidence relation and that the local stored-only recovery marker disappears.
5. Preserve the existing CAS 409, Save & Continue, stale Review, signature, finalization, PDF and backup/restore gates.

## Release gate

- Full typecheck, unit, browser release gate and backup/restore CI must pass.
- No backend, storage schema, authorization change or new business relation is permitted.
- Real touch/screen-reader hosted UAT and server-driven orphaned-upload recovery remain separate acceptance checks.
