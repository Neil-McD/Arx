# Authentication Foundation Plan v1

Status: draft  
Scope: identity, account auth, provider connections, gating inputs  
Non-goal: community UX redesign

## 1) Irreducible Model

The platform should derive all access from four truths:

1. `Identity`
   - anonymous session
   - authenticated Polynet account
2. `Account tier`
   - free
   - builder
3. `Provider connections`
   - none
   - `user_key`
   - `user_chatgpt`
4. `Requested action`
   - public chat
   - authenticated cloud chat
   - tool-capable run
   - community action

Everything else should be a projection.

## 2) Current Position

### What is coherent

1. Verified Convex identity is the intended root of authenticated access in [`convex/authIdentity.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/authIdentity.ts).
2. Provider connections are account-scoped, not community-scoped, in [`convex/providerConnections.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/providerConnections.ts).
3. The tier model is now collapsed to `free | builder` in [`convex/auth.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.ts) and [`convex/schema.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/schema.ts).
4. The canonical gate matrix already expresses the right runtime truth in [`docs/auth-money-access-matrix.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-money-access-matrix.md).
5. Daytona remains a Builder-only execution entitlement, which is correct for the product.

### What is still drifted

1. `Identity namespace drift`
   - Browser-facing APIs still overload `userId` to mean public `authSubject` in [`convex/auth.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.ts) and [`shared/convexAuthenticatedClient.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/convexAuthenticatedClient.ts).
   - Server domain code often uses `userId` to mean internal Convex `_id`.
   - One name is carrying two meanings.

2. `Fallback security drift`
   - `ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT` weakens the trust boundary in [`convex/authIdentity.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/authIdentity.ts).
   - That may be useful for migration/dev, but it is not the clean production posture.

3. `Anonymous materialization drift`
   - Anonymous sessions are materialized into `users` rows via `auth:bootstrapActor`.
   - That is workable, but it blurs “guest session” and “account” semantics.

4. `Auth propagation drift`
   - The client sends both bearer token and explicit `authSubject`.
   - The server verifies them, which is good, but the contract is more redundant than necessary.

5. `Community auth/access drift`
   - Workspace has a canonical gate engine.
   - Community still lacks an equivalent single canonical access bundle.

6. `Behavioral runtime drift`
   - Free authenticated chat is still partially collapsing into Builder tool behavior on the send path.
   - That is captured separately in [`docs/free-builder-runtime-boundary-plan-v1.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/free-builder-runtime-boundary-plan-v1.md).

## 3) Canonical Auth Contract

### Identity

1. `authSubject` is the only browser-facing user identity.
2. Internal Convex user `_id` is server-only.
3. Anonymous identity is session-scoped and should never be confused with an authenticated account.

### Authentication

1. Authenticated requests must be verified by Convex auth.
2. Explicit `authSubject` from the client is advisory only.
3. In production posture, verified identity wins and unverified fallback should be off.

### Provider connections

1. ChatGPT and OpenRouter connections belong to authenticated Polynet accounts only.
2. Provider connection ownership keys off internal user `_id`.
3. Community membership must never grant or imply provider connection access.

### Gating inputs

Every gate decision should consume:

1. `authState`
2. `authSubject`
3. `canonicalTier`
4. `provider connection presence`
5. `requested action`

No gate should depend on a parallel client-only identity concept.

## 4) Desired End State

### Anonymous

- can use public demo chat
- cannot connect providers
- cannot access authenticated cloud runtime
- cannot create communities

### Authenticated Free

- has a verified Polynet account
- can connect ChatGPT and OpenRouter
- can use authenticated cloud chat
- cannot use Daytona tools

### Builder

- has all authenticated free capabilities
- can use platform-funded premium inference
- can use Daytona tools
- can create communities

## 5) What To Delete

1. Delete browser-facing overload of `userId` when the value is actually `authSubject`.
2. Delete any production dependence on unverified `authSubject` fallback.
3. Delete any implication that provider connections can exist without authenticated account ownership.
4. Delete any client logic that treats account auth and community access as the same thing.

## 6) Execution Plan

### Phase 1: Lock identity naming

Goal: one meaning per identifier.

Changes:

1. Replace browser-facing `userId` with `authSubject` in returned actor/bootstrap payloads and client contexts where the value is actually public identity.
2. Keep internal Convex `_id` server-only unless there is a strong reason to expose it.
3. Audit all browser-facing gateways and helper types for this naming drift.

Acceptance:

1. `authSubject` means public identity everywhere outside the server domain.
2. `userId` means internal user row only where server code actually uses it that way.

### Phase 2: Harden verified-auth posture

Goal: make verified identity the default truth.

Changes:

1. Explicitly document `ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT` as dev/migration-only.
2. Audit where it is still needed.
3. Remove or contain any production dependency on that fallback.

Acceptance:

1. Real authenticated requests require verified Convex identity.
2. Fallback posture is no longer a hidden production dependency.

### Phase 3: Clean actor bootstrap contract

Goal: simplify how the browser establishes identity.

Changes:

1. Make `auth:bootstrapActor` and `auth:getActor` return a clean identity payload:
   - `authSubject`
   - `canonicalTier`
   - `effectiveTier`
   - profile fields
2. Stop returning browser-facing `userId` aliases that are actually public identity values.
3. Reconcile any dependent client code in:
   - [`shared/convexAuthenticatedClient.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/convexAuthenticatedClient.ts)
   - related cloud gateways

Acceptance:

1. Auth bootstrap becomes easier to reason about.
2. Client/server identity mismatch risk is reduced.

### Phase 4: Separate account auth from community access

Goal: establish the correct layering for the next phase.

Changes:

1. Keep account authentication as the root prerequisite.
2. Build a canonical community access bundle on top of authenticated identity and membership truth.
3. Make chat, members, resources, and landing consume that bundle.

Acceptance:

1. Account auth and community access become clearly distinct systems.
2. Community gating no longer invents its own parallel identity assumptions.

### Phase 5: Align runtime entrypoints

Goal: make runtime usage respect the cleaned auth model.

Changes:

1. Apply the free-vs-builder runtime boundary plan.
2. Ensure provider-backed free chat stays chat-only.
3. Ensure Builder-only Daytona requests remain tool-only and authenticated.

Acceptance:

1. Auth, tier, funding, and runtime lane all line up.

## 7) First Slice

The first slice should be small and foundational:

1. Rename browser-facing `userId` payloads that are actually `authSubject`
2. update `shared/convexAuthenticatedClient.ts` to expect `authSubject`, not overloaded `userId`
3. audit the direct downstream callers of actor/bootstrap payloads
4. keep runtime behavior unchanged in this slice

Why this first:

- it removes a core source of confusion
- it improves correctness without broad product changes
- it sets up the later access and runtime cleanup cleanly

## 8) Blind Spots

1. Some app code may have started depending on the overloaded `userId` shape indirectly.
2. Anonymous bootstrap currently creates user rows, so changing naming without revisiting guest semantics may leave conceptual debt in place.
3. Community access drift will remain even after identity cleanup until a canonical community access bundle exists.
4. The free-vs-builder send-path drift is separate and still needs its own implementation slice.

## 9) Outcome

After this plan:

- authentication becomes a clean root layer again
- tier and provider connections sit on top of a stable identity contract
- community access can be rebuilt on top of that contract
- runtime gating becomes much easier to reason about
