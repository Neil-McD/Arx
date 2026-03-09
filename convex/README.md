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
13. `http.ts` (runtime compatibility routes: turn, lane inference, voice, community context)
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
4. Validate auth env readiness:
   - `npm run check:auth-runtime-readiness`
5. Authenticate Convex CLI (`npx convex login`) if not already logged in.
6. Deploy functions:
   1. `npm run convex:dev` (during development), or
   2. `npm run convex:deploy` (for hosted deployment).
7. Confirm probe in browser console:
   - `[convex] probe:health ok ...`

## Remaining Hardening Work

1. Broaden end-to-end parity tests across all journeys (auth, threads, community, billing, voice).
2. Continue runtime/auth/community behavior hardening and failure-mode validation.
3. Prune obsolete migration-era docs/guards once cutover confidence is fully locked.

## Goal

Define canonical read contracts first so the web surface and runtime routes can migrate with minimal drift.
