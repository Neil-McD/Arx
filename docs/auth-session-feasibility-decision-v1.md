# Auth Session Feasibility Decision (Gate 1)

Status: active decision memo  
Scope: decide whether the Daytona worktree can adopt server-owned session continuity without creating a second auth plane

## Decision

**GO, with constraints.**

This worktree can support:

**server-owned session continuity + browser-held ephemeral bearer**

without introducing a second auth plane, **if** the browser bearer remains in the same upstream JWT trust family that Convex already accepts.

The design is **not** viable if v1 requires minting a new app-issued JWT family.

## 1) Irreducible Question

The only question that mattered for Gate 1 was:

**Can the browser obtain a short-lived bearer that Convex and `/runtime/*` both accept directly, while durable continuity moves out of browser JavaScript?**

From the current code, the answer is **yes**.

## 2) Why The Answer Is Yes

### A. Convex already trusts upstream provider JWT families directly

Ground truth in [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.config.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.config.ts):

1. Convex accepts an explicitly configured `customJwt` issuer/JWKS family from `ARX_AUTH_JWT_*`
2. Convex also accepts WorkOS-issued JWT families derived from `ARX_AUTH_CLIENT_ID`

That means Convex does **not** require a browser-minted app token today. It already trusts upstream JWTs directly.

### B. `/runtime/*` uses the same verified-identity boundary

Ground truth in [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts):

1. `/runtime/*` requires a bearer token
2. it resolves identity through `ctx.auth.getUserIdentity()`
3. it treats that result as the canonical verified identity

So `/runtime/*` and normal Convex auth are on the **same** bearer trust path already.

### C. The server already knows how to get fresh upstream tokens

Ground truth in [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpAuth.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpAuth.ts):

1. `/runtime/auth_exchange_pkce_code` already exchanges an auth code with the upstream provider
2. `/runtime/auth_refresh_session` already exchanges a refresh token with the upstream provider
3. for WorkOS, the path already switches to the WorkOS authenticate endpoint

This is the key proof.

The server side is already capable of obtaining fresh provider-issued access tokens. Today it just forwards that result back to the browser together with refresh continuity. In the target model, it would keep continuity server-side and return only the ephemeral bearer.

### D. The browser already uses the upstream access token directly for both Convex and runtime

Ground truth:

- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/convexAuthenticatedClient.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/convexAuthenticatedClient.ts)
- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudCommunityChatGateway.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudCommunityChatGateway.ts)

Today the browser:

1. sets the access token directly on `ConvexHttpClient`
2. uses the same session-derived token for live community chat clients
3. uses the same token family for `/runtime/*`

So the browser does not need a different token type. It needs the **same** token type, just without owning durable continuity.

## 3) Trust Boundary

### Current trust boundary

Today:

1. upstream provider issues bearer JWT
2. browser holds both bearer and refresh continuity
3. Convex validates the bearer through configured `customJwt` providers
4. `/runtime/*` validates the same bearer through `ctx.auth.getUserIdentity()`

### Target trust boundary

In the recommended target:

1. upstream provider still issues the bearer JWT
2. auth bridge obtains/refreshes it
3. browser receives only the short-lived bearer
4. Convex validates it through the same configured providers
5. `/runtime/*` validates it through the same verified-identity path

### Single-auth-plane conclusion

This remains a **single auth plane** if and only if:

1. the bridge returns the same upstream JWT family Convex already trusts
2. the system does **not** introduce a new app-issued JWT as the browser bearer

If a new app-issued JWT is introduced, Gate 1 becomes a **NO-GO** unless the repo explicitly chooses to operate two auth planes.

## 4) Continuity Store

### Recommended v1 model

The clean v1 continuity store is:

1. same-origin HTTP-only secure cookie containing a bridge session handle
2. server-side continuity record keyed by that handle
3. encrypted durable continuity stored in that record
4. bridge-owned logout/revocation truth

The continuity record should hold:

1. upstream refresh token or equivalent continuity secret
2. provider metadata
3. stable subject / user linkage
4. last-refresh bookkeeping
5. revocation / invalidation status

### Why this is the right v1

It is the smallest model that:

1. removes the durable secret from browser JS
2. preserves browser-direct Convex/runtime traffic
3. avoids a full BFF
4. keeps the bridge same-origin and cookie-capable

## 5) Browser Bearer Model

### Recommended default

The browser bearer should be:

1. short-lived
2. memory-first
3. rehydrated through `session/bootstrap` on reload

### Allowed compromise

If memory-only creates unacceptable UX during migration, a **conscious** `sessionStorage` fallback can exist temporarily.

But the target posture should remain:

**browser bearer is ephemeral, not durable continuity**

## 6) Failure Mode

### `auth/start` unavailable

Behavior:

1. fail closed
2. sign-in cannot begin
3. user sees explicit auth-start failure

### `auth/callback` unavailable

Behavior:

1. fail closed
2. no continuity record is created
3. user remains signed out

### `session/bootstrap` unavailable

Final target posture:

1. fail closed
2. browser cannot silently reconstruct continuity on its own
3. user sees session restore failure and can retry

Migration posture:

1. temporary fallback to current hardened SPA path only if explicitly enabled behind migration logic
2. no permanent dual-path assumption

### `session/refresh` unavailable

Behavior:

1. current in-memory bearer continues until expiry
2. once expired, authenticated traffic should fail cleanly
3. user can retry refresh/bootstrap or re-authenticate

### continuity revoked / expired

Behavior:

1. bridge clears continuity record
2. browser bootstrap/refresh returns revoked/expired
3. browser clears auth state and returns to signed-out posture

## 7) Constraints

This `GO` result is only valid under these constraints:

1. **Same JWT family**
   - browser bearer must remain in the same upstream trust family Convex already accepts
2. **No second auth plane**
   - no custom app-issued browser JWT in v1
3. **Same-origin bridge**
   - bridge must be same-origin and cookie-capable
4. **Bridge owns continuity**
   - browser must stop owning the durable refresh secret

## 8) What This Does Not Solve

This does **not** eliminate XSS risk.

If the browser holds a live short-lived bearer, XSS can still act as the user for that bearer lifetime.

What it does do is reduce blast radius by moving **durable continuity** out of browser JavaScript.

## 9) No-Go Conditions

This decision should be reversed to **NO-GO** if implementation discovery shows any of these are required:

1. minting a new custom browser JWT that Convex does not already trust
2. proxying most app traffic through the bridge
3. keeping refresh continuity in browser JS anyway
4. permanent fallback to the current SPA path

## 10) Recommendation

### Best current posture

Keep the hardened SPA as the live system until the bridge exists.

### Best target posture

Proceed toward:

**server-owned session continuity + browser-held ephemeral bearer**

### Next step

Do **not** implement the full bridge yet.

Next do the bridge v1 spec:

1. exact endpoint contracts:
   - `auth/start`
   - `auth/callback`
   - `session/bootstrap`
   - `session/refresh`
   - `session/logout`
2. cookie/session-handle model
3. continuity record schema
4. migration sequence from hardened SPA to bridge-owned continuity
