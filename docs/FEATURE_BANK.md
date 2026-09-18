# HandoverApp feature bank

The existing HandoverApp is read-only architectural input for this project.

## Reuse the requirement/lesson

| Existing capability | Portfolio decision |
|---|---|
| Schema-driven inspection forms | Keep concept; redesign against new domain |
| Section autosave | Keep UX requirement; save one section atomically |
| Revision conflict detection | Keep concurrency requirement at **section** grain, not whole Inspection |
| Photos per item/section | Keep requirement; storage abstracted |
| Signatures | Keep requirement; redesign evidence model |
| Final PDF | Keep output requirement |
| Final JSON snapshot | Keep immutable-snapshot concept |
| Inspector assignment | Keep explicit `assignedToUserId`; never infer ownership from `createdBy` |
| Offline/local inspection cache | Keep field-use requirement; cached payload may render optimistically but never authorizes a write |
| Tenant access links | Re-evaluate against new auth/contract model |
| Audit trail | Split security audit from domain timeline |

## Do not inherit

- Google Sheets as canonical data store
- Apps Script routing architecture
- ScriptLock concurrency model
- current inspection-centric master model
- duplicated landlord/tenant strings inside inspection master data
- custom password/session implementation
- legacy API action names
- legacy Drive folder naming as domain identity
- legacy sequential IDs as primary keys

## Review method

When a Portfolio feature reaches a capability that existed in HandoverApp:

1. inspect the old feature and its production lessons;
2. extract the actual user/business requirement;
3. identify old failure modes;
4. design the feature against the Portfolio domain model;
5. implement it without copying legacy architectural coupling.

## PR #11 extracted lessons

The HandoverApp inspection implementation was inspected before designing the Portfolio backbone.

Useful production lessons carried forward:

- schema version is captured at Inspection creation and must never float to "latest";
- the office creator and the field inspector are different concepts;
- optimistic concurrency belongs to the section being autosaved, not to the whole report;
- server-side lock/finalization validation must re-read authoritative responses rather than trust cached UI state;
- cached inspection data is useful for fast field rendering but never decides write validity;
- conditional visibility/required rules are part of the schema contract;
- unknown item IDs should be rejected in Portfolio rather than silently ignored;
- Drive folder IDs, copied property/tenant strings, custom tenant tokens and Sheets rows are legacy implementation details, not new domain identity.

Deferred deliberately to PR #13:

- photo/document evidence per item/section;
- signatures and signer roles;
- controlled unlock with signature invalidation;
- immutable final snapshot;
- generated PDF/report boundary.
