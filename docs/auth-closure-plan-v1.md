# Authentication Closure Plan v1

Status: draft
Scope: auth foundation, auth-adjacent contracts, deletion plan
Non-goal: community membership implementation

## 1) Irreducible Model

The platform auth layer should reduce to four truths:

1. `Identity`
   - anonymous session
   - authenticated Polynet account
2. `Account tier`
   - free
   - builder
3. `Provider ownership`
   - none
   - authenticated account-owned provider connections
4. `Requested action`
   - public chat
   - authenticated cloud chat
   - tool run
   - community action

Everything else should be a projection over those four truths.

## 2) What Is Already Coherent

1. Verified identity is still the intended trust root in [`convex/authIdentity.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/authIdentity.ts).
2. Browser-facing auth payloads now use `authSubject` instead of overloading `userId` in [`convex/auth.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.ts) and [`shared/convexAuthenticatedClient.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/convexAuthenticatedClient.ts).
3. Internal user ownership still keys off Convex `users._id`, which is the correct server-only ownership key.
4. Provider connections are account-scoped, not community-scoped, in [`convex/providerConnections.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/providerConnections.ts).
5. Tier semantics are simplified to `free | builder` in [`convex/gates.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/gates.ts), [`convex/auth.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.ts), and [`docs/auth-money-access-matrix.md`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-money-access-matrix.md).

## 3) Remaining Drift

### Drift A: verified-auth posture is still soft

[`convex/authIdentity.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/authIdentity.ts) still allows `ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT`.

That means the platform still supports this weaker posture:

1. no verified Convex identity
2. explicit client `authSubject`
3. request still accepted

That is useful for dev or migration.
It is not a clean production posture.

### Drift B: anonymous sessions still materialize durable user rows

[`convex/auth.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/auth.ts) still inserts `users` rows for anonymous actors through `bootstrapActor`.

That is workable, but it mixes:

1. guest runtime session
2. durable account actor

This increases surface area for analytics, cleanup, and future membership rules.

### Drift C: redundant identity propagation still exists in shared gateways

Several shared gateways still accept a `userId` param even though they ignore it and bootstrap from verified session state anyway.

Examples:

1. [`shared/cloudUserSettingsGateway.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudUserSettingsGateway.ts)
2. parts of [`shared/useWebMemoryMutationController.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebMemoryMutationController.ts)
3. parts of [`shared/useWebMemorySettingsDataController.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebMemorySettingsDataController.ts)

This is not a security hole by itself.
It is contract sprawl and confusion.

### Drift D: auth intent surface is broad and mixed

[`shared/cloudAuthIntent.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudAuthIntent.ts) currently stores many auth-gated resumptions in one system:

1. provider connect
2. community join/request flows
3. builder checkout
4. payouts onboarding
5. profile save
6. personal memory CRUD

This is useful, but it means the auth boundary also acts as a workflow queue.
That is not necessarily wrong, but it is broader than pure authentication.

### Drift E: profile and settings APIs still expose old caller contracts

Some gateway functions still accept caller-supplied ids where the authenticated actor should be sufficient.

Examples:

1. [`shared/cloudProfilesGateway.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudProfilesGateway.ts)
2. [`shared/cloudUserSettingsGateway.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudUserSettingsGateway.ts)

The repo is partly cleaned already, but the client contract still carries dead or redundant identity fields.

### Drift F: auth and runtime still meet at one major behavioral blur

Authenticated non-public sends still default to `requiresTools: true` in [`shared/useWebSendFlowController.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebSendFlowController.ts).

This is not core auth verification drift.
But it is auth-adjacent product drift because it makes:

1. authenticated free
2. builder

behave too similarly at runtime request entry.

It should stay in the auth closure sequence because it affects the meaning of authenticated access.

## 4) What To Delete

These are the highest-signal deletions:

1. Delete production dependence on `ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT`.
2. Delete redundant browser/client `userId` parameters where verified `authSubject` already determines the actor.
3. Delete dead compatibility branches that still normalize `architect` and `pro` in auth-adjacent client input surfaces once stored data and callers are clean.
4. Delete auth-gate copy or flow assumptions that imply authenticated cloud usage is always Builder-grade.
5. Delete any auth-adjacent gateway argument that is ignored or only used for mismatch checks without adding real value.

## 5) What To Keep

These parts are structurally correct and should stay:

1. Verified Convex identity as the trust root.
2. `authSubject` as the only browser-facing account identity.
3. Internal `users._id` as the server-only ownership key.
4. Provider connections owned by authenticated accounts only.
5. Pending auth intent as the mechanism for resuming gated flows after sign-in.

## 6) Hard Requirements

These requirements are actually necessary:

1. Authenticated requests must be verifiable server-side.
2. ChatGPT and OpenRouter connections must require Polynet authentication.
3. Account auth must stay distinct from community membership.
4. Free and Builder must remain separate entitlement outcomes.
5. Anonymous use must stay available for public chat.

## 7) Requirements To Question

These may be useful, but they are not obviously necessary in their current form:

1. Do anonymous actors really need durable `users` rows, or could they remain session-scoped until upgrade/sign-in?
2. Do profile/settings gateways need caller-supplied user ids at all when the session already defines the actor?
3. Does every post-auth resume flow need to share the same pending intent system, or should auth intent stay smaller and more generic?
4. Do we still need compatibility handling for `architect` and `pro` once legacy persisted rows are migrated or normalized server-side?

## 8) Recommended Execution Order

### Phase 1: lock verified-auth posture

Goal:
make real authenticated requests require verified identity.

Changes:

1. Document `ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT` as dev-only.
2. Audit all environments and code paths that still rely on it.
3. Fail closed on authenticated flows when verified identity is absent.

Acceptance:

1. production posture does not depend on unverified fallback
2. authenticated account actions are always backed by verified Convex identity

### Phase 2: remove dead client identity arguments

Goal:
reduce auth surface area and confusion.

Changes:

1. remove ignored `userId` params from shared gateways that already bootstrap authenticated actors
2. stop threading `getCloudAuthUid(...)` into calls that do not need it
3. keep `userId` only where the domain actually operates on public profile targets, not the caller identity

Acceptance:

1. fewer browser-side identity parameters
2. clearer distinction between caller identity and target resource id

### Phase 3: decide anonymous materialization posture

Goal:
either validate or simplify guest identity.

Options:

1. keep anonymous user rows and explicitly treat them as durable guest actors
2. move anonymous usage to a lighter session-scoped identity model

Recommendation:
defer a structural change unless it blocks memberships, but decide deliberately.

Acceptance:

1. anonymous identity semantics are explicit
2. memberships and account upgrades will not inherit guest ambiguity

### Phase 4: tighten auth intent scope

Goal:
make auth intent feel like auth resumption, not a catch-all workflow bus.

Changes:

1. classify existing pending auth intents into:
   - auth-required
   - billing-required
   - community-required
   - memory/profile convenience flows
2. delete any stale or low-value intent reasons
3. keep the rest only if they materially improve post-auth continuity

Acceptance:

1. auth intent list is smaller and easier to reason about
2. auth gate remains premium and legible

### Phase 5: restore the free-vs-builder runtime boundary

Goal:
make authenticated free access truthful.

Changes:

1. change authenticated cloud sends to default to `chat_only`
2. keep `requires_tools` as the only path into Daytona
3. preserve Builder-only tool access

Acceptance:

1. free authenticated users can chat without falling into Builder-grade tool gating
2. Builder remains the only tool tier

## 9) Ready-To-Move Checkpoint

We are ready to move from auth to memberships only after:

1. verified-auth posture is locked
2. dead identity arguments are removed from key shared gateways
3. free-vs-builder runtime boundary is truthful again

At that point the layering becomes clean:

1. auth proves account identity
2. tier proves account capability
3. membership proves community capability
4. runtime proves action legality

That is the correct foundation for community membership work.
