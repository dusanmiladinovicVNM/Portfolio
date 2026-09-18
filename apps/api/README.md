# API

MVP HTTP transport will run as Supabase Edge Functions (TypeScript/Deno).

This directory represents the deployable API boundary. Application/domain code lives in workspace packages so the transport can later move to Fastify/Node.

Supabase's current Edge Functions runtime is Deno-compatible; runtime-specific code must remain here or in infrastructure adapters, never in the domain package.
