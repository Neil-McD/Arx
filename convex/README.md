# Convex Runtime + Data Layer

This folder is the canonical backend surface for Daytona. Runtime/product paths are now Convex-first (no legacy function/RPC transport in active code paths).

## Included

1. `schema.ts`
2. `auth.ts` (actor bootstrap + entitlement-backed tier resolution)
3. `gates.ts` (canonical gate resolver contract)
4. `entitlements.ts` (read queries)
5. `projects.ts` (read queries)
6. `threads.ts`
7. `community.ts`
8. `billing.ts`
9. `profiles.ts`
10. `personalMemory.ts`
11. `modelRegistry.ts`
12. `settings.ts`
13. `httpRuntimeRoutes.ts` (canonical runtime HTTP routes: public turn, authenticated runtime turn, voice, community context)
14. `probe.ts` (`probe:health` query for boot verification)
15. `../convex.json` (Convex functions root)

## Setup

0. Quickstart template:
   - copy `.env.convex.quickstart.example` to `.env` and fill required values.
1. Add `VITE_CONVEX_URL` in repo-root `.env`.
2. Configure OAuth/OIDC env for runtime auth routes:
   - `ARX_AUTH_AUTHORIZE_URL` (required for sign-in)
   - `ARX_AUTH_TOKEN_URL` (required for code exchange + refresh)
   - `ARX_AUTH_CLIENT_ID` (required)
   - `ARX_AUTH_CLIENT_SECRET` (optional)
   - `ARX_AUTH_SCOPE` (optional; defaults to `openid profile email offline_access`)
   - `ARX_AUTH_AUDIENCE` (optional)
   - `ARX_AUTH_PROVIDER_QUERY_KEY` (optional)
   - `ARX_AUTH_LOGOUT_URL` (optional)
   - `ARX_AUTH_MAGIC_LINK_URL` (optional)
   - WorkOS/AuthKit example:
     - `ARX_AUTH_AUTHORIZE_URL=https://<AUTHKIT_DOMAIN>/oauth2/authorize`
     - `ARX_AUTH_TOKEN_URL=https://<AUTHKIT_DOMAIN>/oauth2/token`
     - `ARX_AUTH_CLIENT_ID=<AUTHKIT_CLIENT_ID>`
3. Configure Convex JWT provider env (recommended):
   - `ARX_AUTH_JWT_ISSUER` (required)
   - `ARX_AUTH_JWT_JWKS_URL` (required or derivable from issuer)
   - `ARX_AUTH_JWT_AUDIENCE` (optional but recommended)
   - `ARX_AUTH_JWT_ALGORITHM` (`RS256` default)
   - `ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT=false` (recommended; dev/test-only override, fail closed on missing verified identity)
   - WorkOS/AuthKit example:
     - `ARX_AUTH_JWT_ISSUER=https://<AUTHKIT_DOMAIN>`
     - `ARX_AUTH_JWT_JWKS_URL=https://<AUTHKIT_DOMAIN>/oauth2/jwks`
   - These same OAuth envs are also used by the remote PolyNet MCP surface to serve
     `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`
     for hosted MCP auth discovery.
4. Validate auth env readiness:
   - `npm run check:auth-runtime-readiness`
5. Authenticate Convex CLI (`npx convex login`) if not already logged in.
6. Deploy functions:
   1. `npm run convex:dev` (during development), or
   2. `npm run convex:deploy` (for hosted deployment).
7. Confirm probe in browser console:
   - `[convex] probe:health ok ...`

## Auth Migration Preflight

Use the auth migration preflight audit before switching AuthKit/WorkOS tenants if
you need to preserve existing paid users, memberships, credits, and history on
the same local `users._id`.

Run:

```bash
npm run audit:auth-migration -- --prod
```

Auth:

1. required: `ARX_AUTH_MIGRATION_AUDIT_SECRET`

The audit is read-only and classifies users into:

1. `safe_auto_relink`
2. `manual_duplicate_email`
3. `manual_missing_email`
4. `manual_other`

It skips anonymous `anon:*` rows and treats duplicate normalized email across
authenticated rows as manual by default. The relink path trusts the incoming
verified AuthKit identity, so legacy rows do not need to already be marked
verified if the stored normalized email is unique.

Operator tools:

```bash
npx convex run authContinuityProbe:inspectAuthContinuity '{"secret":"...","email":"founder@example.com"}' --prod
```

Use the backfill before auth cutover so `users.normalizedEmail` is populated.
Use the trusted-history repair before auth cutover so legacy rows missing stored
email can still be matched automatically when historical account evidence is
unambiguous.
Use the manual relink mutation only for edge cases where automatic relink must
fail closed.

## Remaining Hardening Work

1. Broaden end-to-end parity tests across all journeys (auth, threads, community, billing, voice).
2. Continue runtime/auth/community behavior hardening and failure-mode validation.
3. Prune obsolete migration-era docs/guards once cutover confidence is fully locked.

## Goal

Define canonical read contracts first so the web surface and runtime routes can migrate with minimal drift.
