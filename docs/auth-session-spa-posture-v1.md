# Auth Session SPA Posture V1

Status: historical pre-server-continuity posture; superseded by the current auth gateway implementation  
Scope: Daytona web app browser-owned Polynet session continuity  
Goal: one simple auth plane for web-native runtime access

Migration note:

1. This document describes the current live system.
2. It is not the recommended end state.
3. The migration plan toward server-owned continuity is:
   - [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-server-continuity-implementation-plan-v1.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-server-continuity-implementation-plan-v1.md)

## 0) Irreducible Posture

The auth system has exactly two responsibilities:

1. The browser owns Polynet session continuity.
2. The backend owns runtime authorization.

That means:

1. the browser may hold the upstream refresh token for Polynet auth
2. the browser refreshes the session directly through runtime auth endpoints
3. Convex and `/runtime/*` continue to verify bearer tokens directly
4. entitlements, Daytona access, communities, and runtime lanes remain server-authored

## 1) Canonical Browser Flow

1. Browser starts OAuth with PKCE by calling `/runtime/auth_begin_google_sign_in`.
2. Browser stores PKCE verifier/state in `sessionStorage`.
3. Browser completes OAuth by calling `/runtime/auth_exchange_pkce_code`.
4. Browser persists session continuity in `sessionStorage`.
5. Browser refreshes via `/runtime/auth_refresh_session`.
6. Browser logs out locally and may call `/runtime/auth_logout_session` best-effort.

## 2) Canonical Storage Rules

For Polynet auth continuity, the browser stores:

1. `access_token`
2. `refresh_token`
3. `expires_at`
4. `user`

Storage rules:

1. Use `sessionStorage`, not `localStorage`, for session continuity.
2. PKCE verifier/state is also session-scoped.
3. Sign-out clears all `arx_cloud_session:*` browser continuity keys.
4. Stale sign-out markers must not override a valid persisted session during bootstrap.

## 3) Server Boundary

The server remains authoritative for:

1. bearer verification
2. actor resolution
3. entitlements
4. funding source resolution
5. Daytona access
6. community access
7. runtime lane and capability family selection

Canonical files:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts)
2. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpAuth.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpAuth.ts)
3. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpRuntimeRoutes.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpRuntimeRoutes.ts)

## 4) Explicit Non-Goals

This posture does not do the following:

1. no same-origin auth bridge
2. no cookie-owned session continuity
3. no second app-issued auth plane
4. no proxying normal app traffic through a BFF

## 5) Separate Provider Boundary

This document is only about Polynet auth.

Provider credentials for external agent runtimes should remain separate from browser-owned Polynet session continuity.

## 6) Source Of Truth

Implementation surface:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/authCore.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/authCore.ts)
2. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/controllers/useWebAppAuthController.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/controllers/useWebAppAuthController.ts)
3. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx)

Verification:

1. `npm run check:auth-runtime-readiness`
2. `npm run check:runtime-turn-contract-guard`
3. `npm --prefix apps/web run build`
