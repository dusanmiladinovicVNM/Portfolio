# Deployment and rollback runbook

This runbook defines the release procedure. Exact provider commands remain deployment-platform specific.

## Preconditions

Do not deploy a commit unless exact-head CI is green, all required SQL migrations are present, backup/restore rehearsal is green, required production roles/secrets exist, storage and PostgreSQL credentials are available, the release SHA is recorded, and the deployment edge/platform has explicit request, upload and abuse/concurrency limits appropriate for the production environment.

## Deploy

~~~text
known green commit
→ take/verify production DB backup using backup-restore.md
→ apply SQL migrations in timestamp order
→ start API with release commit SHA as serviceVersion
→ GET /health/live
→ GET /health/ready
→ authenticated read smoke
→ reversible low-risk write/read smoke when appropriate
→ verify structured logs contain requestId + expected status
→ release web client
~~~

A liveness success with readiness failure is not a successful deployment.

## Migration failure

If a migration fails: stop; do not continue later migrations; keep the application version compatible with current DB state; capture the failing migration and exact release SHA; decide forward-fix vs restore based on whether the migration committed.

Never manually edit production rows merely to make the migration runner green.

## Application rollback

Application rollback is safe only when the previous application version is compatible with the already-applied database schema. If migrations are additive/compatible, route traffic to the previous known-good commit, then verify liveness, readiness and an authenticated smoke.

If a migration introduced an incompatible schema/state transition, application rollback alone is insufficient. Use database recovery to a backup whose application/migration provenance is known.

## Database recovery

Follow `backup-restore.md`. After restore verify `/health/ready = 200`, canonical repository reads, security/ACL assumptions, and DocumentVersion storage references.

A PostgreSQL restore does not restore Google Drive binary bytes.

## Release failure evidence

Capture release SHA, requestId, HTTP status, errorCode, UTC timestamp, affected aggregate/business identifier when known, and operator action taken.

Do not copy JWTs, authorization headers, binary payloads or secrets into incident notes.
