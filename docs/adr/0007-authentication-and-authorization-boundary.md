# ADR 0007: External authentication, internal authorization

**Status:** Accepted

## Decision

Authentication-provider identity and Portfolio user identity are separate concepts.

Portfolio stores:

- a stable internal `app_users.id`;
- one or more `auth_identities(provider, subject)` rows that map verified external identities to that user.

Supabase Auth is the MVP authentication provider. It does not become the domain identity model.

## Authorization

Business authorization lives in the application layer.

Initial staff roles:

- `admin`
- `manager`
- `inspector`

Initial Portfolio capabilities:

- `portfolio:read`: admin, manager, inspector
- `portfolio:write`: admin, manager

Transport/provider code verifies the external credential and supplies a `VerifiedIdentity`. The application resolves that identity to an active internal Actor and enforces capabilities.

## Consequences

- `auth.users.id` is not used as a foreign key throughout the business model;
- switching Auth provider does not require rewriting business foreign keys;
- disabling an internal Portfolio user takes effect independently of the external account;
- transport code cannot grant business permissions by trusting caller-supplied role claims.
