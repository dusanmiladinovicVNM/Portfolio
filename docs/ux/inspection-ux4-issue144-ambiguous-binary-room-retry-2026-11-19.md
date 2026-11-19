# Portfolio — UX-4 / issue #144: ambiguous binary retry across room transitions

Date: 2026-11-19 · Base: `main@7a9c33d1fb80a58838aab48ef8323292595c4f02` · Epic #124

## Problem verified

The Inspection-scoped binary upload sends a freshly prepared File using a UUID idempotency key. If **both** the original request and its automatic same-key retry lose their acknowledgements, `InspectionFindingsEvidence` keeps `scopedUploadRef` for a subsequent safe retry. Before this change, changing the SectionInstance remounted the room-keyed Evidence component, losing its exact key, fingerprint and prepared File. A fresh attempt could allocate a new UUID for the same photograph. This is separate from PR #143's **verified stored-only version** recovery.

## Decision: retain the existing scoped idempotent identity in owner memory

- Keep `StableUpload {key, purpose, fingerprint, file, photoPreparation}` in the Inspection workspace **only after an unresolved ambiguous failure**, indexed by exact `InspectionId:SectionInstanceId`. A transient write in flight is already protected by the canonical write gate; verified success clears the retry object. The prepared File stays in **memory**, never in localStorage, server logs or general Document metadata.
- When the operator selects Room B and later returns to Room A, its newly mounted Evidence editor receives the exact same key, original-file fingerprint and prepared bytes. It does not automatically resend a POST merely because the room was reopened.
- The operator explicitly reselects the **same original file and kind** and submits the normal upload form. The app compares the original SHA-256-based fingerprint and refuses any different file without creating a new key or POST. Matching input reuses the already prepared bytes and original UUID. After the server verifies and acknowledges that same immutable DocumentVersion identity, normal stored-only recovery (PR #143) is used for attachment.
- While unresolved, the app refuses a new Evidence Document, an advanced binary upload or an Evidence relation attach from the same editor. It does not prevent leaving the room, so the operator can continue other rooms and return. The recovery notice explains the exact same-file retry and limitations on closing/reloading the workspace.
- A verified success removes the retained File object; a nonambiguous failure clears it as well. The per-Inspection map clears on Inspection or Unit change. A stale callback cannot write a different Inspection's key.
- This local context is not a new Inspection Evidence relation. Server authorization, idempotency comparison, CAS, exact DocumentVersion, canonical Review/Sign/Finalize and PDF remain unchanged.

## Deliberate limits

- Refreshing/closing a browser tab or switching devices discards this memory-only recovery state. Server-backed discovery or operator-driven reconciliation would be a **separate contract**; do not claim that a still-unverified binary survives browser restart.
- The original file must still be available to reselect; a different file or metadata is never silently substituted. Leaving the entire Inspection workspace is possible but abandons the local safe retry context.
- Memory retained per unresolved upload is bounded by the existing prepared-photo and binary-upload limits, though the number of concurrently unresolved rooms has no explicit quota yet. Avoid using long-lived browser persistence to solve this without a security/memory design.
- This PR does not implement UX-4B's all-room Evidence overview or UX-4C image preview.
- Issue #139 scheduled monitoring coverage and UX-5 role-aware finalization remain independent.

## Adversarial browser test

1. In Room A, trigger two simulated lost acknowledgements (initial commit + identical-key retry). Server creates **one** version.
2. Verify ambiguous outcome and the recovery notice.
3. Navigate Room B: it must not inherit Room A's unresolved binary or allow an attach.
4. Return to A: the notice reappears; **no automatic POST** occurs.
5. Attempt a different file: reject before POST, keep the old key.
6. Re-select the exact original file: same SHA-based fingerprint, same prepared bytes and same idempotency UUID; server returns the already-stored version, **zero additional uploads**.
7. Attach via canonical Inspection relation, confirm exact evidence and no second binary.
8. Existing Save & Continue, stale Review, CAS, locked signatures, PDF and backup/restore gates still pass.

**Release gate:** full CI green on exact reviewed PR head and unchanged canonical owner/backend logic; separate hosted mobile and screen-reader UAT remains open.
