# ADR 0007: External authentication, internal authorization

**Status:** Accepted

## Decision

Authentication-provider identity and Portfolio user identity are separate concepts.

Portfolio stores:

- a stable internal `app_users.id`;
- one or more `auth_identities(provider, subject)` rows that map verified external identities to that user.

Supabase Auth is the MVP authentication provider. It does not become the domain identity model.

The request trust chain is:

```
browser Supabase session
→ Bearer access token
→ Supabase verifies token
→ verified provider + subject
→ auth_identities
→ active app_users row
→ internal Actor
→ capability check
→ aggregate / assignment invariant
→ PostgreSQL
```

Caller-supplied JWT role/custom claims do **not** grant Portfolio business permissions.

## Staff roles and capabilities

Initial staff roles:

- `admin`
- `manager`
- `inspector`

Admin and manager receive the complete internal capability set.

Inspector is intentionally read-mostly.

Inspector may read:

- Portfolio / reporting projections
- Parties
- Ownership
- Tenancy
- Contracts
- Documents
- Inspections and published Inspection schemas
- Assets
- Warranty / Service history
- Improvements
- Maintenance
- Access Items
- Meters

Inspector may write only:

- assigned/self-owned Inspection field workflow through `inspections:write`;
- MeterReading and MeterReadingBoundary append operations through
  `meter_readings:write`.

Inspector may not write:

- Portfolio master data
- Parties
- Ownership
- Tenancy
- Contracts
- global Documents
- Inspection schemas
- Assets
- Warranty / Service administration
- Improvements
- Costs
- Maintenance
- Access Items
- Meter master data

The executable capability matrix is frozen by application tests. Expanding inspector
permissions therefore requires an explicit code + test change rather than silently
changing one route.

## Inspection assignment boundary

`inspections:write` is deliberately broader than a generic read-only inspector role,
but it is not global Inspection administration.

For an inspector:

```
Inspection read/write
→ exact Inspection.assignedToUserId == Actor.userId
```

and orchestration assignment may only resolve to the inspector themself.

Admin/manager-only terminal administration remains explicit for:

- controlled unlock;
- finalization.

Inspection-scoped binary upload uses the same exact assignment boundary and does not
grant `documents:write`.

## Meter field-write boundary

The Meter model deliberately allows an inspector to append physical observations and
Tenancy boundary links:

- `meter_readings:write`

while denying Meter identity/lifecycle changes:

- no `meters:write`.

There is no Meter-assignee domain grain in the MVP, so this is a global field capability,
not an omitted ownership check.

## Reporting and Cost visibility

Reporting endpoints are authorized by `portfolio:read`.

Therefore an inspector may see the existing Unit/Portfolio reporting aggregates,
including Cost totals grouped by currency.

That is intentionally different from direct Cost-ledger access:

```
reporting aggregate
→ portfolio:read

Cost entity / ledger query
→ costs:read
```

Inspector does not have `costs:read`.

If future product policy requires financial aggregates to be hidden from inspectors,
that is a capability/response-policy change and must not be implemented as accidental
UI hiding.

## Database / PostgREST boundary

Business authorization lives in the application layer.

The PostgreSQL connection used by the Portfolio API is trusted server-side
infrastructure. Browser Supabase roles must not be able to bypass application
authorization through direct table, view or RPC access.

Release hardening therefore requires:

- every Portfolio business table in `public` has RLS enabled;
- browser roles `anon` and `authenticated` have no direct business
  table/view DML or SELECT privileges;
- reporting RPC functions are not executable by browser roles;
- public-schema CREATE is unavailable to browser roles;
- `unit_business_events` is `security_invoker`, so accidental future grants
  cannot turn the owner-created view into an RLS bypass;
- default privileges keep future tables, sequences and functions closed to PUBLIC
  and Supabase browser roles.

The database integration suite checks the complete public-schema surface, not only
selected tables.

## Browser credential boundary

The web application may contain only a Supabase browser-safe anon/publishable key.

Startup rejects:

- `sb_secret_...` keys;
- legacy JWT keys whose role is `service_role`;
- any JWT API key whose role is not `anon`.

Portfolio business requests use the Supabase user access token only as:

```
Authorization: Bearer <access token>
```

and explicitly use `credentials: 'omit'`.

Ambient browser cookies are not an authentication input to Portfolio API requests.

To prevent configuration-driven token exfiltration, `VITE_API_BASE_URL` must be
either:

- a root-relative path; or
- an absolute URL with the same origin as `VITE_SUPABASE_URL`.

A cross-origin API target is rejected before the web application boots.

The server verifies the access token and uses only its verified subject to resolve the
internal Actor.

## Failure semantics

Authentication and authorization fail closed:

- no verified identity → HTTP 401;
- verified external identity without an active internal Portfolio user → HTTP 401;
- active Actor without the required capability → HTTP 403;
- inspector requesting an Inspection assigned to another user → HTTP 403.

Disabling an internal `app_users` row therefore takes effect on the next Portfolio
request even if the external Supabase session is still valid.

## Consequences

- `auth.users.id` is not used as a foreign key throughout the business model;
- switching Auth provider does not require rewriting business foreign keys;
- disabling an internal Portfolio user takes effect independently of the external account;
- transport code cannot grant business permissions by trusting caller-supplied role claims;
- UI visibility is not an authorization mechanism;
- direct PostgREST/RPC access is not a supported business API;
- a leaked browser anon/publishable key does not grant Portfolio business-data access;
- a privileged Supabase secret/service key must never be shipped in the web bundle;
- capability expansion is an explicit reviewed security change.
