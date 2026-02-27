# Convex Scaffold (Phase 1 Bootstrap)

This folder is now bootstrapped for runtime probing, but it still does not replace Supabase yet.

## Included

1. `schema.ts`
2. `entitlements.ts` (read queries)
3. `projects.ts` (read queries)
4. `threads.ts` (read queries)
5. `probe.ts` (`probe:health` query for boot verification)
6. `../convex.json` (Convex functions root)

## Setup

1. Add `VITE_CONVEX_URL` in repo-root `.env`.
2. Authenticate Convex CLI (`npx convex login`) if not already logged in.
3. Deploy functions:
   1. `npm run convex:dev` (during development), or
   2. `npm run convex:deploy` (for hosted deployment).
4. Confirm probe in browser console:
   - `[convex] probe:health ok ...`

## Not Included Yet

1. Mutations/writes for production entities
2. Billing webhooks migration
3. Runtime event write path migration
4. Auth provider integration glue for user identity resolution

## Goal

Define canonical read contracts first so web and desktop can migrate with parity and minimal drift.
