# Community Membership Access Re-Architecture Plan v1

Status: draft
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`
Scope: community membership, access, public funnel, members/admin projections, community creation gating
Non-goal: redesign the current community UI style

## 1) Irreducible Model

The community system should reduce to five truths:

1. `Community`
   - the branded container
   - the owner
   - the visibility
   - the entry policy
2. `Membership`
   - the only durable entitlement to the real community surface
3. `Pre-membership state`
   - request
   - invite
   - paid claim
4. `Access bundle`
   - one canonical answer to "what can this user do here right now?"
5. `Surface projection`
   - landing
   - members
   - chat
   - resources
   - settings

Everything else should be derived from those five truths.

## 2) Current Ground Truth

The current backend substrate is spread across:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/schema.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/schema.ts)
2. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityCore.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityCore.ts)
3. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityExperience.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityExperience.ts)
4. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityAdmin.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityAdmin.ts)
5. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityLifecycle.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityLifecycle.ts)
6. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/billing.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/billing.ts)

The current frontend projections are spread across:

1. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebCommunityAccessController.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebCommunityAccessController.ts)
2. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityAdminController.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityAdminController.ts)
3. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityMembersReviewController.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityMembersReviewController.ts)
4. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityMembersReviewLifecycle.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityMembersReviewLifecycle.ts)
5. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudPublicFunnelGateway.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudPublicFunnelGateway.ts)
6. [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx)

The current system is not fake. It already has a real shape:

1. `communityMemberships` is the current durable entitlement store.
2. join approvals, invites, and purchase claims all converge into membership creation.
3. `mapCommunityAccessRow(...)` is the current access snapshot.
4. the public landing and the real community surface are already separate.

The drift is not "nothing exists."
The drift is "too many overlapping truths and too much projection debt."

## 3) What To Preserve

These parts are worth preserving:

1. The current visual UI style.
2. The distinction between:
   - public landing
   - real community surface
3. `communityMemberships` as the durable entitlement substrate.
4. invite, request, and paid-claim flows as distinct entry paths.
5. server-derived access, not client-only access guessing.
6. owner/admin server-side enforcement for mutations.
7. the current public discovery and invite-link concepts.

Do not rewrite the workspace/runtime system for this.
Do not redesign the community UI for this.

## 4) What To Delete

These are the highest-signal deletions:

1. `freeJoinRequiresApproval` as a second entry-policy truth if we keep a canonical policy field.
2. `mod` role if it does not get real powers.
3. fake member billing/subscription fields in the members UI unless the backend stores them for real.
4. fake join-request fields such as `decided_at`, `decided_by`, and `denied_until` unless the backend stores them for real.
5. duplicate member-loading paths that return nearly the same shape.
6. client inference of paid-vs-free access from pricing rows when a canonical community access bundle should answer that directly.
7. UI-only Builder gating for community creation without server enforcement.
8. duplicated owner truth as both canonical owner state and implied membership state.

## 5) The Hard Recommendation

Do not do a blind full rewrite.

Do this instead:

1. Re-engineer the `community entitlement plane`.
2. Keep the current UI shell.
3. Cut over every surface to one backend access contract.
4. Delete everything that does not map to that contract.

This is the right scope because the community subsystem is where the product still has the most drift per line of code.

## 6) Canonical Product Decisions

These decisions should be locked before implementation:

### A. Paid community access

Recommendation:

Use `paid unlock` for now, not recurring subscription membership.

Why:

1. It matches what the system effectively does today.
2. It is much simpler than time-bounded membership entitlement.
3. It avoids fake `entitlement_ends_at` and fake subscription status on members.
4. It keeps the product legible while the community system is still stabilizing.

If true recurring paid membership is needed later, build it later as an explicit new contract.
Do not simulate it now.

### B. Owner truth

Recommendation:

`communities.ownerId` is the canonical owner truth.

That means:

1. owners do not need durable `communityMemberships` rows
2. owner rows can be synthesized in projections where needed
3. owner and membership stop being two overlapping persistent truths

### C. Role system

Recommendation:

Only keep:

1. `owner`
2. `admin`
3. `member`

Delete `mod` unless you define real powers for it now.

### D. Entry policy

Recommendation:

Replace the split `joinMode + freeJoinRequiresApproval + inferred paid plan behavior` with one canonical policy plus a derived UI funnel action:

1. `open`
2. `approval`
3. `paid_subscription`

Visibility stays separate from entry policy.

### E. Surface boundary

Recommendation:

1. public landing is a funnel
2. real community surface is an entitled surface
3. non-members do not partially inhabit the real community surface

## 7) Target Backend Contract

### A. Community

Canonical fields:

1. `ownerId`
2. `slug`
3. `name`
4. branding fields
5. `visibility`
6. `entryPolicy`
7. `createdAt`
8. `updatedAt`

`entryPolicy` should become the only entry-policy field.

### B. Membership

Keep `communityMemberships`, but make its semantics explicit:

1. `communityId`
2. `userId`
3. `role`
4. `source`
   - `free_join`
   - `approved_request`
   - `invite`
   - `claim`
   - `legacy`
5. `createdAt`
6. `updatedAt`

Do not add subscription metadata unless the product truly supports expiring membership.

### C. Join request

Either keep join requests thin, or make them real.

Recommendation:

Keep only:

1. `communityId`
2. `userId`
3. `status`
4. `message`
5. `createdAt`
6. `updatedAt`

Optional only if you truly need them:

1. `decidedAt`
2. `decidedByUserId`

Do not add `deniedUntil` unless cooldown is a deliberate product feature.

### D. Invite

Keep invites mostly as-is:

1. code
2. usage rules
3. expiry
4. createdBy

They are pre-membership state, not entitlement.

### E. Purchase claim

Keep claims mostly as-is for `paid_unlock`.

They should remain a separate pre-membership artifact that redeems into membership.

## 8) Canonical Access Bundle

Add one server query that every community surface uses.

Suggested shape:

1. `community_id`
2. `relation`
   - `visitor`
   - `pending`
   - `member`
   - `admin`
   - `owner`
3. `entry_policy`
4. `visibility`
5. `can_view_landing`
6. `can_enter_community`
7. `can_read_chat`
8. `can_post_chat`
9. `can_manage_resources`
10. `can_manage_members`
11. `primary_cta`
   - `sign_in`
   - `join`
   - `request_access`
   - `checkout`
   - `open_community`

Optional:

1. `join_request_status`
2. `is_entitled`
3. `effective_role`

Every surface should consume this same bundle:

1. landing
2. members
3. chat
4. resources
5. settings
6. invites

## 9) Required Backend Changes

### Phase 1: Policy and access foundation

Goal:
build the canonical access bundle without breaking the UI.

Changes:

1. add `entryPolicy` resolution in [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityCore.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityCore.ts)
2. add canonical `resolveCommunityAccessBundle(...)`
3. make `getMyCommunityAccess` and `getMyCommunityAccessBySlug` return that bundle
4. stop letting surfaces infer policy from multiple backend fields

Acceptance:

1. one server answer for current relation and CTA
2. landing, members, and chat can all consume the same truth

### Phase 2: Creation and ownership hardening

Goal:
make community creation and ownership trustworthy at the server layer.

Changes:

1. enforce Builder entitlement in [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityLifecycle.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityLifecycle.ts)
2. enforce `maxCommunities` on the server, not just in the UI
3. decide owner truth:
   - either keep owner membership rows temporarily and normalize them
   - or stop inserting new owner membership rows and synthesize owner in projections

Acceptance:

1. non-Builder users cannot create communities through direct RPC calls
2. owned-community limit cannot be bypassed
3. owner truth becomes singular

### Phase 3: Membership contract hardening

Goal:
make member rows truthful and small.

Changes:

1. add `source` to `communityMemberships`
2. stop projecting fake subscription metadata into member rows
3. make members/admin queries return one canonical member row shape

Suggested member row shape:

1. `community_id`
2. `user_id`
3. `role`
4. `source`
5. `created_at`

Acceptance:

1. members page renders real data only
2. no fake plan fields remain unless backed by schema

### Phase 4: Public funnel hardening

Goal:
make landing and join flows consume the same access model.

Changes:

1. resolve public landing from:
   - community branding
   - entry policy
   - active plan summary if `paid_unlock`
2. for authenticated users, resolve current relation and CTA from the canonical access bundle
3. remove policy inference from UI branches where possible

Acceptance:

1. landing CTA is always server-truthful
2. published visibility never implies chat access
3. request/join/checkout paths converge cleanly

### Phase 5: Members/admin projection hardening

Goal:
make members/admin a truthful projection of the backend.

Changes:

1. remove filter logic that depends on nonexistent subscription fields
2. keep role filter
3. only keep plan filter if member billing data becomes real
4. keep join request review only if the backend stores join request state explicitly enough
5. cut duplicate membership loaders

Acceptance:

1. members page is honest
2. admin mutations operate on one canonical member model

### Phase 6: Surface alignment

Goal:
make chat/resources/settings consume the same access bundle.

Changes:

1. chat uses `can_read_chat` and `can_post_chat`
2. resources use `can_manage_resources`
3. settings/members use `can_manage_members`

Acceptance:

1. no surface has its own hidden access logic

## 10) Frontend Adaptation Order

Do not redesign the UI.
Only make it truthful.

Order:

1. community access controller
   - [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebCommunityAccessController.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebCommunityAccessController.ts)
2. public landing flow
   - [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudPublicFunnelGateway.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudPublicFunnelGateway.ts)
   - [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx)
3. members/admin controller
   - [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityAdminController.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityAdminController.ts)
   - [`/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityMembersReviewController.ts`](/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityMembersReviewController.ts)
4. chat/resources/settings projections

That keeps the UI stable while the backend contract changes underneath it.

## 11) Migration Sequence

Do not do a big-bang rewrite.

Recommended migration:

1. add new canonical access resolver while keeping current queries alive
2. update web controllers to consume the new access bundle
3. add `source` to membership rows and backfill old rows as `legacy`
4. enforce Builder community creation on the server
5. cut fake member and join-request fields from the UI types
6. collapse duplicate member loaders
7. cut old policy fields after all reads have moved to `entryPolicy`
8. clean owner-row compatibility residue

## 12) Security and Reliability Rules

These should be treated as non-negotiable:

1. all community mutations must resolve caller identity server-side
2. no access decisions based solely on client role assumptions
3. no UI-only Builder gating
4. no client inference of entry policy when the server can answer it
5. no community surface rendering that implies entitlement when only landing visibility is true

## 13) Success Criteria

The re-architecture is done when:

1. community entry policy has one source of truth
2. community entitlement has one durable source of truth
3. owner truth has one canonical store
4. members page renders only real backend semantics
5. public landing, members, chat, resources, and settings all use the same access bundle
6. community creation is Builder-gated at the server
7. there are no fake subscription semantics in community access unless subscription actually exists

## 14) Recommended Next Implementation Slice

Do not start with chat.

Start with:

1. canonical `entryPolicy`
2. canonical `resolveCommunityAccessBundle(...)`
3. server-side Builder gating for `createCommunity`

That is the smallest slice that fixes the largest amount of drift.
