# Web

React + TypeScript + Vite client.

The web app is intentionally not scaffolded in the architecture bootstrap commit. The first UI is introduced only after the Portfolio domain/application contract is stable.

Rules:

- components do not call database tables directly for business mutations;
- server state goes through typed application/API clients;
- Supabase client details, when needed for auth/session bootstrap, stay in infrastructure-facing modules;
- page code must not coordinate multi-record transactions.
