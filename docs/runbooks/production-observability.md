# Production observability and alerting

## Scope

Portfolio production observability is deliberately split across two failure domains:

1. an external HTTP probe of `/health/ready`, which can detect database/dependency failure even when application telemetry cannot be written;
2. a read-only Supabase Management API Logs query over structured Edge Function logs.

No monitoring table is written on the request path. A 429/5xx burst therefore does not amplify database load just to record that the system is under stress.

## Schedule

The GitHub Actions workflow `.github/workflows/production-observability.yml` runs every 15 minutes and can also be started manually.

It inspects a 20-minute log window on a 15-minute cadence. The deliberate five-minute overlap removes deterministic gaps and also tolerates modest GitHub Actions schedule delay. Duplicate observation across adjacent runs is acceptable because alerting uses one persistent incident issue.

## Signals and thresholds

Default alert thresholds:

~~~text
/health/ready != 200/ready           → immediate alert
http.unexpected_error >= 1 / 20 min  → alert
Drive/storage/reconciliation >= 1    → alert
HTTP 5xx >= 3 / 20 min               → alert
RATE_LIMIT_EXCEEDED >= 10 / 20 min   → alert
HTTP 401 >= 20 / 20 min              → alert
~~~

Generic HTTP 5xx is measured from `function_edge_logs` using the actual `/functions/v1/api` invocation path and response status, so boot/runtime/platform failures are visible even when Portfolio application code cannot emit a console event. Application-specific signals remain on `function_logs` for richer Portfolio error codes and event names.

The storage category includes document storage failures, binary integrity/missing failures, and inspection/document reconciliation-required errors.

The rate-limit threshold is intentionally higher than one event: an isolated 429 is expected behavior when a client crosses a configured limit; a repeated burst is the operational signal.

Authentication failures are similarly aggregated. The workflow does not copy raw user identifiers, JWTs, request bodies, or complete production log events into GitHub.

## Incident lifecycle

If any threshold is crossed, readiness fails, or the Supabase Logs API itself cannot be queried, the workflow:

~~~text
writes an aggregate Markdown summary
→ opens one [Production Alert] Portfolio observability issue
  or comments on the existing open issue
→ fails the Actions run
~~~

When a later run is healthy, the workflow comments with the recovery run URL and closes the open incident issue.

This gives a persistent incident trail without introducing another monitoring SaaS. GitHub Actions/Issues availability is therefore part of this MVP alerting dependency.

## Structured API log contract

Production API logs already contain:

~~~text
timestamp
service
event
requestId
method
path
status
durationMs
errorCode (when available)
~~~

PR #56 additionally tags each default production log line with `releaseSha`, sourced from the exact embedded API service version. This allows a production failure to be correlated with the deployed backend bytes rather than merely with the repository's current `main`.

## Required secret

Configure one GitHub Actions repository secret:

~~~text
SUPABASE_OBSERVABILITY_ACCESS_TOKEN
~~~

Use a Supabase scoped personal access token restricted to project `fiowxgamyjjcondlheqg` with **Logs: Read** only. Do not reuse a broad deployment/admin token when scoped tokens are available.

The monitor calls:

~~~text
GET https://api.supabase.com/v1/projects/<ref>/analytics/endpoints/logs
~~~

with an aggregate ClickHouse SQL query. The token is never sent to the Portfolio API or frontend.

## Hosted acceptance

Repository/CI acceptance requires:

~~~text
observability policy self-test PASS
Typecheck/unit/release gates PASS
workflow syntax committed on main
~~~

Hosted acceptance requires, after merge:

~~~text
scoped Logs: Read token configured
→ manual Production Observability run on main
→ /health/ready PASS
→ logs aggregate query PASS
→ healthy run SUCCESS
~~~

Then perform one controlled negative proof without touching business data, for example temporarily running the checker with an intentionally low threshold against a known existing test signal, or another reversible test mechanism. The production workflow must open/update the incident issue and a subsequent healthy run must close it.

Until both the healthy run and alert/recovery lifecycle are exercised in production, classify #56 as `IMPLEMENTED BUT NOT HOSTED-PROVEN`.

## Boundaries

This monitor does not replace Supabase platform health/status, GitHub's own availability monitoring, full APM tracing, or a dedicated on-call paging service.

It is intentionally the smallest production layer that detects Portfolio readiness failure and meaningful application error patterns before a user has to report them.
