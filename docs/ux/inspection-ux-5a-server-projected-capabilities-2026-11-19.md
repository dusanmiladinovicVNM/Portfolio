# Portfolio — UX-5A verified Inspection lifecycle action presentation

Date: 2026-11-19 · Epic #124 · Base: `main@2cf26a9cbdfd3b42181a43e65feb315b45f4942d`.

## Confirmed discrepancy

For locked Inspections, `InspectionFinalizationPanel` displayed *Unlock Inspection* and *Finalize Inspection* to every actor who could read the Inspection. Server `unlockInspectionCommand` and `finalizeInspectionCommand` explicitly reject the Inspector role, while allowing Inspector to lock an assigned Inspection and register a valid signer/Party signature. This is a **P2 authorization UX mismatch**, **not** a known server authorization bypass.

## Source-of-truth design

- The Portfolio server resolves actor identity from active `auth_identities → app_users`, not external JWT role claims.
- Shared server-side `canControlInspectionLifecycle(actor)` mirrors the existing command guard; the command bodies now use this same helper, maintaining their prior authorization decisions. `actorHasCapability` shares the established server role/capability table.
- The GET `/inspections/:id` response includes verified actor/lifecycle-scoped **presentation** permissions:
  - `canUnlock`: authenticated Manager/Admin, canonical `locked` status.
  - `canFinalize`: authenticated Manager/Admin, canonical `locked` status; signature readiness remains a separate domain precondition.
  - `canGenerateFinalReport`: actor has `documents:write` and `inspections:read`, status is `finalized`. Existing immutable snapshot/report command remains authoritative.
- `actionCapabilities` is optional in the response schema solely to tolerate a rolling API/frontend deployment. UI **fails closed** (all control-action booleans false) when the field is absent; it never substitutes a local role heuristic or JWT claim.
- `InspectionFinalizationPanel` hides unauthorized Unlock/Finalize controls, renders a manager/admin handoff message, and preserves the signature workspace for the Inspector. It reads report-generation permission from the same server-validated bundle, replacing `App`-level role logic.
- Frontend flags only affect **presentation**. All commands continue to re-evaluate verified actor, lifecycle/CAS, Party, signature and immutable snapshot invariants. No frontend flag grants permission.

## Invariants / negative scope

- No new database roles, auth providers, migrations, status enums, tenant boundaries or signature domain changes.
- Inspector can **lock their assigned Inspection**, sign with valid exact Party where required, but never Unlock, Finalize or Generate final PDF.
- Manager/Admin can unlock/finalize **only** when canonical lifecycle allows it and required business preconditions pass; arbitrary UI flags cannot authorize a server command.
- Existing confirmation/retry/reconciliation and mounted signature recovery remain intact.
- UX-5B must separately audit signature Party authority, phase handoff and final Report UAT. This PR does **not** claim complete operator acceptance or app-wide de-CH translation.

## QA gates

1. Authorization unit test: Inspector `inspections:write` is retained, `canControlInspectionLifecycle` false; Manager/Admin true; Inspector lacks `documents:write`.
2. Browser: after canonical lock, mock Inspector projection hides Unlock and Finalize while Sign remains available; manager projection on canonical reread restores the controls; existing manager unlock/relock, signature invalidation, finalization and PDF remain green.
3. Full TypeScript/unit/browser lifecycle, backup/restore, source ownership and security tests.
4. Hosted real-actor UAT for assigned Inspector, Manager, Admin, including forbidden API attempt and successful manager handoff. **Not inferred from a browser harness projection.**
5. Post-merge production deployment verified independently.

**Merge gate:** exact reviewed head with complete CI green; no degradation of server authorization decisions. Production release and UI/UX acceptance are separate.
