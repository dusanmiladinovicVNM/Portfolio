# Portfolio — UX-5B.3 signer selection scoped to canonical Lock generation

Date: 2026-11-20 · Epic #124 · Input: independent audit of `main@172daf4f86168289d27ddbb3cdabfc017ea61e90`.

## Confirmed failure mechanism

The signer role and Party React selections were keyed only by `active.length` and the list of missing required signature roles. After registration of a signature, Unlock invalidates it; on re-lock both counts can return to the original values while the parent InspectionFinalizationPanel remains mounted. The old signer Party then becomes selected again because its stored `formKey` matches, despite a new legally relevant lock date/ownership context.

This is a P2 client state correctness/UX risk, **not** an established backend authorization bypass. The server rechecks exact Party eligibility at signature POST.

## Narrow correction

- Make the existing `signatureFlowKey` include the canonical Inspection ID, lifecycle `version`, and `lockedAt` along with active-signature count and missing roles.
- The domain `lockInspection` and `unlockInspection` both increment lifecycle version; unlike wall-clock timestamps, it uniquely distinguishes consecutive lock generations even if the test clock repeats the same instant.
- Do not introduce a local lock counter, route state, a new persisted attribute, or new server permissions.
- Keep the existing role change clears Party behavior and the same-lock registration recovery semantics.

## Regression

Extend the existing full browser lifecycle: select Tenant Party and add a signature, Unlock to invalidate it, complete fresh Review, re-lock, and assert the old Tenant Party selection is **empty** before any new selection/upload. Continue the subsequent precommit signature-failure/retry flow; retaining exact Party within the *same* lock cycle still works.

Expected failure on pre-fix code: Tenant Party remains selected after re-lock (same active/missing counts). Expected post-fix result: blank Party and default missing role, requiring deliberate new selection.

## Required gates

1. CI typecheck, web build, unit tests and complete browser lifecycle on exact PR SHA.
2. Existing Evidence stored-only/ambiguous recovery, actor handoff, role/Party projection, CAS, signing and final immutable PDF tests remain green.
3. No migration, API shape, signature binary, backend domain authorisation, idempotency or stored-only recovery changes.
4. PR #154 is an independent de-CH component change; both must be merged separately, with exact-head checks on rebased code if main advances.

## Limits

No hosted device or real-user UAT is claimed. The separate acceptance issue #153 and monitoring gap #139 remain open. This patch corrects rendered signer form selection; it does not claim persistence of uncommitted signature draft/bytes across a new Lock generation or page reload.