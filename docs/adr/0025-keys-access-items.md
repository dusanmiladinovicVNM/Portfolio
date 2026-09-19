# ADR 0025 — Keys and physical access-item custody

## Status

Accepted for canonical PR #20 implementation.

## Context

Portfolio needs to track physical access media handed to a tenancy: mechanical keys, access cards and remotes. This truth must survive move-in/move-out workflows and later Unit timeline/reporting without turning an Inspection response or a free-text handover checklist into canonical key inventory.

A physical item and the right to open a particular door are not the same grain. A key/card/remote can be physically inventoried even when the exact lock topology or programmable access-control policy is not modeled yet.

Tenancy is the assignment grain in this phase. Party identity remains owned by Party/TenancyParty and is not copied into key custody.

## Decision

### AccessItem

One `AccessItem` is one exact physical access medium:

- `key`
- `card`
- `remote`

It has stable business code, kind, immutable Property/optional Unit/Space inventory scope, descriptive label and recording provenance.

Property is required. Unit is optional. Space is optional only when Unit exists. Unit must belong to Property and Space must belong to Unit.

Scope means **inventory association**, not a claim about every lock, door or electronic permission that the item can operate.

Canonical #20 does not model AccessPoint, lock cylinders, master-key systems, card permissions or remote programming.

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

Current state is derived from the latest transaction:

```text
no transaction | returned -> available
issued                    -> issued to that Tenancy
lost                      -> lost under that Tenancy
```

A lost item is not silently made available. It may be returned later by the same Tenancy if recovered; only that `returned` event makes it available again.

### Tenancy assignment boundary

Issuing is allowed only to a current Tenancy:

- `active`
- `notice_given`
- `move_out_pending`

It is intentionally not allowed to `draft`, `planned`, `ended` or `cancelled` Tenancy.

This avoids a planned Tenancy being cancelled while still owning physical custody.

Return/loss closes or records an already-existing custody chain and therefore remains legal even if the Tenancy later became `ended`. Ending a Tenancy does not rewrite or erase outstanding key truth. An outstanding issued/lost item cannot be issued to a successor Tenancy until it is returned.

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

Exact timestamp equality is legal.

A future historical-import workflow, if required, must explicitly define pre-registration occurrence semantics instead of bypassing this rule.

### Concurrency and PostgreSQL parity

PostgreSQL independently enforces custody state.

Every transaction INSERT obtains a row lock on its AccessItem before reading the latest transaction. This is the per-item serialization point.

PostgreSQL then independently validates:

- exact next sequence;
- item/Tenancy Property and Unit scope;
- issue-eligible Tenancy state;
- state transition;
- same holding Tenancy on return/loss;
- item and prior-transaction temporal ordering.

Therefore two concurrent issue attempts for the same available item cannot both commit.

Transactions are append-only. AccessItem identity/kind/scope/provenance are immutable in canonical #20.

## Acceptance

At minimum the implementation must prove:

1. key/card/remote creation with valid hierarchy;
2. property-wide item issuance to a Tenancy in that Property;
3. Unit item cannot be issued to another Unit's Tenancy;
4. draft/planned/ended/cancelled Tenancy cannot receive a new item;
5. issue -> return -> reissue history;
6. issue -> lost blocks reissue;
7. lost -> return recovers availability;
8. wrong Tenancy cannot return/report loss;
9. transaction occurrence cannot predate item registration or previous custody occurrence;
10. direct SQL cannot rewrite/delete AccessItemTransaction history;
11. direct SQL cannot bypass state/scope/sequence invariants;
12. concurrent issue attempts serialize and only one custody transition succeeds.

## Deferred

Not part of canonical #20:

- lock/door/access-point topology;
- master-key hierarchy;
- electronic permission schedules;
- card/remote programming state;
- credential secrets/PINs;
- per-Person custody below Tenancy grain;
- lost-key billing or Cost source linkage;
- automatic Tenancy end blocking;
- historical import predating AccessItem registration;
- Inspection move-in/out key form integration.

Those can consume AccessItem custody truth later without redefining it.
