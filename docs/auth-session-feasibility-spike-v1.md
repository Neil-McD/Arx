# Auth Session Feasibility Spike (Gate 1)

Status: historical feasibility spike; superseded by the implemented auth gateway path  
Scope: prove or reject server-owned session continuity for the Daytona worktree  
Precondition: [`auth-session-target-architecture-v1.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-session-target-architecture-v1.md) is the active target document

## 0) Purpose

This spike exists to answer one question only:

**Can this worktree use server-owned session continuity while still giving the browser a short-lived bearer that Convex and `/runtime` both accept directly, without creating a second auth plane?**

If the answer is no, stop.  
Do not build the auth bridge.

## 1) Irreducible Constraint

The current system works because the browser holds a bearer JWT that:

1. Convex accepts through `ctx.auth.getUserIdentity()`
2. `/runtime/*` accepts through the same verified-identity path

Ground truth:

- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.config.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.config.ts)
- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts)
- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/convexAuthenticatedClient.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/convexAuthenticatedClient.ts)

So the spike is not “can we make auth more secure somehow.”

The spike is:

**can we move session continuity out of browser JS without losing direct browser -> Convex/runtime auth compatibility?**

## 1.1) Working Hypothesis

The narrowest viable target for this repo is:

1. durable session continuity moves server-side
2. the browser receives a short-lived bearer only
3. that bearer stays in the same JWT trust family Convex already accepts
4. the browser still calls Convex and `/runtime/*` directly

If the spike cannot preserve those four properties, the target architecture is not clean for this repo.

## 2) Non-Goals

This spike does **not** decide:

1. full BFF adoption
2. final cookie/session implementation details
3. full rollout plan
4. provider-secret storage redesign
5. broad browser-session UX changes

This spike only decides whether the target architecture is viable in this repo.

## 2.1) Same-Origin Assumption

This spike assumes the auth bridge is:

1. same-origin with the web app
2. cookie-capable
3. able to hold continuity without exposing it to browser JavaScript

If the proposed bridge is cross-origin and non-cookie-backed, treat that as a major complexity penalty by default.

## 3) Required Questions

The spike must answer these questions concretely.

### Q1. Bearer Source

Where does the short-lived browser bearer come from?

Options:

1. same upstream provider-issued JWT family already trusted by Convex
2. new app-issued JWT
3. something else

### Q2. Bearer Trust

Will Convex accept that bearer directly through the current `auth.config.ts` provider setup?

### Q3. Runtime Trust

Will `/runtime/*` accept the same bearer through `requireVerifiedIdentity(...)`?

### Q4. Identity Plane

Does this preserve a single identity plane?

Meaning:

1. the browser bearer
2. Convex verified identity
3. runtime verified identity
4. actor bootstrap identity

must all refer to the same subject semantics.

### Q5. Continuity Separation

Can the browser avoid owning the durable refresh secret while still obtaining a fresh short-lived bearer when needed?

## 4) Trust Boundary Section

The spike must define the actual trust boundary, not just gesture at it.

It must state:

1. who issues the ephemeral bearer
2. who validates it
3. whether it is the same JWT family Convex already trusts
4. whether a new issuer would be introduced
5. whether that creates a second auth plane

### Acceptance rule

If the bearer is not in the same trust family Convex already accepts, the spike should treat that as a major risk and justify it explicitly.

### Current trust-family ground truth

The current accepted bearer families are configured in:

- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.config.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.config.ts)

Today this means:

1. an explicitly configured `customJwt` issuer/JWKS family from `ARX_AUTH_JWT_*`
2. WorkOS-issued JWT families derived from `ARX_AUTH_CLIENT_ID`

The spike must answer whether the proposed ephemeral bearer is:

1. the same upstream provider-issued JWT family already trusted here
2. or a new app-issued token

If it is the second, treat that as introducing a second auth plane unless disproven explicitly.

### Current validation path

The current bearer is validated through:

- Convex provider config in [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.config.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.config.ts)
- verified identity resolution in [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts)

The spike should preserve this path or explain why changing it is worth the added complexity.

## 5) Continuity Store Section

The spike must define where durable continuity would actually live.

At minimum:

1. server-side session record or encrypted continuity store
2. same-origin cookie/session handle model
3. logout semantics
4. revocation semantics
5. browser bootstrap behavior

This does not require implementation, but it must not stay hand-wavy.

### Required proposal shape

For v1, the spike should commit to one concrete continuity-store model:

1. same-origin cookie-backed session handle
2. server-side continuity record keyed by that handle
3. encrypted durable continuity inside that record
4. browser bootstrap that exchanges the cookie-backed handle for a short-lived bearer

The spike should pick a v1 shape and justify it. It should not stay generic here.

### Current-state ground truth

Today the opposite is true:

1. the browser holds `access_token` and `refresh_token`
2. the browser refreshes in JavaScript
3. the browser forwards those tokens directly to Convex and `/runtime`

Ground truth:

- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/controllers/useWebAppAuthController.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/controllers/useWebAppAuthController.ts)
- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/authCore.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/authCore.ts)
- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpAuth.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/httpAuth.ts)

## 6) Failure Mode Section

The spike must define what happens when the bridge is unavailable.

Required cases:

1. `auth/start` unavailable
2. `auth/callback` unavailable
3. `session/bootstrap` unavailable
4. `session/refresh` unavailable
5. bridge says session is revoked/expired

For each case, define:

1. fail closed or fallback
2. user-visible behavior
3. whether migration keeps the current SPA path as a temporary fallback

### Required migration posture

The spike should assume:

1. final target posture = fail closed
2. migration posture = temporary fallback to the current hardened SPA only if explicitly enabled

The spike must not assume a permanent dual-path auth model.

## 7) Experiment Design

This spike should be run as a design + proof exercise, not as a broad refactor.

### Experiment A: Current accepted JWT family

Confirm exactly which bearer families Convex currently accepts:

1. issuer(s)
2. jwks source(s)
3. audience/application id expectations
4. subject shape expectations

Source:

- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.config.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.config.ts)

### Experiment B: Runtime verified identity alignment

Confirm that `/runtime/*` is using the same bearer trust boundary as Convex mutations/queries.

Source:

- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts)

### Experiment C: Browser direct-use requirement

Confirm which client surfaces require direct browser bearer use today:

1. `ConvexHttpClient.setAuth(...)`
2. runtime HTTP endpoints
3. community/workspace helpers that depend on that bearer

Source:

- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/convexAuthenticatedClient.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/convexAuthenticatedClient.ts)
- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx)
- [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudCommunityChatGateway.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudCommunityChatGateway.ts)

### Experiment D: Continuity extraction viability

Determine whether the auth bridge could:

1. hold refresh token continuity server-side
2. obtain a fresh short-lived bearer from the same upstream provider
3. return it to the browser without changing the Convex trust family

If yes, the target remains viable.

If no, the target is blocked.

### Experiment E: Memory-Only Bearer Viability

Determine whether the browser can operate with:

1. memory-only short-lived bearer as the default
2. no persisted browser continuity
3. bootstrap rehydration through the bridge on reload

If not, the spike must explain the minimum persistence compromise required and why.

## 8) Go / No-Go Criteria

### Go

Proceed only if all of these are true:

1. browser can receive a short-lived bearer in the same trust family Convex already accepts
2. `/runtime/*` accepts that same bearer directly
3. no second auth plane is introduced
4. durable continuity can stay server-side
5. logout/revocation semantics remain coherent

### No-Go

Stop and keep the hardened SPA posture if any of these are true:

1. bridge would need to mint a new unrelated app JWT family
2. Convex and `/runtime` would no longer share the same bearer semantics
3. browser would still need the durable refresh secret in practice
4. bridge failure modes would be materially worse than the current posture

## 9) Concrete Spike Output

The spike output should contain these sections explicitly:

1. **Trust Boundary**
   - issuer of ephemeral bearer
   - validator of ephemeral bearer
   - same-JWT-family or new-family answer
   - single-auth-plane conclusion
2. **Continuity Store**
   - same-origin requirement
   - cookie/session-handle model
   - server-side continuity record
   - logout/revocation semantics
3. **Failure Mode**
   - start/callback/bootstrap/refresh/logout failure behavior
   - migration fallback posture
4. **Gate 1 Result**
   - `GO` or `NO-GO`
   - explicit reason

## 10) Deliverable

The output of this spike should be a short decision memo with:

1. current trust family summary
2. proposed ephemeral bearer source
3. continuity-store model
4. failure-mode table
5. explicit `GO` or `NO-GO`

## 11) Current Recommendation

Until this spike is completed:

1. keep the current hardened SPA posture
2. do not build the auth bridge
3. do not widen the current browser token model again

The spike is the gate. Not the implementation.
