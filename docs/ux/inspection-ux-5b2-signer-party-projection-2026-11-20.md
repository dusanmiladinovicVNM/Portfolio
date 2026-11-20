# Portfolio — UX-5B.2 canonical signer Party options

Date: 2026-11-20 · Epic #124 · Base: `main@9eb747351acf446869ca45ff7c0cee95060c1440`.

## Problem

The Inspector/Manager signature form previously displayed every active Party from `GET /parties` to a Tenant or Landlord signer. The POST signature command correctly restricted a Tenant signer to the Inspection tenancy's tenant/co-tenant and a Landlord signer to a Unit owner on the **Inspection lock date**. The UI could therefore offer incorrect Parties, after which a failed signature registration left uploaded immutable bytes awaiting recovery.

This is an authorization *presentation* mismatch, not a demonstrated authorization bypass.

## Solution

- Move both role predicates into `inspection-signature-party-policy.ts` in **application**, used by the established `addInspectionSignatureCommand` checks and by GET projection. **Same rule, two use cases**, not a second policy in React.
- After the server validates the authenticated actor's access to the exact canonical Inspection bundle, when the Inspection is locked it reads:
  - the exact referenced Tenancy and its tenant/co-tenant Party IDs;
  - the Unit Ownership periods valid on the Inspection lock date, including owner shares.
- `GET /inspections/:id` now returns `signerPartyIds: {tenant: [...], landlord: [...]}`. Other lifecycle states return empty lists. These IDs are scoped to the already authorized Inspection, not a public directory endpoint.
- The client keeps the existing Party directory for label/active-status display and optional witness/agent choices, but intersects Tenant/Landlord choices with those **server-derived exact IDs**. It never infers eligibility from names, role labels, global directory data or user input.
- The optional field in the response contract supports rolling deployment. If an old API omits it, Tenant/Landlord selection **fails closed** with an explicit error; it never silently falls back to the global Party directory. Witness/agent can still have an optional Party.
- On signer role changes, previously selected Party is cleared (UX-5B.1). Backend POST still verifies Party existence, tenancy membership and ownership, CAS and locked state at request time, and the PostgreSQL constraints remain authoritative.

## Acceptance

1. Unit policy: tenant and co-tenant IDs included, guarantor excluded; ownership tested on exact locked date and exact Unit; old/new/wrong-Unit owner excluded.
2. HTTP with resolved assigned Inspector: GET signatory IDs contains only the real Tenancy tenant and lock-date Landlord. Unassigned Inspector GET remains 403. Wrong/missing Party signature POST stays denied (UX-5B.1).
3. Browser: role Tenant can select tenant but not landlord. Role Landlord can select landlord but not tenant. Role change clears previous selection. Witness/agent remain optional; no extra signature upload or write introduced.
4. Exact-head full CI with TypeScript, unit, browser lifecycle including signature upload/recovery, Evidence, immutable final report and backup/restore.
5. No DB migration, new permissions, public enumeration endpoint, document storage or canonical lifecycle change.

## Limitations

- The candidate list is an advisory **view projection**, not a permission token. It can become stale if tenancy/ownership data change while the locked form stays open; registration rechecks the canonical business rule. Do not rely on the list to authorize a write.
- UI shows active Parties from the existing directory; if an eligible Party is inactive or not readable, staff should correct the underlying Party record in the appropriate authorized workflow, not bypass the signer checks.
- Real hosted Inspector/Manager/Inspector sessions, wrong-Party 403/422 observation, mobile drawing and VoiceOver/TalkBack still require separate operator UAT.
- Monitoring gap issue #139 and de-CH localization remain separate acceptance items.

**Release decision:** merge only on exact reviewed head and fully green CI; hosting/monitoring acceptance is separate.
