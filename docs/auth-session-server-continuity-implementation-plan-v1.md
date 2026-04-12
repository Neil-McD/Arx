# Auth Session Server Continuity Implementation Plan v1

Status: historical implementation plan; largely realized and later renamed in the live codebase  
Scope: migrate Polynet auth from browser-owned continuity to server-owned continuity without creating a second auth plane  
Goal: irreducibly simple, scalable, reliable, robust, and secure web auth for Convex + `/runtime/*`

## 0) Irreducible Decision

The correct target is:

**server-owned session continuity + browser-held ephemeral bearer**

That means:

1. the browser stops owning the durable refresh secret
2. the browser keeps only a short-lived bearer plus in-memory UX state
3. the auth gateway owns continuity and cookie posture
4. Convex and `/runtime/*` continue to trust the same upstream JWT family they already trust

Hard rule:

1. do **not** introduce a second app-issued JWT family for browser traffic

## 1) Current Ground Truth

### Browser continuity today

Current implementation:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/authCore.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/authCore.ts)
2. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx)

Current browser-owned secrets/state:

1. `access_token`
2. `refresh_token`
3. `expires_at`
4. user snapshot
5. PKCE verifier/state

Current browser storage keys:

1. `arx_cloud_session:active`
2. `arx_cloud_session:pkce`

### Server auth today

Current upstream auth proxy surface:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpAuth.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpAuth.ts)

Current server capabilities:

1. build upstream authorize URL
2. exchange auth code for upstream session
3. refresh upstream session
4. forward logout upstream

### Existing trust plane

The important constraint remains:

1. Convex and `/runtime/*` already trust the upstream provider JWT family directly
2. keep that
3. do not mint a second browser JWT family

## 2) Target Topology

The target topology is:

1. `polynet.ai`
2. `green.polynet.ai`
3. `preview.polynet.ai`

Signed-in surfaces should live under `*.polynet.ai`.

Non-goal:

1. making `polynet-green.vercel.app` a first-class shared-auth surface

Why:

1. `.polynet.ai` cookie continuity is simple
2. `vercel.app` preview continuity is cross-site complexity

## 3) Target Component Model

### A. Web auth gateway

New same-origin app server surface:

1. `GET /api/auth/google/start`
2. `GET /api/auth/google/callback`
3. `GET /api/auth/session`
4. `POST /api/auth/refresh`
5. `POST /api/auth/logout`

This surface owns:

1. cookie issuance/clearing
2. PKCE continuity
3. browser bootstrap contract
4. server-owned session continuity

### B. Convex session store

Convex remains the system of record for durable auth continuity.

It should own:

1. session id
2. auth subject
3. encrypted refresh token
4. session metadata
5. revocation / rotation state

### C. Browser app

The browser should own only:

1. in-memory bearer
2. in-memory user snapshot
3. tab-local UX state

It should stop owning:

1. refresh token
2. durable session continuity
3. PKCE verifier/state

## 4) Exact File Plan

## Phase 0: Topology and env

### Required operational change

1. create `green.polynet.ai`
2. route it to the same Vercel project as `green`

### Required env additions

Root/server envs:

1. `ARX_AUTH_BRIDGE_SECRET`
2. `ARX_AUTH_SESSION_COOKIE_NAME`
3. `ARX_AUTH_SESSION_COOKIE_DOMAIN`
4. `ARX_AUTH_SESSION_TTL_SECONDS`

No new browser auth env should be required if auth stays same-origin on `*.polynet.ai`.

### File touches

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/.env.example`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/.env.example)
2. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/.env.example`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/.env.example)
3. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/README.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/README.md)

## Phase 1: Convex server-owned session store

### Add new table

In [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/schema.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/schema.ts):

Add `authSessions` with fields:

1. `sessionId`
2. `authSubject`
3. `userId`
4. `provider`
5. `encryptedSecretHex`
6. `secretIvHex`
7. `secretVersion`
8. `expiresAt`
9. `lastRefreshAt`
10. `revokedAt`
11. `createdAt`
12. `updatedAt`
13. optional cached identity fields:
   - `email`
   - `displayName`
   - `avatarUrl`

Indexes:

1. `by_sessionId`
2. `by_user`
3. `by_authSubject`
4. `by_authSubject_revokedAt`

### Add session store module

Create:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/authSessions.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/authSessions.ts)

This module should provide:

1. `createAuthSession`
2. `getAuthSessionById`
3. `touchAuthSession`
4. `rotateAuthSessionRefreshToken`
5. `revokeAuthSession`
6. `deleteExpiredAuthSessions` if needed later

### Reuse existing encryption seam

Do **not** invent new crypto.

Reuse encryption helpers from:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/providerConnections.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/providerConnections.ts)

Specifically:

1. `encryptSecret`
2. `decryptStoredSecret`

That keeps secret storage consistent across the repo.

## Phase 2: Convex auth bridge endpoints

### Why this layer exists

There is no current server-to-Convex admin seam in the repo.

So the simplest correct bridge is:

1. Vercel auth gateway reads cookie
2. Vercel auth gateway calls Convex bridge endpoints server-to-server
3. Convex bridge endpoints own session persistence and upstream token refresh

### New route module

Create:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpAuthBridge.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpAuthBridge.ts)

Register it from:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts)

### New internal routes

Add server-only routes:

1. `POST /runtime/auth_bridge_session_create`
2. `POST /runtime/auth_bridge_session_bootstrap`
3. `POST /runtime/auth_bridge_session_refresh`
4. `POST /runtime/auth_bridge_session_logout`

### Bridge auth

Protect these routes with:

1. `X-Arx-Auth-Bridge-Secret`

using `ARX_AUTH_BRIDGE_SECRET`.

These routes are not browser-facing.

### Route responsibilities

`session_create`

1. accept upstream session payload after auth code exchange
2. encrypt refresh token
3. persist `authSessions`
4. return:
   - `sessionId`
   - short-lived access token
   - user snapshot

`session_bootstrap`

1. accept `sessionId`
2. load session record
3. if upstream bearer still valid enough, return it
4. otherwise refresh upstream using stored refresh token
5. persist rotation/timestamps
6. return short-lived bearer + user snapshot

`session_refresh`

1. same as bootstrap, but explicitly called when browser bearer is stale

`session_logout`

1. revoke upstream if possible
2. revoke local session record
3. return success whether upstream logout succeeds or not

## Phase 3: Web-domain auth gateway

### New files

Create:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/_cookies.js`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/_cookies.js)
2. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/_bridge.js`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/_bridge.js)
3. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/google/start.js`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/google/start.js)
4. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/google/callback.js`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/google/callback.js)
5. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/session.js`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/session.js)
6. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/refresh.js`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/refresh.js)
7. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/logout.js`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/api/auth/logout.js)

### Cookie rules

The session cookie stores only:

1. opaque `sessionId`

Cookie posture:

1. `HttpOnly`
2. `Secure`
3. `Path=/`
4. `SameSite=Lax`
5. `Domain=.polynet.ai` only if all participating subdomains are same-trust

### PKCE continuity

Do **not** persist PKCE in browser storage anymore.

Use a short-lived, signed, same-origin auth-start cookie to hold:

1. `state`
2. `codeVerifier`
3. `returnTo`
4. `createdAt`

This is simpler than adding a second DB table for short-lived PKCE state.

### Endpoint responsibilities

`GET /api/auth/google/start`

1. generate PKCE verifier/challenge
2. generate `state`
3. set short-lived PKCE continuity cookie
4. call Convex `/runtime/auth_begin_google_sign_in`
5. redirect browser to upstream `auth_url`

`GET /api/auth/google/callback`

1. validate PKCE continuity cookie + callback `state`
2. call Convex `/runtime/auth_exchange_pkce_code`
3. call Convex bridge `session_create`
4. set opaque session cookie
5. clear PKCE cookie
6. redirect back to app route

`GET /api/auth/session`

1. read opaque session cookie
2. if missing, return `{ ok: true, session: null }`
3. call Convex bridge `session_bootstrap`
4. return short-lived bearer + user snapshot

`POST /api/auth/refresh`

1. read opaque session cookie
2. call Convex bridge `session_refresh`
3. return short-lived bearer + user snapshot

`POST /api/auth/logout`

1. read opaque session cookie
2. call Convex bridge `session_logout`
3. clear opaque session cookie
4. return success

## Phase 4: Browser auth client migration

### Main file

Refactor:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/authCore.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/authCore.ts)

### What to delete

Delete browser-owned continuity:

1. `CLOUD_SESSION_STORAGE_KEY`
2. `CLOUD_PKCE_STORAGE_KEY`
3. `readPersistedCloudSessionRecord`
4. `persistCloudSessionRecord`
5. `clearPersistedCloudSessionRecord`
6. `readPendingPkceState`
7. `persistPendingPkceState`
8. `clearPendingPkceState`
9. client-side `code_verifier` continuity
10. browser-supplied `refresh_token` refresh path

### What to replace it with

`beginOAuthSignIn`

1. stop building PKCE in the browser
2. redirect browser to `/api/auth/google/start`

`bootstrapSession`

1. call `GET /api/auth/session`
2. return session JSON or `null`

`refreshAuthSessionResult`

1. call `POST /api/auth/refresh`
2. do not send a refresh token

`logoutAuthSessionRemote`

1. call `POST /api/auth/logout`
2. do not rely on browser-held access token for continuity cleanup

### What stays

Keep:

1. `CloudSession` type
2. JWT decode helpers
3. short-lived in-memory session shape
4. request wrappers that attach the current bearer

## Phase 5: App bootstrap simplification

### Main file

Refactor:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx)

### What to delete

Delete browser callback orchestration:

1. `parseCloudOAuthCallbackFromLocation(...)` handling
2. `completeCloudOAuthCallback(...)` boot path
3. `resolveCanonicalGoogleAuthStartUrl(...)` complexity that only exists to jump between origins
4. auth-flow pending markers that only protect the old browser-PKCE flow

### What to keep

Keep:

1. bootstrapping current session on load
2. sign-in button
3. signed-out marker UX if still useful

### New sign-in behavior

`handleSignIn()`

1. navigate browser to `/api/auth/google/start?return_to=<current path>`

After callback:

1. server sets cookie
2. server redirects back
3. app boots through `GET /api/auth/session`

## Phase 6: Verification and cleanup

### Update docs

Update:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-spa-posture-v1.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-spa-posture-v1.md)
2. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-target-architecture-v1.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-target-architecture-v1.md)

The SPA posture should become:

1. historical / current-live migration source

not the target.

### Update verification

Add or update checks so they prove:

1. browser no longer persists refresh token continuity
2. auth gateway files exist
3. Convex bridge files exist
4. `authCore.ts` no longer references PKCE/session storage continuity

Likely scripts to update:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/scripts/auth_env_contract_guard.sh`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/scripts/auth_env_contract_guard.sh)
2. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/scripts/auth_runtime_readiness_check.sh`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/scripts/auth_runtime_readiness_check.sh)

### Canonical verification order

1. `npm run convex:codegen`
2. `npm run check:auth-env-contract-guard`
3. `npm run check:auth-runtime-readiness`
4. `npm run check:runtime-turn-contract-guard`
5. `npm run build`

### End-to-end auth checks

1. sign in on `polynet.ai`
2. refresh page, remain signed in
3. open `green.polynet.ai`, already signed in
4. logout on one surface, signed out on all `*.polynet.ai` app surfaces after refresh
5. expired upstream continuity refreshes server-side without browser storage continuity

## 5) Rollout order

The safest sequence is:

1. land Convex `authSessions` table and bridge endpoints
2. land web auth gateway endpoints
3. land browser migration behind a temporary switch if needed
4. cut `green` to `green.polynet.ai`
5. remove old browser continuity code
6. update docs and guards

Do **not** do this in reverse.

## 6) Deletions

If this migration succeeds, the following should disappear from the browser auth model:

1. browser-held refresh token continuity
2. browser-held PKCE verifier persistence
3. `localStorage` / `sessionStorage` auth continuity bootstrap
4. origin-local auth island assumptions
5. `VITE_AUTH_REDIRECT_URL` as a core browser auth dependency

## 7) Non-goals

This plan does **not** do the following:

1. full BFF for normal app traffic
2. second app-issued browser JWT family
3. cross-site continuity hacks for `vercel.app`
4. replacing Convex as runtime bearer verifier

## 8) Best first tranche

The smallest real first implementation tranche is:

1. add `authSessions` in Convex
2. add Convex bridge endpoints
3. add `GET /api/auth/session`, `POST /api/auth/refresh`, `POST /api/auth/logout`
4. switch `authCore.ts` bootstrap/refresh/logout to those routes
5. leave OAuth start/callback browser flow alone temporarily only if needed for migration speed

That tranche already removes the worst part:

1. browser-owned durable refresh continuity

Then OAuth start/callback and PKCE can move server-side in tranche two.
