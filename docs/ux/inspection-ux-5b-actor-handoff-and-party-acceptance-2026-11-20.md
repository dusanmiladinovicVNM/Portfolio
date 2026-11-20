# Portfolio — UX-5B.1: Actor handoff and exact signer Party acceptance

Date: 2026-11-20 · Epic #124 · Base `main@64cad8274f9c4049b270f4cac30b0ae2a985d86e`.

## Why

UX-5A removed Inspector-only forbidden lifecycle controls through the server-projected `actionCapabilities`. The prior browser test toggled a simulated Inspector projection and then switched back to Manager presentation before signature handling. This was insufficient proof of the **verified HTTP actor boundary** and the actor transition on the *same Inspection*.

The signature UI also offered an optional `No Party (witness/agent only)` choice regardless of selected signer role. The backend correctly required and validated an exact Party for tenant/landlord, but the visible form did not express that prerequisite as a native required input and could carry a Party selection across role changes.

## Scope

- Continue using the canonical Inspection GET / resolved server actor `actionCapabilities`; do **not** infer authority from unverified JWT claims or frontend role strings.
- Extend the existing full HTTP lifecycle test with explicit **verified Inspector → Manager → Inspector** GET and command transitions: assigned Inspector sees no Unlock/Finalize; non-assigned Inspector GET denied; Manager sees those controls while locked; Inspector POST Unlock/Finalize denied; Manager unlocks with reason, old signature is invalidated; assigned Inspector can lock again; Manager finalizes and creates one immutable report; Inspector may read the finalized original and report but cannot generate a report.
- Add independent HTTP signature Party tests using canonical Party, Tenancy and Ownership fixtures. Tenant signature belongs to a tenant/co-tenant of the Inspection tenancy; landlord to an owner of the Unit on the lock date. Wrong Party, absent Party and unassigned Inspector are **negative** tests. Check that rejected operations write no signature; accepted signatures retain exact Party IDs and true signing Actor IDs.
- In the existing role-aware signature form, changing role clears local Party selection and updates the native required flag. Tenant/landlord show a mandatory exact-Party prompt; witness/agent remains optional. An Inspector with missing signatures sees a clear Manager/Admin handoff explanation, and with all required signatures recorded gets an explicit finalization handoff message.
- The UI does not calculate tenancy or ownership rights. **All** actual signer eligibility remains enforced on the server at registration time and by existing DB constraints. The global Party directory remains a directory, not an authorization claim.
- Preserve the single mounted signature recovery component, binary idempotency key, original File, retry-on-ambiguous canonical re-read, CAS, unlock signature invalidation and immutable final snapshot/PDF semantics.

## Gates

1. Exact-head TS, unit and full browser lifecycle on PR, including all existing Evidence recovery #144/#150 and read-only finalized Report #149.
2. Security-negative HTTP matrix: assigned vs unassigned Inspector, Manager capabilities, actual owner/tenant Party binding and no write on failure.
3. Browser: changing tenant → witness → tenant clears Party, sets native required appropriately, and preserves the locked stage/focus. The existing Inspector no-Unlock/Finalize and Manager flows still pass.
4. Backup/restore and release checks green.
5. Reviewed diff shows no DB, command authorization, canonical Inspection lifecycle, document storage or report generation changes.

## Important remaining manual gates

- **Not hosted UAT:** these integration tests resolve real `Actor` records in an in-memory HTTP test harness, not live Supabase identities, staff assignments, or Vercel-hosted sessions.
- Before production acceptance, independently sign in using **three separately authenticated accounts** (assigned Inspector, Manager and unassigned Inspector), verify real 403/positive lifecycle paths, exact tenant/landlord Party options, signature drawings on phones and cross-device handoff. Use synthetic Inspection/Party fixtures, never real customers.
- Party dropdown still enumerates active directory Parties. A further backend-authored, role-eligible signer candidate projection may reduce wrong-Party choices; do not silently derive it from client role or from directory label alone.
- Full de-CH localization and real-device VoiceOver/TalkBack remain separate acceptance work. Operational monitoring issue #139 is still open and not resolved by this PR.

**Decision rule:** CI green = GO for this scoped enhancement; complete Inspection production acceptance requires the remaining hosted and monitoring gates separately.
