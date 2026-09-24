# Hosted production bootstrap and end-to-end smoke evidence — 2026-09-24

## Purpose

This runbook records the first real hosted acceptance pass for Portfolio outside the fake browser harness and CI-only environment.

It is an evidence record, not a claim that every production-readiness item is complete. The goal was to prove the critical runtime chain against the hosted Supabase project, canonical PostgreSQL database, Google Drive storage adapter, Supabase Auth, and the real React frontend.

No credentials, access tokens, refresh tokens, database passwords, OAuth client secrets, or secret environment-file contents belong in this document.

## Environment under test

- Supabase project ref: `fiowxgamyjjcondlheqg`.
- Hosted API: Supabase Edge Function `api`.
- Canonical database: hosted PostgreSQL in the Supabase project.
- Binary storage adapter: Google Drive.
- Authentication: Supabase Auth.
- Browser client: real Portfolio React/Vite application on `http://localhost:5173`.
- Hosted backend release proven by `/health/live` and `/health/ready`: `edb5edacd4349898e403b31c0a2e11bfb8574b4a`.
- Repository main after the frontend StrictMode correction: `2bb4e55e1e03090393f175eabff90d26b7c43ea9`.

The later main SHA differs because PR #49 is frontend-only; the hosted backend artifact did not require redeployment for that fix.

## Deployment lineage

The hosted path was established incrementally:

- PR #44 — production Supabase host.
- PR #45 — generated Supabase deployment bundle and exact source/bundle provenance.
- PR #46 — syntax-aware Node built-in normalization for the Supabase bundler.
- PR #47 — injected `Buffer` for Node-dependent runtime code under Deno.
- PR #48 — injected `setImmediate` / `clearImmediate` for the PostgreSQL client runtime.
- PR #49 — fixed React StrictMode mounted-state handling discovered by the real hosted browser smoke.

The deployment flow now builds from an exact clean Git SHA, embeds that SHA into the function bundle, records bundle SHA-256/size/esbuild version, verifies the manifest, deploys with the pinned Supabase CLI, and verifies the release identity through `/health/live`.

## Hosted runtime bootstrap

### Database and Edge Function

Evidence obtained during the hosted run:

- Supabase migrations were applied and local/remote migration history matched.
- The Edge Function deployed successfully.
- `/health/live` returned the exact embedded deployed source SHA.
- `/health/ready` reached PostgreSQL and passed the real `select 1` readiness probe.
- The hosted function therefore proved both function boot and canonical DB connectivity.

Result: **PASS**.

### First administrator bootstrap

A real Supabase Auth user was created and then linked to one canonical Portfolio admin identity in:

- `public.app_users`
- `public.auth_identities`

The bootstrap was performed only while both application identity tables were empty.

Authenticated API access subsequently succeeded, proving that external Supabase subject identity was correctly resolved to the internal Portfolio user/capability model.

Result: **PASS**.

## Authenticated canonical database smoke

The authenticated hosted API was exercised directly before using the browser.

A smoke Property was created and reread:

- code: `SMOKE-001`
- name: `Hosted Smoke Property`

A smoke Unit was created under that Property and reread:

- code: `SMOKE-U-001`
- unit number: `1`
- type: `apartment`
- floor: `1`
- area: `80 m²`
- rooms: `3`

The dashboard later showed the same real records through the reporting/read model.

Result: **PASS**.

## Google Drive binary-storage smoke

Google OAuth was validated with the production integration credentials and the `drive.file` scope. The current client ID, enabled client secret and refresh token were installed as Supabase function secrets without exposing them in Git.

A canonical Document was created:

- code: `SMOKE-DOC-001`
- title: `Hosted Drive Smoke`

A 29-byte text payload was uploaded through the hosted Portfolio API.

Canonical metadata:

- file: `portfolio-smoke.txt`
- byte size: `29`
- SHA-256: `eeba7c78359b536a7a62f8eabae6e9dd9cb90274e8c1a262198b5cbecbf5fccf`
- stored DocumentVersion status transitioned to `final`

The same binary was downloaded through Portfolio and produced the exact same SHA-256.

Result: **PASS**.

This proves the application-level chain:

```
Portfolio API
→ canonical Document / DocumentVersion
→ Google Drive storage adapter
→ download through Portfolio
→ byte-for-byte SHA-256 integrity
```

## Unsigned Inspection lifecycle smoke

Published schema:

- schema code: `SMOKE-INSP`
- type: `periodic`
- one required text item: `condition`

Inspection:

- code: `SMOKE-INSP-001`
- Unit: `SMOKE-U-001`

Observed lifecycle:

```
draft
→ in_progress
→ save required response ("Good")
→ locked
→ finalized
→ immutable final snapshot
```

The final snapshot was created from lifecycle version 3 and content revision 1; the Inspection then advanced to lifecycle version 4.

A post-finalization section mutation was attempted and correctly rejected with:

```
INSPECTION_CONTENT_LOCKED
Inspection content is no longer editable.
```

Result: **PASS**.

## Unsigned final-report smoke

Generating the final report for `SMOKE-INSP-001` created one final PDF DocumentVersion.

Canonical metadata:

- byte size: `4334`
- SHA-256: `582ca9238691381220904b57f34ffe8437e4c919c2c054ca17304f5fe1985e5c`
- status: `final`

The PDF was downloaded again through the hosted API:

- downloaded byte size: `4334`
- downloaded SHA-256: `582ca9238691381220904b57f34ffe8437e4c919c2c054ca17304f5fe1985e5c`

A second `POST /final-report` returned the same existing DocumentVersion rather than creating another version.

Result: **PASS** for PDF generation, storage integrity and idempotency.

## Required-signature lifecycle smoke

A second published schema was created:

- schema code: `SMOKE-INSP-SIG`
- type: `periodic`
- required signature role: `agent`

Inspection:

- code: `SMOKE-INSP-SIG-001`

The Inspection was started, its required response was saved, and it was locked.

Finalization without a required signature was deliberately attempted and correctly rejected:

```
INSPECTION_REQUIRED_SIGNATURES_MISSING
Missing required inspection signatures: agent.
```

An Inspection-scoped signature binary was then uploaded:

- file: `agent-signature.txt`
- byte size: `23`
- SHA-256: `1d5469a6148692f45533d26f6800c689586aac2d3ae5486ad844b3d1324094c3`
- DocumentVersion status: `final`

The exact final DocumentVersion was related to an `agent` signature. The signature insertion incremented Inspection `contentRevision` from 1 to 2, as designed.

Finalization then succeeded:

- final Inspection lifecycle version: `4`
- final snapshot source lifecycle version: `3`
- final snapshot content revision: `2`

Result: **PASS**.

## Signed final-report smoke

The signed Inspection produced one final PDF.

Canonical metadata:

- byte size: `5622`
- SHA-256: `d983d00ef7028b154b05f8fea218d2dcd7a426dbde085945194a589b0c71558e`
- status: `final`

Downloaded through the hosted Portfolio API:

- downloaded byte size: `5622`
- downloaded SHA-256: `d983d00ef7028b154b05f8fea218d2dcd7a426dbde085945194a589b0c71558e`

The canonical Inspection bundle also exposed the report as `final_report` evidence referencing the exact final DocumentVersion.

Result: **PASS**.

## Real browser against hosted backend

The real React application was started locally with browser-safe production configuration:

```
VITE_SUPABASE_URL=<hosted project URL>
VITE_SUPABASE_ANON_KEY=<browser-safe publishable key>
VITE_API_BASE_URL=<hosted Edge API base>
```

The first screen observed was initially the browser harness because its test cookie was still present. After removing the `__portfolio_browser_test` cookie, the real application used Supabase Auth and the hosted API.

Observed real browser chain:

```
React/Vite
→ Supabase browser auth
→ access token
→ hosted Edge API
→ PostgreSQL projections/canonical reads
→ React rendering
```

The dashboard showed the real production smoke data:

- `SMOKE-001 / Hosted Smoke Property`
- one Unit
- zero occupied
- one vacant

The Property screen showed `SMOKE-U-001`.

The Unit dossier showed both real finalized Inspections:

- `SMOKE-INSP-001`
- `SMOKE-INSP-SIG-001`

Opening the signed Inspection showed:

- lifecycle v4
- content r2
- immutable final snapshot v1
- source lifecycle v3 / content r2
- existing canonical final-report evidence

Result: **PASS**.

## Defect discovered by real hosted browser smoke

The first real-browser `Generate / reuse final report` action appeared to remain indefinitely on:

```
Generating…
```

Network evidence showed the backend command itself was healthy:

- `POST /final-report`
- HTTP `200`
- approximately `915 ms`

This isolated the failure to the frontend completion/reconciliation path.

Root cause: `InspectionFinalizationPanel` and `InspectionFindingsEvidence` used a mounted ref that was set to false in effect cleanup but was not reset to true when React StrictMode re-ran the effect setup. In development StrictMode, this suppressed state completion and left the action pending in the UI.

PR #49 corrected the effect setup and changed the browser harness to run under `<StrictMode>`, so CI now exercises the same lifecycle semantics as the real web entry point.

Real browser retest after the fix showed:

- success message: `Final report generated/reused from the immutable snapshot.`
- canonical final report visible in the UI
- the same existing final report was reused

Result: **PASS**.

## Acceptance matrix

| Capability | Evidence | Result |
| --- | --- | --- |
| Exact source deployment identity | embedded SHA via `/health/live` | PASS |
| Hosted function boot | live endpoint | PASS |
| Hosted PostgreSQL connectivity | readiness `select 1` | PASS |
| Supabase Auth login | real user session | PASS |
| Internal auth mapping | authenticated Portfolio API | PASS |
| Canonical Property write/read | `SMOKE-001` | PASS |
| Canonical Unit write/read | `SMOKE-U-001` | PASS |
| Google Drive upload | smoke DocumentVersion | PASS |
| Google Drive download | exact SHA-256 round-trip | PASS |
| DocumentVersion finalization | smoke document | PASS |
| Inspection schema publish | unsigned + signed schemas | PASS |
| Inspection response CAS path | required response saved | PASS |
| Inspection lock | hosted command | PASS |
| Immutable final snapshot | unsigned + signed inspections | PASS |
| Mutation after finalization rejected | `INSPECTION_CONTENT_LOCKED` | PASS |
| Required signature enforcement | missing agent blocked | PASS |
| Signature binary finalization | exact scoped DocumentVersion | PASS |
| Signature relation | active agent signature | PASS |
| Final-report generation | hosted PDF | PASS |
| Final-report idempotency | same DocumentVersion reused | PASS |
| Final-report Drive integrity | exact downloaded SHA-256 | PASS |
| Real frontend auth | browser Supabase session | PASS |
| Browser → hosted API → DB | real dashboard/property/unit | PASS |
| Browser Inspection rendering | both real finalized Inspections | PASS |
| Browser final-report reuse | post-PR #49 UI completion | PASS |

## What this run does not prove

The following remain separate production-readiness concerns and must not be inferred from this smoke record:

- public frontend hosting is not yet established by this run;
- production custom domain / TLS setup for the frontend is not established by this run;
- rate limiting / abuse controls are not established by this run;
- operational Google OAuth publishing/verification policy is separate from functional OAuth proof;
- scheduled/automatic production backups and independent secondary storage policy are separate work;
- disaster-recovery evidence remains governed by the backup/restore and release-gate runbooks;
- broad multi-user concurrency and load behavior are not proven by this single-operator smoke;
- observability/alerting completeness is not proven merely because the function logs were usable during diagnosis.

## Operational conclusion

As of this acceptance run, Portfolio has a proven real path for:

```
Supabase Auth
→ Portfolio authorization
→ hosted Edge API
→ canonical PostgreSQL
→ Google Drive binary storage
→ Inspection lifecycle and signatures
→ immutable final snapshot
→ idempotent PDF final report
→ real React browser client
```

The remaining work should therefore be driven by explicit production gaps, public frontend hosting, operational safeguards, and new hosted failures rather than speculative Supabase/Deno compatibility hardening.
