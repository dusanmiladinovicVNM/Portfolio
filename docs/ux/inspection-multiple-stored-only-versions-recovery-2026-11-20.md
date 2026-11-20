# Portfolio — P2: multiple verified stored-only Evidence uploads per room

Date: 2026-11-20 · Epic #124 · Base `main@4f3250df95912fdea6394d59cbf2b01288811b5a`.

## Proven failure

The field Evidence workflow has two independent states:

1. **Unconfirmed** binary request after both POST acknowledgements were lost: a prepared File + SHA fingerprint + UUID survives room remount using owner memory (issue #144).
2. **Verified stored-only** `DocumentVersion`: binary is canonically stored, but its Inspection Evidence *relation* is not yet created (PR #143).

Previously, only one `StoredOnlyEvidenceVersion` marker was retained per `InspectionId:SectionInstanceId`. Uploading A then B before linking A overwrote A's recovery selection in the mounted Inspection owner. The binary for A remained in server storage but could become inaccessible to a field Inspector through ordinary room-scoped recovery.

## Narrow correction

- Each canonical Inspection room now has an **ordered, in-memory collection** of verified `{documentId, versionId, fileName?}` identities instead of one marker. Deduplicate by exact version ID. No raw File bytes or global Document catalog are stored in this ledger.
- A verified scoped upload appends the exact identity, selects it for the existing version/attach controls, and never registers an Evidence relation implicitly.
- The room UI shows each pending entry separately. Clicking a queued entry selects its exact Document and Version, triggers the existing authorized versions GET, and verifies that the exact version exists before enabling relation attach.
- When the server acknowledges (or canonical reread proves) a linked Evidence relation, remove **only that exact version**, preserving all other pending versions in that room. Room switching does not clear the collection; switching Inspection/Unit resets it. A stale callback cannot write another Inspection's ledger.
- Retry-unknown **binary** requests remain handled by the separate issue #144 single-identity key+prepared-bytes guard. That protection still refuses starting another binary until the ambiguous request is resolved. Verified A and verified B may coexist without ambiguity.
- A relation POST continues to use the original CAS/write gate, canonical source rereread, owner check and expected exact `DocumentVersion`; no duplicate binary upload is required to attach a queued item.
- Existing access controls: Inspector cannot read arbitrary global Document catalog; room scoped version recovery uses only previously verified Inspection-owned uploaded identities and existing authenticated Document versions GET.

## Limits

- Memory-only queue survives room remounts within the open Inspection workspace, **not** page reload/device switch. A durable server-side stored-only inventory would require a separate reconciliation/auth design.
- The queue is a **presentation recovery index**, not a business relation. Finalized Report displays **only canonically attached** Evidence.
- This PR does not add camera batch upload, parallel upload, photo metadata edits or a new generic media library.
- Current queue length has no hard client quota; server limits bound each upload but accumulated entries should be monitored on long-lived operator sessions.
- Duplicate linking of an already attached exact version is not enabled by the queue. Canonical Evidence bundle remains the source of truth.

## Browser regression contract

1. Upload **photo A** and separately **photo B**, both different bytes and filenames, without attaching either; exactly two binary writes and two distinct version IDs.
2. Switch to Room B: neither A nor B is available there; return to Room A: both exact identities reappear, with no new binary POST.
3. Select **A** explicitly, wait for exact authorized DocumentVersion selection, attach through canonical relation. Queue now contains **only B**.
4. Select **B**, attach through existing canonical relation; queue disappears. Both captions occur under Room A, no binary duplication.
5. Existing stored-only single upload, double ambiguous upload, manager/Inspector permissions, lock/signature/finalization, finalized read-only originals and backup/restore regression still pass.

### Release guard
Only merge the reviewed head after full GitHub Actions CI success. Separate hosted real-device/role UAT and monitoring incident #139 remain open.
