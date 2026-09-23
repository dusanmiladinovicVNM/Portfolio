# Production deployment enablement

This runbook turns a green Portfolio release candidate into a deployable Supabase MVP environment. It assumes the repository release gate has already passed for the exact commit being deployed.

## 1. Production dependencies

Required external services:

- one Supabase project for Auth, PostgreSQL and Edge Functions;
- one dedicated Google account / OAuth client with access to the Portfolio Drive folder;
- one static web host for the Vite build.

Portfolio keeps business authorization in PostgreSQL. Supabase Auth proves external identity only.

## 2. Link the Supabase project

~~~bash
supabase login
supabase link --project-ref <project-ref>
~~~

Do not edit production schema manually in the Dashboard. Apply the canonical migrations:

~~~bash
supabase db push
~~~

## 3. Google Drive OAuth

The production host uses an OAuth refresh token to obtain short-lived Drive access tokens. Use a dedicated Portfolio Google account rather than a personal account.

The OAuth grant must have access to the configured folder and sufficient Drive scope for Portfolio to create, search, read and delete its own objects. Keep the folder dedicated to Portfolio. Before real production use, move the Google OAuth consent/client setup out of Testing into the appropriate production/published state; Testing-mode refresh-token lifetime is not an acceptable operational dependency for Portfolio.

Set these Edge Function secrets:

~~~text
PORTFOLIO_GOOGLE_DRIVE_FOLDER_ID
PORTFOLIO_GOOGLE_CLIENT_ID
PORTFOLIO_GOOGLE_CLIENT_SECRET
PORTFOLIO_GOOGLE_REFRESH_TOKEN
~~~

The adapter caches only the short-lived access token in the function isolate and refreshes it before expiry. OAuth error bodies are not exposed in application responses.

## 4. Edge Function runtime configuration

Supabase supplies `SUPABASE_DB_URL` to hosted functions. Set:

~~~text
PORTFOLIO_RELEASE_SHA=<exact git commit being deployed>
PORTFOLIO_WEB_ORIGIN=https://<actual-web-origin>
PORTFOLIO_GOOGLE_DRIVE_FOLDER_ID=...
PORTFOLIO_GOOGLE_CLIENT_ID=...
PORTFOLIO_GOOGLE_CLIENT_SECRET=...
PORTFOLIO_GOOGLE_REFRESH_TOKEN=...
PORTFOLIO_READINESS_TIMEOUT_MS=1000   # optional
~~~

Use `supabase/functions/.env.example` only as a template. Never commit the real values.

Deploy custom secrets using the Supabase Dashboard or CLI, for example:

~~~bash
supabase secrets set --env-file <production-secrets-file>
~~~

## 5. Function auth boundary

`supabase/config.toml` deliberately sets:

~~~toml
[functions.api]
verify_jwt = false
~~~

This is required because `/health/live` and `/health/ready` are public. The external browser URL is `/functions/v1/api/...`, while Supabase invokes the function with the internal runtime prefix `/api/...`; the production adapter therefore sets `basePath: '/api'`. It does **not** make business routes anonymous: the Portfolio host calls `createSupabaseContext({ auth: 'user' })` for every non-health route, then resolves the verified subject through `auth_identities` before application authorization.

The CORS adapter also permits browser calls only from `PORTFOLIO_WEB_ORIGIN`.

## 6. Deploy the API

The function imports shared source outside `supabase/functions`, so use API-based deployment:

~~~bash
supabase functions deploy api --use-api
~~~

Then verify:

~~~text
GET https://<project-ref>.supabase.co/functions/v1/api/health/live  → 200
GET https://<project-ref>.supabase.co/functions/v1/api/health/ready → 200
~~~

The health payload must report the same `PORTFOLIO_RELEASE_SHA` that passed the release gate.

## 7. Bootstrap the first Portfolio admin

Create the first user in Supabase Auth before running the bootstrap. Copy that user's stable Auth user UUID / JWT subject.

The bootstrap is intentionally one-time. It acquires transaction-scoped `SHARE ROW EXCLUSIVE` locks on `app_users` and `auth_identities`, verifies the Supabase Auth subject inside that transaction, and refuses to run if either internal table already contains rows. Concurrent bootstrap attempts therefore serialize and only one can cross the empty-state boundary.

~~~bash
export SUPABASE_DB_URL='<operator database connection URL>'
export PORTFOLIO_ADMIN_SUBJECT='<Supabase Auth user UUID/sub>'
export PORTFOLIO_ADMIN_DISPLAY_NAME='Portfolio Admin'
export PORTFOLIO_ADMIN_EMAIL='admin@example.com'
pnpm bootstrap:first-admin
~~~

After this point, do not rerun the first-admin bootstrap. Future staff administration should use an explicit supported workflow rather than direct SQL.

## 8. Web production build

Set:

~~~text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<browser-safe publishable/anon key>
VITE_API_BASE_URL=https://<project-ref>.supabase.co/functions/v1/api
~~~

`VITE_API_BASE_URL` should be absolute in production unless the web host has an explicit reverse proxy for `/functions/v1/api`.

Build:

~~~bash
pnpm --filter @portfolio/web build
~~~

Deploy only the generated static web output to the chosen host.

## 9. Production smoke

Run in this order:

~~~text
health/live
→ health/ready
→ sign in as bootstrapped admin
→ authenticated read
→ create/read one low-risk canonical record
→ upload/download one small binary
→ complete one inspection final report
→ verify Drive object + canonical DocumentVersion hash/size
→ verify structured logs contain requestId + release SHA context
~~~

Delete or clearly label smoke data according to the business policy; do not manually mutate canonical rows to hide a failed smoke.

## 10. PDF boundary

`CanonicalInspectionPdfRenderer` emits a valid dependency-free PDF containing the complete immutable final snapshot. Non-ASCII code points are rendered as explicit `\\uXXXX` / `\\u{...}` text rather than being silently dropped or transliterated. This prioritizes evidence fidelity for the first MVP deployment; a later presentation-focused renderer may improve typography without changing the canonical snapshot or report workflow.

## 11. Production-only decisions still required

Before real company use, record explicit decisions for:

- edge/platform request, upload and abuse/concurrency limits;
- PostgreSQL backup destination, schedule and retention;
- whether Google Drive durability alone is accepted for MVP or a secondary binary backup is required;
- operational ownership of OAuth credential rotation and incident response.

These are deployment policy decisions, not missing domain invariants.

## Deno compatibility note

The canonical monorepo TypeScript uses Node-ESM `.js` specifiers from `.ts` source. The Edge Function `deno.json` enables Deno `sloppy-imports` solely as a compatibility bridge so the hosted Deno runtime can consume that canonical source without maintaining a second generated copy.

CI runs `deno check` against the real function entrypoint and uses a committed frozen `deno.lock`. A green CI proves Deno resolution/type compatibility for the exact source revision, but the first real `supabase functions deploy api --use-api` remains an environment-level deployment rehearsal and must be completed before production use.

This bridge is deployment debt, not a domain/application convention. A later Fastify/Node host removes it naturally without changing business code.
