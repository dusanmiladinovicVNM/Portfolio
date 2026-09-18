# HandoverApp feature bank

The existing HandoverApp is read-only architectural input for this project.

## Reuse the requirement/lesson

| Existing capability | Portfolio decision |
|---|---|
| Schema-driven inspection forms | Keep concept; redesign against new domain |
| Section autosave | Keep UX requirement |
| Revision conflict detection | Keep concurrency requirement |
| Photos per item/section | Keep requirement; storage abstracted |
| Signatures | Keep requirement; redesign evidence model |
| Final PDF | Keep output requirement |
| Final JSON snapshot | Keep immutable-snapshot concept |
| Inspector assignment | Generalize in new authorization/work model |
| Offline/local inspection cache | Keep field-use requirement |
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
