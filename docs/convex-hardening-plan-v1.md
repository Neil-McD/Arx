# Convex Hardening Plan v1

Status: active
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`
Scope: post-Supabase-cut hardening for the Convex-native platform

## 1) Current Position

The Daytona worktree is now operationally Convex-native:

1. The legacy provider surface has been cut out of the active worktree.
2. Identity, entitlements, communities, runtime turns, billing, and provider connections now route through Convex.
3. The primary system risk is no longer backend migration drift. It is complexity concentration plus contract drift.

Current weight-bearing files:

1. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx` (`6867` lines)
2. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts` (`4910` lines)
3. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/community.ts` (`3561` lines)
4. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/schema.ts` (`377` lines)

## 2) Irreducible Risks

There are four risks that matter materially:

1. Contract drift
   - Gateway calls, Convex validators, and UI loaders can silently diverge.
   - This already caused real failures in community members and analytics.
2. Identity namespace drift
   - Public/UI surfaces should use `authSubject`.
   - Internal joins may use Convex document IDs.
   - Mixing the two causes hydration and rendering bugs.
3. Monolith concentration
   - `App.tsx`, `convex/http.ts`, and `convex/community.ts` each carry too many responsibilities.
4. Documentation drift
   - Some docs still describe removed surfaces or pre-funding-source contracts.
   - That creates coordination errors during future work.

## 3) Hardening Goals

The next hardening cycle should optimize for:

1. Fail-closed contracts
2. One public identity rule
3. Lower-risk decomposition of the main monoliths
4. Canonical docs that match the actual platform

## 4) Execution Tracks

### Track A: Contract Hardening

Goal: make gateway/query/mutation drift hard to reintroduce.

Actions:

1. Add targeted guard scripts for high-risk contracts:
   - community admin/member analytics contract
   - runtime turn contract
   - verified identity contract
2. Require the baseline gate to run those guards.
3. Prefer structured backend failures over UI fallbacks that render empty state on backend contract errors.

Immediate target files:

1. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudCommunityAdminGateway.ts`
2. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/community.ts`
3. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/scripts/foundation_baseline_gate.sh`

### Track B: Identity Normalization

Goal: stop leaking internal Convex IDs into public/UI surfaces.

Rule:

1. Browser-facing user references must resolve to `authSubject`.
2. Internal Convex document IDs stay internal to server joins and mutations.

Priority targets:

1. community chat senders and reactions
2. members/admin surfaces
3. analytics/admin queries
4. any remaining profile-hydration or ownership surfaces that still return internal IDs

### Track C: Monolith Decomposition

Goal: reduce the blast radius of changes without rewriting the platform.

Planned decomposition:

1. Split `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/community.ts` into:
   - memberships
   - invites
   - resources
   - chat
   - settings
   - analytics
2. Split `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/http.ts` into:
   - auth/runtime bootstrap
   - public turn
   - runtime turn
   - provider helpers
   - platform inference helpers
3. Drain `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx` by moving:
   - community tab orchestration
   - settings orchestration
   - modal orchestration
   - analytics/admin loaders
   into smaller shell/controller surfaces

### Track D: Docs Alignment

Goal: one truthful contract set.

Rules:

1. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/docs/auth-money-access-matrix.md` is the active auth + funding contract.
2. Superseded pre-funding-source docs must be clearly marked as historical.
3. Docs must not describe removed UI surfaces such as `Library`.
4. Tier names must stay canonical: `free | builder`.

## 5) Execution Order

Order matters. The correct sequence is:

1. Contract hardening
2. Identity normalization
3. Monolith decomposition
4. Docs cleanup sweep after each material contract change

This order prevents decomposition work from spreading bad assumptions into more files.

## 6) Phase 1 Slice

Phase 1 is the community admin contract slice.

Definition:

1. Lock the `cloudCommunityAdminGateway -> convex/community.ts` contract with a guard.
2. Ensure members/admin and analytics/admin queries all accept optional `authSubject`.
3. Ensure admin membership rows resolve public user IDs instead of raw Convex user IDs.
4. Keep that guard in the foundation baseline gate.

Success criteria:

1. `bash scripts/community_admin_contract_guard.sh` passes
2. `bash scripts/foundation_baseline_gate.sh` passes
3. The community members/admin analytics regression class is guarded against reintroduction

## 7) What Not To Do

Do not spend this hardening cycle on:

1. new feature surfaces
2. new provider lanes
3. speculative schema rewrites
4. full message-system unification before contracts are stable

## 8) Next Execution Targets After Phase 1

Once the community admin contract slice is in:

1. add an identity-namespace guard for public user references
2. split `convex/community.ts` by domain
3. split `convex/http.ts` runtime surfaces
4. reduce `App.tsx` orchestration concentration
