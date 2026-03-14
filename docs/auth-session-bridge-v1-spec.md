# Auth Session Bridge V1 Spec

Status: superseded by `auth-session-spa-posture-v1.md`  
Scope: same-origin bridge for server-owned session continuity in the Daytona web app  
Preconditions:

This document is preserved as historical design context only.  
The active implementation posture is browser-owned SPA continuity in [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-spa-posture-v1.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-spa-posture-v1.md).

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-target-architecture-v1.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-target-architecture-v1.md)
2. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-feasibility-spike-v1.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-feasibility-spike-v1.md)
3. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-feasibility-decision-v1.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-feasibility-decision-v1.md)

## 0) Purpose

This spec defines the smallest bridge that moves **session continuity** out of browser JavaScript while preserving:

1. direct browser -> Convex auth
2. direct browser -> `/runtime/*` auth
3. the existing single verified-identity plane

This is **not** a full BFF spec.

## 1) Irreducible Decision

The bridge exists for one reason only:

**the browser should stop owning the durable refresh secret**

The bridge does **not** exist to:

1. proxy normal app traffic
2. replace Convex authorization
3. replace runtime authorization
4. invent a second auth plane

## 2) Current Constraint

The web app today is a static Vite app deployed on Vercel with no same-origin app server surface.

Ground truth:

- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/package.json`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/package.json)
- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/vercel.json`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/vercel.json)
- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/README.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/README.md)

So the bridge cannot “just live somewhere.”  
It needs a real same-origin insertion point.

## 3) Chosen Insertion Point

### V1 insertion point

Use **app-origin API routes** under the web deployment surface.

Recommended shape:

1. `apps/web/api/auth/start`
2. `apps/web/api/auth/callback`
3. `apps/web/api/session/bootstrap`
4. `apps/web/api/session/refresh`
5. `apps/web/api/session/logout`

### Why this is the right insertion point

It gives us:

1. same-origin cookie capability
2. browser-visible auth routes on the same app domain
3. no need to overload Convex HTTP auth endpoints with continuity ownership
4. no need to proxy ordinary app traffic

### Why Convex HTTP is not the right bridge layer

The existing Convex auth endpoints in [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpAuth.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpAuth.ts) are currently:

1. browser-token forwarding helpers
2. not cookie-backed
3. not same-origin continuity owners in the app-server sense

They can stay as transitional/runtime surfaces, but they should **not** be the long-term continuity bridge.

## 4) Trust Boundary

### Durable continuity owner

The bridge owns:

1. refresh token or equivalent upstream continuity secret
2. continuity lifetime
3. revocation state
4. logout truth

### Browser owner

The browser owns:

1. short-lived access token only
2. user snapshot
3. tab-local auth UX state

### Convex/runtime owner

Convex and runtime continue to own:

1. bearer validation
2. verified identity
3. actor bootstrap
4. all access control

### Hard rule

The bridge must return a bearer in the **same JWT trust family** Convex already accepts.

## 5) Continuity Store Model

### Cookie

Set one same-origin HTTP-only secure session cookie, for example:

- `arx_bridge_session`

Required cookie posture:

1. `HttpOnly`
2. `Secure`
3. `SameSite=Lax` by default
4. path `/`
5. explicit max age / expiry

### Server-side record

The cookie stores only an opaque session handle.

The backing record stores:

1. `sessionId`
2. `authSubject`
3. `provider`
4. encrypted `refreshToken`
5. `createdAt`
6. `updatedAt`
7. `lastRefreshAt`
8. `expiresAt` if provider continuity is bounded
9. `revokedAt`
10. optional metadata:
   - email
   - displayName
   - avatarUrl

### Storage requirement

The continuity store must be:

1. server-side
2. encrypted at rest for refresh continuity
3. revocable without browser cooperation

V1 does **not** need to decide the final datastore vendor, but it must not store continuity in browser JS.

## 6) Browser Bearer Model

### Default

The browser bearer should be:

1. short-lived
2. memory-first
3. rehydrated via `session/bootstrap` on page load

### Transitional fallback

If needed during migration, the browser may temporarily keep the short-lived bearer in `sessionStorage`, but:

1. not the refresh token
2. not the durable continuity
3. not as the final posture

## 7) Endpoint Contracts

## `POST /api/auth/start`

Purpose:

1. create OAuth redirect state
2. set any bridge pre-auth cookie state needed
3. return authorize URL

Request:

```json
{
  "provider": "google",
  "redirect_to": "https://app.example.com"
}
```

Response:

```json
{
  "ok": true,
  "auth_url": "https://..."
}
```

Notes:

1. browser no longer needs to own PKCE verifier long-term if the bridge owns callback exchange
2. if PKCE is still used, the bridge should own verifier/state continuity

## `GET /api/auth/callback`

Purpose:

1. consume provider callback
2. perform code exchange server-side
3. create continuity record
4. set bridge session cookie
5. redirect back to app

Required behavior:

1. no tokens in URL passed through to app
2. no refresh token returned to browser

## `POST /api/session/bootstrap`

Purpose:

1. exchange bridge cookie-backed continuity for fresh short-lived bearer
2. return current user snapshot

Request:

```json
{}
```

Response:

```json
{
  "ok": true,
  "session": {
    "access_token": "<short-lived bearer>",
    "expires_at": 1710000000,
    "user": {
      "id": "user_x",
      "email": "name@example.com",
      "displayName": "Name",
      "avatarUrl": "https://..."
    }
  }
}
```

Hard rule:

1. no refresh token in the response

## `POST /api/session/refresh`

Purpose:

1. use server-held continuity to obtain fresh short-lived bearer
2. return same response shape as bootstrap

Request:

```json
{}
```

Response:

Same as `session/bootstrap`.

Hard rule:

1. no refresh token in the response

## `POST /api/session/logout`

Purpose:

1. revoke or clear continuity record
2. clear bridge cookie
3. optionally forward logout upstream if needed

Request:

```json
{
  "scope": "local"
}
```

Response:

```json
{
  "ok": true
}
```

## 8) Failure Mode

### `auth/start` unavailable

Behavior:

1. fail closed
2. no partial sign-in state should remain active indefinitely

### `auth/callback` unavailable

Behavior:

1. fail closed
2. no continuity record is created
3. app returns to signed-out state

### `session/bootstrap` unavailable

Final posture:

1. fail closed
2. app cannot silently rehydrate from browser continuity because browser no longer owns it

Migration posture:

1. optional temporary fallback to current hardened SPA only behind explicit migration flag
2. no permanent dual-path support

### `session/refresh` unavailable

Behavior:

1. app continues until current bearer expires
2. then authenticated requests fail cleanly
3. user can retry bootstrap or re-authenticate

### continuity revoked

Behavior:

1. bootstrap/refresh returns revoked/expired
2. browser clears auth state
3. app returns to signed-out posture

## 9) Browser Changes Required

### Remove

Eventually remove from browser JS:

1. refresh token persistence
2. refresh token usage
3. PKCE continuity ownership

### Keep

Keep in browser:

1. short-lived access token usage for Convex/runtime
2. user snapshot
3. auth UX state

### Adapt

The browser auth client should change from:

1. `auth_exchange_pkce_code`
2. `auth_refresh_session`

to:

1. `session/bootstrap`
2. `session/refresh`

with callback completion moved to the bridge.

## 10) Migration Sequence

### Phase 1

Add bridge routes and continuity store without changing the live SPA path.

### Phase 2

Switch callback completion to bridge-owned continuity creation.

### Phase 3

Switch browser bootstrap/refresh to bridge endpoints.

### Phase 4

Remove browser refresh-token ownership.

### Phase 5

Remove transitional fallback to current hardened SPA auth path.

## 11) Success Criteria

The bridge v1 is successful if:

1. browser no longer receives or stores refresh token continuity
2. browser still authenticates directly to Convex and `/runtime/*`
3. Convex and runtime still share the same verified-identity plane
4. sign-in, reload, refresh, and logout remain premium-feeling
5. no full app proxy is introduced

## 12) Non-Goals

This spec does **not** include:

1. full BFF traffic proxying
2. provider-secret storage redesign beyond bridge continuity needs
3. custom app-issued JWT work
4. cross-origin bridge architecture

## 13) Recommendation

This is the right v1 direction.

It is:

1. simpler than a full BFF
2. stronger than the current hardened SPA
3. compatible with the current Convex trust model
4. explicit about where the new complexity actually lives

The next step after this spec is **not** broad implementation.  
It is choosing the concrete bridge runtime for `apps/web`:

1. Vercel serverless / edge routes
2. another same-origin app server surface

without changing the bearer family or introducing a second auth plane.
