# System Surface Reduction Plan v1

## Goal

Reduce the platform to the fewest moving parts that still support the product truth:

1. Verified account identity
2. `free | builder` account tier
3. Project-bound Daytona runtime
4. Canonical community policy and access
5. Truthful recurring community pricing with grandfathered cohorts

Everything else should be either:

- a projection of those truths
- a temporary compatibility bridge
- or deleted

## Current Ground Truth

The system now has the right center:

- auth is verified and `authSubject`-based
- workspace/runtime is coherent
- `entryPolicy` is the canonical community policy
- `communityPricePoints` is the canonical sellable-price layer
- `communityMemberships` is the roster/access record
- `communitySubscriptions` is the recurring lifecycle layer
- community access is policy-aware, provenance-aware, and subscription-aware

That means the remaining work is mostly contraction, not invention.

## Reduction Principles

1. Delete compatibility mirrors as soon as the last consumer is off them.
2. Do not keep duplicate policy systems.
3. Do not keep duplicate owner truth.
4. Do not keep UI fields that are not backed by canonical data.
5. Do not add provider-specific billing logic until the provider-neutral lifecycle seam is stable.

## Keep

These are core and should remain:

- `convex/auth.ts`
- `convex/authIdentity.ts`
- `convex/gates.ts`
- `convex/httpRuntimeRoutes.ts`
- `convex/httpDaytona.ts`
- `convex/threads.ts`
- `convex/schema.ts`
- `convex/communityCore.ts`
- `convex/billing.ts`
- `entryPolicy`
- `communityPricePoints`
- `communitySubscriptions`
- current UI shell and visual language

## Delete

### Delete Next

These are legacy mirrors or redundant semantics and should be removed once the last consumer is migrated:

- `communities.joinMode`
- `communities.freeJoinRequiresApproval`
- UI dependence on `join_mode`
- UI dependence on `free_join_requires_approval`
- fallback join-mode derivation once all consumers use `entry_policy` directly

### Delete After Price-Point Backfill Is Run

- `communityPlans`
- pricing reads that prefer legacy `communityPlans`
- billing fallbacks that lazily create `communityPricePoints` from legacy plans

### Delete After Owner Model Is Unified

- owner membership rows as canonical truth
- synthetic owner row projection in manager lists

### Delete If No Real Requirement Appears

- any remaining `mod` residue
- compatibility aliases for `architect` / `pro`
- community-level fields or UI chips that imply per-member subscription analytics beyond actual backend truth

## Optimize

### 1. Policy Surface

Target:

- one canonical policy field: `entryPolicy`
- one canonical access query: `resolveCommunityAccessBundle(...)`

Action:

- move all remaining frontend/controller code to treat `entry_policy` as primary truth
- stop threading `join_mode` and `free_join_requires_approval` except as temporary compatibility output

### 2. Membership Surface

Target:

- one roster model
- one access model

Action:

- keep `communityMemberships` thin but truthful
- keep access provenance explicit:
  - `free_grant`
  - `manual_grant`
  - `paid_unlock`
  - `paid_subscription`
- keep recurring lifecycle in `communitySubscriptions`, not on the roster row itself

### 3. Billing Surface

Target:

- one immutable offer model
- one recurring lifecycle model

Action:

- run owned-community price-point backfill
- stop mutating pricing through legacy-only reads
- keep sellable price changes as new `communityPricePoints`, never in-place cohort mutation

### 4. Admin/Members Surface

Target:

- truthful roster and lifecycle view

Action:

- keep member metadata limited to what backend actually knows:
  - role
  - access source
  - subscription status
  - entitlement end
  - cohort price summary
- do not rebuild fake CRM or subscription analytics inside the members page

### 5. Lifecycle Sync Surface

Target:

- one provider-neutral mutation seam for recurring lifecycle updates

Action:

- keep `syncCommunitySubscriptionLifecycleInternal` as the internal seam
- when real provider wiring is added, route provider events into that seam or a close sibling
- do not add broad provider-specific UI or domain objects before that wiring exists

## Redundancy Map

### Current Redundant Truths

1. Community entry policy:
   - canonical: `entryPolicy`
   - redundant: `joinMode`, `freeJoinRequiresApproval`

2. Community price model:
   - canonical: `communityPricePoints`
   - redundant: `communityPlans`

3. Owner truth:
   - canonical candidate: `communities.ownerId`
   - redundant: owner membership row + synthetic owner projection

4. Membership visibility:
   - canonical: access bundle
   - redundant risk: direct membership-row checks in individual features

### Required Audit Rule

Before deleting a redundant surface, verify:

1. no remaining query depends on it
2. no remaining mutation writes it as primary truth
3. no UI derives behavior from it
4. migration/backfill exists if historical data still needs it

## Execution Order

### Phase 1: Finish Consumer Migration

- move remaining UI/controller consumers to `entry_policy`
- stop preferring `join_mode` and `free_join_requires_approval`

### Phase 2: Run Data Backfill

- run `backfillOwnedCommunityEntryPolicies`
- run `backfillOwnedCommunityPricePoints`

### Phase 3: Remove Legacy Policy Mirrors

- remove `joinMode`
- remove `freeJoinRequiresApproval`
- remove compatibility helpers that only exist for those fields

### Phase 4: Remove Legacy Pricing Mirrors

- remove `communityPlans`
- remove legacy plan fallback reads from billing/discovery/settings

### Phase 5: Unify Owner Truth

- make `communities.ownerId` the only canonical owner truth
- stop storing owner as a normal membership row, or treat owner membership rows as purely derived/migrated compatibility
- remove synthetic owner projection once no longer needed

## Risks

1. Deleting policy mirrors before all consumers move will break public/community routing.
2. Deleting `communityPlans` before price-point backfill will break older paid communities.
3. Unifying owner truth too early can break members/admin projections.
4. Subscription status changes must not silently rug-pull grandfathered cohorts.

## Best Next Steps

1. Run the owned-community backfills.
2. Migrate the last UI/controller consumers off `join_mode` / `free_join_requires_approval`.
3. Delete the legacy policy fields.
4. Then delete legacy pricing fields and fallbacks.
5. Then unify owner truth.

## Final Aim

The irreducible system should end up as:

- `authSubject`
- `free | builder`
- `project -> volume -> sandbox`
- `entryPolicy`
- `communityMemberships`
- `communityPricePoints`
- `communitySubscriptions`
- one access bundle

That is the smallest backend that still supports the current product truth.
