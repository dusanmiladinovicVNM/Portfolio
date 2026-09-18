# ADR 0017: Inspection content barrier and historical immutability

**Status:** Accepted

## Context

PR #11 intentionally separated lifecycle concurrency from section autosave concurrency:

- `Inspection.version` protected lifecycle state;
- `InspectionSectionState.revision` protected local section autosave.

A post-merge adversarial review found a write-skew window in the lock workflow.

A lock could read and validate one response set, then a concurrent section autosave could change a condition that made another answer required. Because section autosave deliberately did not increment `Inspection.version`, the lifecycle CAS could still succeed and lock an invalid response set.

The same review found direct-SQL ownership gaps:

- published schema children could be moved into a draft schema by changing their parent FK;
- locked response/finding rows could be retargeted toward another editable Inspection;
- SectionState deletion was not protected after lock;
- Inspection historical identity could be rewritten if the new FK combination was otherwise valid.

## Decision

### Three concurrency grains

Portfolio keeps section-grain autosave and adds one monotonic closing barrier:

```text
Inspection.version
    lifecycle / assignment concurrency

InspectionSectionState.revision
    local autosave conflict detection

Inspection.contentRevision
    global content barrier for lock/finalization
```

Every repository-managed content mutation increments `contentRevision`.

Normal section saves do **not** CAS `contentRevision`; therefore unrelated sections do not conflict.

A closing transition:

1. reads the current Inspection and remembers `contentRevision = N`;
2. reads authoritative responses;
3. validates required/conditional rules;
4. CASes lifecycle state on both `Inspection.version` and `contentRevision = N`.

If a section save/finding write wins the inspection-row barrier first, `contentRevision` changes and lock fails.

If lock wins first, subsequent content writes observe the non-editable status and fail.

This closes the validation/write TOCTOU window without reverting to whole-inspection autosave concurrency.

### Inspection lifecycle

Field inspections use:

```text
draft → in_progress → locked
  └──────────────→ cancelled
in_progress ─────→ cancelled
```

Direct `draft → locked` is invalid.

PR #13 will define controlled unlock/finalization/signature transitions.

### Historical identity

The following Inspection facts are immutable after creation:

- code;
- inspection type;
- Unit;
- optional Tenancy;
- schema version;
- creator.

Assignment and schedule are separate operational metadata and may receive explicit workflows later.

### Schema child ownership

A Section cannot move between schema versions after insert.

An Item cannot move between schema versions or Sections after insert.

Published/retired schema structure remains immutable regardless of the proposed NEW parent.

### Content ownership

Response/Finding ownership columns are immutable after insert.

For UPDATE/DELETE, PostgreSQL validates the OLD parent as well as the NEW parent where relevant.

Locked content cannot be made mutable by retargeting it.

SectionState identity is immutable on UPDATE and all INSERT/UPDATE/DELETE operations participate in the content-state guard, so a locked Inspection cannot lose its section concurrency state through direct SQL.

### Section write semantics

The field endpoint is PATCH, not PUT:

```json
{
  "expectedRevision": 4,
  "set": [
    { "itemId": "...", "value": "..." }
  ],
  "clear": ["..."]
}
```

- omitted items are unchanged;
- `set` upserts selected current answers;
- `clear` explicitly removes selected current answers;
- one item cannot be set and cleared in the same patch.

This avoids pretending that a partial autosave payload replaces the entire Section.

### DB/domain validation parity

PostgreSQL rejects duplicate multiselect values just as the domain validator does.

## Evidence

The hardening suite contains adversarial tests for:

- autosave injected after lock validation but before lock CAS;
- published item moved toward a draft schema;
- locked response/finding retargeted toward an editable Inspection;
- deletion of locked SectionState;
- Inspection historical-identity rewrite;
- direct invalid lifecycle jumps;
- duplicate multiselect values through direct SQL;
- explicit response clearing through PATCH semantics.

## Consequences

- section autosave remains low-conflict;
- lock/finalization obtains a stable content snapshot boundary;
- published schema history cannot be altered by parent-FK movement;
- locked evidence cannot be escaped by retargeting rows;
- HTTP semantics now match actual partial-save behavior;
- PR #13 can build signatures/final snapshots on a materially stronger boundary.
