# ADR 0025 — Keys and physical access-item custody

## Status

Accepted for canonical PR #20 implementation.

## Context

Portfolio needs to track physical access media handed to a tenancy: mechanical keys, access cards and remotes. This truth must survive move-in/move-out workflows and later Unit timeline/reporting without turning an Inspection response or a free-text handover checklist into canonical key inventory.

A physical item, its operational lifecycle and the right to open a particular door are different grains. A key/card/remote can be physically inventoried and retired even when the exact lock topology or programmable access-control policy is not modeled yet.

Tenancy is the custody assignment grain in this phase. Party identity remains owned by Party/TenancyParty and is not copied into key custody.

## Decision

### AccessItem

One `AccessItem` is one exact physical access medium:

- `key`
- `card`
- `remote`

It has stable business code, kind, immutable Property/optional Unit/Space inventory scope, correctable descriptive label, lifecycle state and recording provenance.

Property is required. Unit is optional. Space is optional only when Unit exists. Unit must belong to Property and Space must belong to Unit.

Scope means **inventory association**, not a claim about every lock, door or electronic permission that the item can operate.

Canonical #20 does not model AccessPoint, lock cylinders, master-key systems, card permissions or remote programming.

### Item lifecycle is separate from custody

Every newly created AccessItem starts canonically as:

```text
status = active
version = 1
retiredAt = null
retiredByUserId = null
retirementReason = null
```

PostgreSQL enforces that initial shape independently; direct SQL cannot create a pre-retired item or skip the initial aggregate version.

AccessItem lifecycle is then:

```text
active -> retired
```

Retirement is terminal and records:

- `retiredAt`;
- `retiredByUserId`;
- `retirementReason`.

`label` is correctable metadata and changes through optimistic versioning. Code, physical identity, kind, scope and original recording provenance remain immutable.

Retirement answers:

> is this physical credential still operational inventory?

It does **not** answer who currently has it.

An item may therefore legitimately be:

```text
active  + available
active  + issued
active  + lost

retired + available
retired + issued
retired + lost
```

A retired item can never receive a new `issued` transaction.

Retirement is allowed while an item is still issued or lost. This represents real cases such as a card being administratively disabled before the tenant returns it or a physical key becoming obsolete when a lock is replaced.

At the moment the retirement transition is written, `retiredAt` cannot predate AccessItem recording or the latest custody occurrence that already exists at that moment. Later `returned` or `lost` events may legally occur after `retiredAt`; this rule is deliberately **not** `retiredAt >= max(all custody ever)`. Retirement provenance is immutable after the transition.

### Custody is an append-only transaction ledger

`AccessItemTransaction` is the canonical custody history. Supported events are:

- `issued`
- `returned`
- `lost`

Each transaction belongs to exactly one AccessItem and one Tenancy and records:

- monotonic per-item sequence;
- `occurredAt` business occurrence;
- immutable `recordedAt` / `recordedByUserId` provenance;
- optional note.

There is no parallel mutable `currentTenancyId` or AccessAssignment table.

Current custody state is derived from the latest transaction:

```text
no transaction | returned -> available
issued                    -> issued to that Tenancy
lost                      -> lost under that Tenancy
```

A lost item is not silently made available. It may be returned later by the same Tenancy if recovered; only that `returned` event makes custody available again. If the item is already retired, that return closes custody but does not reactivate the item.

### Tenancy assignment boundary

New issuance is allowed only to a current Tenancy:

- `active`
- `notice_given`
- `move_out_pending`

It is intentionally not allowed to `draft`, `planned`, `ended` or `cancelled` Tenancy.

This avoids a planned Tenancy being cancelled while still owning physical custody.

Because `AccessItemTransaction.occurredAt` is business occurrence while `Tenancy.actualStart` is a date-only business boundary, canonical #20 defines the cross-domain comparison explicitly:

```text
UTC calendar date of issued.occurredAt >= Tenancy.actualStart
```

Application code derives this from the ISO instant in UTC. PostgreSQL uses:

```sql
(timezone('UTC', occurred_at))::date
```

No session timezone participates in the invariant.

Therefore, for `actualStart = 2026-09-19`:

```text
2026-09-18T23:59:59Z -> illegal
2026-09-19T00:00:00Z -> legal
```

Return/loss closes or records an already-existing custody chain and therefore remains legal if the Tenancy later became `ended` or if the AccessItem was retired. Ending a Tenancy does not rewrite or erase outstanding key truth. An outstanding issued/lost item cannot be issued to a successor Tenancy until it is returned, and a retired item cannot be issued at all.

Canonical #20 does not make Tenancy lifecycle commands depend on the Access context.

### Physical scope when issuing

The Tenancy Unit determines its Property.

- Property-scoped AccessItem may be issued to a Tenancy of any Unit in that Property.
- Unit/Space-scoped AccessItem may only be issued to a Tenancy of that exact Unit.
- Space scope does not imply that Tenancy itself is space-grained.

### Temporal truth

`AccessItem.recordedAt` is the earliest canonical system boundary for its custody ledger.

For every transaction:

```text
item.recordedAt <= occurredAt <= recordedAt
```

Per item, both occurrence and recording chronology are non-decreasing.

Exact timestamp equality is legal because sequence provides deterministic order.

A future historical-import workflow, if required, must explicitly define pre-registration occurrence semantics instead of bypassing this rule.

### Concurrency and PostgreSQL parity

PostgreSQL independently enforces item lifecycle and custody state.

Every transaction INSERT obtains a row lock on its AccessItem before reading the latest transaction. AccessItem UPDATE already row-locks the same row. This AccessItem row is therefore the common serialization point for:

- issue vs issue;
- issue vs retirement;
- metadata/lifecycle CAS updates.

PostgreSQL independently validates:

- exact next sequence;
- active item requirement for new issue;
- item/Tenancy Property and Unit scope;
- issue-eligible Tenancy current state;
- UTC occurrence-date boundary against `Tenancy.actualStart`;
- custody state transition;
- same holding Tenancy on return/loss;
- item and prior-transaction temporal ordering;
- retirement timestamp against existing custody history;
- terminal retirement provenance;
- immutable identity/kind/scope/original recording provenance.

Transactions are append-only. AccessItem retirement provenance is immutable; label alone remains correctable metadata through versioned updates.

## Acceptance

At minimum the implementation must prove:

1. key/card/remote creation with valid hierarchy;
2. property-wide item issuance to a Tenancy in that Property;
3. Unit item cannot be issued to another Unit's Tenancy;
4. draft/planned/ended/cancelled Tenancy cannot receive a new item;
5. issue occurrence before the UTC `actualStart` date is rejected and exact midnight boundary is accepted;
6. issue -> return -> reissue history;
7. issue -> lost blocks reissue;
8. lost -> return recovers custody availability;
9. wrong Tenancy cannot return/report loss;
10. transaction occurrence cannot predate item registration or previous custody occurrence;
11. AccessItem label is correctable with optimistic versioning while identity/scope remain immutable;
12. active -> retired is terminal and retirement cannot be backdated before existing custody;
13. retired item cannot receive new issue;
14. item may retire while issued/lost and return/loss remains legal afterwards;
15. direct SQL cannot rewrite/delete AccessItemTransaction history;
16. direct SQL cannot bypass lifecycle/state/scope/sequence/UTC-time invariants;
17. concurrent issue attempts serialize and only one custody transition succeeds;
18. concurrent retirement and issue serialize on the same AccessItem row.

## Deferred

Not part of canonical #20:

- lock/door/access-point topology;
- master-key hierarchy;
- electronic permission schedules;
- card/remote programming state beyond terminal item retirement;
- credential secrets/PINs;
- per-Person custody below Tenancy grain;
- lost-key billing or Cost source linkage;
- automatic Tenancy end blocking;
- historical import predating AccessItem registration;
- Inspection move-in/out key form integration.

Those can consume AccessItem lifecycle/custody truth later without redefining it.
