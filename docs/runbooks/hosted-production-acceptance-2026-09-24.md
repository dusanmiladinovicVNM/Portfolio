# Hosted production acceptance — 2026-09-23/24

This record captures the first real hosted Portfolio deployment and end-to-end acceptance run against Supabase, PostgreSQL, Google Drive and the real React frontend.

It is an evidence record, not a replacement for the canonical deployment, recovery or release-gate runbooks.

## Scope and provenance

The hosted API acceptance run was performed against the Supabase Edge Function service version:

~~~text
edb5edacd4349898e403b31c0a2e11bfb8574b4a
~~~

That SHA is embedded in the deployed bundle and was verified through the hosted health endpoint.

PR #49 was then discovered and merged while exercising the real browser UI. It is frontend-only: it fixes React StrictMode lifecycle handling and does not change the hosted Edge API behavior proven below.

At the point this record was created, repository `main` was:

~~~text
2bb4e55e1e03090393f175eabff90d26b7c43ea9
~~~

Do not infer that a later repository `main` SHA is already deployed to the Edge Function. Hosted release identity remains the SHA returned by `/health/live` until the deployment wrapper is run again.

## Environment

The first hosted MVP environment used:

- Supabase Auth;
- Supabase hosted PostgreSQL;
- Supabase Edge Functions;
- Google Drive through the production storage adapter;
- local Vite at `http://localhost:5173` as the real browser frontend during acceptance.

The Supabase project reference used for this acceptance was:

~~~text
fiowxgamyjjcondlheqg
~~~

The public web application itself was **not** deployed to a static production host during this run. Browser acceptance therefore proves the real frontend against the hosted backend, not final public web hosting, DNS or TLS configuration.

No production secret values are recorded here.

## Deployment history that enabled the hosted run

The first real hosted deployment exposed environment/runtime issues that the repository-only gate could not prove.

### PR #44 — production Supabase host

Established the hosted Supabase adapter boundary and production host configuration.

### PR #45 — generated deployment artifact and provenance

Supabase's server-side bundler could not consume the canonical monorepo TypeScript/Node-ESM resolution convention reliably.

The deployment path was changed to:

~~~text
clean exact source SHA
→ pinned esbuild
→ generated self-contained Edge bundle
→ manifest with source SHA / bundle SHA-256 / bytes / esbuild version
→ verified deploy wrapper
→ /health/live exact embedded SHA check
~~~

This removed the mutable runtime release-SHA secret from release identity.

### PR #46 — syntax-aware Node built-in normalization

The hosted Supabase upload rejected bare Node built-in imports such as `perf_hooks`.

The fix moved normalization into esbuild module resolution with explicit `node:` aliases rather than text-rewriting generated JavaScript.

### PR #47 — `Buffer` compatibility injection

The first deployed function boot then failed because a dependency expected the Node global `Buffer`.

The bundle now injects `Buffer` from `node:buffer`.

### PR #48 — immediate timer compatibility injection

After `Buffer` was fixed, PostgreSQL connection startup exposed missing `setImmediate`.

The bundle now also injects:

~~~text
setImmediate
clearImmediate
~~~

from `node:timers`.

After #48, the hosted function booted and PostgreSQL readiness passed.

### PR #49 — React StrictMode Inspection completion

The real browser acceptance exposed a frontend-only bug:

~~~text
POST /final-report → 200 OK
UI → remained "Generating…"
~~~

The hosted request itself completed in about 915 ms.

Root cause: the Inspection workflow components used a mounted ref that was set to `false` by StrictMode's development cleanup pass and never reset to `true` during the second setup pass. This suppressed canonical UI updates and pending-action cleanup.

#49 resets the mounted ref during effect setup and runs the browser harness under `<StrictMode>` so CI now matches the real web entry point. The real browser retest passed and displayed the canonical reused final report.

## Hosted infrastructure acceptance

### 1. Database migrations

The production Supabase schema was pushed successfully. Local and remote migration histories matched at 30 migrations at the time of deployment.

### 2. Edge deployment provenance

The deployment wrapper successfully:

1. required a clean checkout;
2. built the generated bundle from the exact checkout SHA;
3. verified source SHA, bundle hash and bundle size;
4. deployed through pinned Supabase CLI;
5. verified the hosted `/health/live` service version against the embedded SHA.

### 3. Liveness and readiness

Hosted checks passed:

~~~text
GET /health/live   → PASS
GET /health/ready  → PASS
~~~

`/health/ready` exercised a real PostgreSQL `select 1` through the hosted function.

This is the environment-level proof that the Edge runtime, database URL supplied by Supabase, Node compatibility shims and PostgreSQL driver all work together.

## First-admin bootstrap and authentication

A real Supabase Auth user was created.

The operator machine did not have `psql` or Docker, so the one-time first-admin data was inserted through the Supabase SQL Editor using the same empty-state intent as the canonical bootstrap path: internal user + Supabase subject identity mapping.

The canonical scripted bootstrap's concurrency semantics remain separately CI-proven; this manual hosted execution was not a concurrency test.

After bootstrap:

~~~text
Supabase password login
→ access token
→ authenticated Portfolio API
→ internal auth_identity resolution
→ admin authorization
~~~

passed.

An authenticated read of:

~~~text
GET /properties
~~~

returned HTTP 200.

## Canonical PostgreSQL smoke

A real hosted canonical Property was created:

~~~text
code: SMOKE-001
name: Hosted Smoke Property
~~~

The same record was then:

- read by ID;
- returned from the Property list;
- rendered by the real browser dashboard.

A real hosted Unit was also created:

~~~text
code: SMOKE-U-001
unit number: 1
type: apartment
floor: 1
area: 80 m²
rooms: 3
~~~

The Unit was subsequently rendered through the Property screen and Unit dossier.

This proves the write/read path:

~~~text
browser/API
→ application command
→ PostgreSQL canonical truth
→ query/read model
→ browser
~~~

for the core setup slice used in the smoke.

## Google OAuth and Drive acceptance

The first refresh-token attempt failed with Google's `unauthorized_client`.

The production Client ID and enabled Client Secret matched, so the failure was isolated to the OAuth client/grant relationship. The working grant was then re-established so that the Client ID, Client Secret and refresh token belonged to the same OAuth client.

A direct refresh test succeeded with:

~~~text
GOOGLE OAUTH TRIO: OK
expires_in: 3599
scope: https://www.googleapis.com/auth/drive.file
~~~

The corrected Google OAuth secrets were then updated in the Supabase project.

No OAuth credential value is committed to this repository.

## Binary storage round-trip

A small hosted Drive smoke file was uploaded through Portfolio:

~~~text
file: portfolio-smoke.txt
bytes: 29
SHA-256: eeba7c78359b536a7a62f8eabae6e9dd9cb90274e8c1a262198b5cbecbf5fccf
~~~

The returned canonical DocumentVersion was stored, then downloaded back through Portfolio.

The downloaded file had the same:

~~~text
bytes: 29
SHA-256: eeba7c78359b536a7a62f8eabae6e9dd9cb90274e8c1a262198b5cbecbf5fccf
~~~

The DocumentVersion was then finalized successfully.

This proves:

~~~text
Portfolio API
→ storage adapter
→ Google OAuth
→ Google Drive
→ canonical DocumentVersion metadata
→ Portfolio download
→ exact SHA-256 round-trip
~~~

## Inspection lifecycle acceptance

Two hosted Inspection paths were exercised.

### Unsigned schema path

A published `periodic` schema with one required text response was used to create:

~~~text
SMOKE-INSP-001
~~~

The hosted lifecycle passed:

~~~text
draft
→ start
→ save required response
→ canonical bundle reread
→ lock
→ finalize
→ immutable final snapshot
~~~

After finalization, an attempted content mutation was rejected with:

~~~text
INSPECTION_CONTENT_LOCKED
~~~

### Unsigned final report

The finalized Inspection produced one final PDF DocumentVersion:

~~~text
bytes: 4334
SHA-256: 582ca9238691381220904b57f34ffe8437e4c919c2c054ca17304f5fe1985e5c
~~~

Downloading the PDF back through Portfolio produced the exact same byte size and SHA-256.

Calling the final-report command again returned the same existing DocumentVersion:

~~~text
same version ID
same document ID
versionNumber = 1
same SHA-256
same finalizedAt
~~~

This is a real hosted idempotency proof, not only a unit/browser-harness assertion.

## Required-signature lifecycle acceptance

A second published `periodic` schema required:

~~~text
agent
~~~

and was used to create:

~~~text
SMOKE-INSP-SIG-001
~~~

The lifecycle passed:

~~~text
draft
→ start
→ save required response
→ lock
~~~

Attempting to finalize before collecting the required signature was rejected with:

~~~text
INSPECTION_REQUIRED_SIGNATURES_MISSING
Missing required inspection signatures: agent.
~~~

An Inspection-scoped signature binary was then uploaded and automatically finalized:

~~~text
file: agent-signature.txt
bytes: 23
SHA-256: 1d5469a6148692f45533d26f6800c689586aac2d3ae5486ad844b3d1324094c3
~~~

The exact final DocumentVersion was registered as the active `agent` signature.

Signature registration correctly advanced Inspection `contentRevision`:

~~~text
response save       → content r1
signature relation  → content r2
~~~

Finalization then passed and created:

~~~text
lifecycle version: 4
snapshot version: 1
snapshot source lifecycle version: 3
snapshot content revision: 2
~~~

## Signed final report acceptance

The signed immutable snapshot produced a final PDF:

~~~text
DocumentVersion: 87428d4c-0749-46eb-b616-722f902ba190
bytes: 5622
SHA-256: d983d00ef7028b154b05f8fea218d2dcd7a426dbde085945194a589b0c71558e
~~~

Downloading it back through Portfolio returned:

~~~text
bytes: 5622
SHA-256: d983d00ef7028b154b05f8fea218d2dcd7a426dbde085945194a589b0c71558e
~~~

The exact hash match closes the hosted signed chain:

~~~text
required response
→ lock
→ required signature binary
→ exact signature relation
→ immutable snapshot
→ final PDF
→ Google Drive
→ Portfolio download
→ SHA-256 integrity
~~~

## Real browser acceptance

The production React application was then run locally with:

~~~text
VITE_SUPABASE_URL=<production Supabase URL>
VITE_SUPABASE_ANON_KEY=<browser-safe publishable key>
VITE_API_BASE_URL=<hosted Portfolio API>
~~~

The real browser path passed:

~~~text
Supabase login
→ session
→ JWT
→ hosted Edge API
→ PostgreSQL
→ React dashboard
~~~

The dashboard showed the real hosted smoke state:

~~~text
SMOKE-001
Hosted Smoke Property
1 unit
0 occupied
1 vacant
~~~

The browser then navigated:

~~~text
Dashboard
→ Hosted Smoke Property
→ SMOKE-U-001
→ Unit dossier
→ Inspections
~~~

and rendered both real finalized Inspections:

~~~text
SMOKE-INSP-001       FINALIZED
SMOKE-INSP-SIG-001   FINALIZED
~~~

Opening the signed Inspection showed:

~~~text
lifecycle v4
content r2
Snapshot v1
source lifecycle v3
content r2
~~~

and the canonical final-report Evidence relation referenced the same real DocumentVersion recorded above.

After #49, clicking `Generate / reuse final report` completed in the UI and displayed the canonical existing report instead of remaining stuck on `Generating…`.

The browser therefore proves the end-to-end read/reconciliation path:

~~~text
React
→ Supabase Auth session
→ hosted Portfolio API
→ PostgreSQL / Drive
→ canonical reread
→ React state
~~~

against the real hosted environment.

## Acceptance summary

The following were proven in the real hosted environment:

| Boundary | Result |
| --- | --- |
| Supabase Edge Function boot | PASS |
| Exact embedded release identity | PASS |
| PostgreSQL connectivity/readiness | PASS |
| Supabase Auth login | PASS |
| Internal auth identity mapping | PASS |
| Authenticated API read | PASS |
| Canonical Property write/read | PASS |
| Canonical Unit write/read | PASS |
| Google OAuth refresh grant | PASS |
| Drive binary upload | PASS |
| Drive binary download | PASS |
| Binary SHA-256 round-trip | PASS |
| DocumentVersion finalization | PASS |
| Inspection create/start/save/lock | PASS |
| Immutable final snapshot | PASS |
| Post-finalization content guard | PASS |
| Required-signature guard | PASS |
| Inspection-scoped signature binary | PASS |
| Signature relation / content revision | PASS |
| Signed finalization | PASS |
| Final PDF generation | PASS |
| Final-report idempotency | PASS |
| Final PDF Drive/download hash integrity | PASS |
| Real React frontend against hosted backend | PASS |
| StrictMode Inspection completion after #49 | PASS |

## What this acceptance does not prove

This run intentionally does **not** claim completion of the following:

- public/static frontend hosting;
- production domain or TLS configuration for the web frontend;
- production `PORTFOLIO_WEB_ORIGIN` beyond the localhost acceptance origin;
- production rate/abuse/concurrency policy;
- production PostgreSQL backup destination, retention or PITR policy;
- secondary/off-site backup of Google Drive binary bytes;
- OAuth credential-rotation operations;
- monitoring/alert delivery from a production observability provider;
- multi-user production load or performance capacity.

The repository recovery rehearsal proves backup/restore mechanics separately, but that is not evidence that a production backup schedule or off-site destination is configured.

## Operational follow-up

Before real company use:

1. choose and deploy the static frontend host;
2. change `PORTFOLIO_WEB_ORIGIN` to that exact HTTPS origin;
3. build the frontend with the production Vite values;
4. rerun browser acceptance from the deployed web origin;
5. publish/productionize the Google OAuth consent/client configuration as required;
6. record production backup destination, schedule and retention;
7. decide whether Google Drive requires a secondary binary backup;
8. set platform request/upload/abuse/concurrency controls;
9. define credential rotation and incident ownership.

## Secret-handling rule

Never add any of the following to this acceptance record, issues, PR comments or test output committed to Git:

- Supabase access or refresh tokens;
- Supabase database password or full credentialed DB URL;
- Google OAuth Client Secret;
- Google OAuth refresh token;
- service-role / secret keys;
- the contents of the operator secrets file.

Safe evidence includes release SHAs, project ref, public browser-safe publishable key identifiers, canonical record IDs, byte counts and cryptographic hashes.
