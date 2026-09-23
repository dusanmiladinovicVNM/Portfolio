# Observability and health contract

Portfolio uses provider-neutral structured HTTP telemetry. The application does not depend on a logging vendor.

## Request correlation

Every API request receives an `x-request-id`.

A caller-supplied ID is accepted only when it is short and log-safe. Otherwise the server generates a UUID. The same ID is forwarded into the application HTTP boundary, returned on the HTTP response, emitted in the structured request log, and attached to unexpected-error diagnostics.

This allows an operator to connect a browser-visible failure with one concrete server request without logging request bodies, authorization headers, JWTs or binary content.

## Structured request event

Each request emits one completion/failure event with:

~~~text
timestamp
service
level
event
requestId
method
path
status
durationMs
errorCode (when the HTTP response exposes one)
~~~

Status mapping: 2xx/3xx = info, 4xx = warn, 5xx = error.

Known operational failures such as `DOCUMENT_STORAGE_RECONCILIATION_REQUIRED` therefore remain machine-searchable by both request ID and domain/application error code.

Successful binary response bodies are not inspected for logging.

## Health endpoints

~~~text
GET /functions/v1/api/health/live
GET /functions/v1/api/health/ready
~~~

Liveness proves only that the API process can answer HTTP. It deliberately does not query PostgreSQL.

Readiness executes a minimal PostgreSQL probe. A failed dependency check returns HTTP 503 with `SERVICE_NOT_READY`. Dependency exception details are not returned to callers.

Health endpoints do not require a user session. They expose no secrets, schema details or provider error text.

## What is intentionally not included

This contract does not choose a log vendor, metrics backend, tracing platform or alerting service. Deployment can route the JSON lines to whichever operational platform is selected later without changing application semantics.
