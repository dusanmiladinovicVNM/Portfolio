# Web

React + TypeScript + Vite client for the internal Portfolio workspace.

## Boundary

The browser owns presentation, navigation and the external Supabase auth session. It does **not** own Portfolio authorization or business persistence.

```text
React UI
   ↓
typed Portfolio API client
   ↓
@portfolio/http
   ↓
application
   ↓
domain
```

Rules:

- React never writes business tables through Supabase/PostgREST.
- Business reads and writes go through Portfolio HTTP endpoints.
- Successful API payloads are parsed with `@portfolio/contracts` schemas.
- Supabase in the browser is limited to external authentication/session concerns.
- Portfolio roles and capabilities remain server-side truth resolved through `auth_identities → app_users`.
- Page components do not coordinate multi-record business transactions.

## Configuration

- `VITE_SUPABASE_URL` — Supabase project URL.
- `VITE_SUPABASE_ANON_KEY` — public browser key used for authentication.
- `VITE_API_BASE_URL` — optional Portfolio API prefix; defaults to `/functions/v1/api`.

No service-role/database secret belongs in the web bundle.

## Current slice

The first commit establishes the React/Vite package, production build gate,
Supabase session gateway, authenticated shell and typed bearer-token Portfolio
HTTP transport. Portfolio dashboard and Unit dossier data are the next vertical
slice.


## Navigation state

Workspace identity and reporting context live in the browser URL, not in
transient React DTO state:

```text
/dashboard?asOf=2025-06-30
/properties/<propertyId>?asOf=2025-06-30
/properties/<propertyId>/units/<unitId>?tab=overview&asOf=2025-06-30
```

Rules:

- `propertyId`, `unitId`, dossier `tab` and reporting `asOf` are URL-owned
  navigation state.
- Dashboard → Property → Unit drill-down preserves the same `asOf`.
- Changing `asOf` in Unit Overview updates the same route-level context.
- Property and Unit DTOs are fetched from canonical HTTP reads after navigation;
  they are not carried as route identity.
- `popstate` restores Back/Forward navigation and a refresh can reconstruct the
  workspace from the URL.
- Production hosting must rewrite these application routes to `index.html` so
  direct deep links load the Vite shell before client-side route restoration.


## Party identity resolution

Tenancy and Agreement records keep Party IDs as canonical references. The web
client resolves the small set needed by the active lifecycle surface through a
single batch `GET /parties?id=...&id=...` read. It does not fetch one Party per
row and it does not load the global Party register merely to resolve names.
