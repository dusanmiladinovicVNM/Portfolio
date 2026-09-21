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
