# Convex Auth Scope Freeze (v1)

Date: 2026-03-03  
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`  
Branch: `codex/daytona-runtime`

## 1) Freeze Decision

Broad migration cuts are frozen.

Meaning:

1. No more cross-cutting controller/gateway deletions outside auth until auth architecture is settled.
2. Current migration status is treated as a stable checkpoint for auth design.

## 2) Checkpoint Validation

At freeze time, these passed:

1. `pnpm -C apps/web exec tsc --noEmit --pretty false`
2. `bash scripts/no_direct_cloud_auth_imports_guard.sh`
3. `bash scripts/convex_cut_runtime_guard.sh`
4. `bash scripts/convex_cut_surface_report.sh`

Current cut metrics:

1. `legacy_backend_markers_runtime_product=0`
2. `legacy_provider_marker_refs_repo_wide=0`
3. `legacy_function_transport_refs=0`
4. `legacy_function_slug_count=0`
5. `legacy_transport_ratio_pct=0.00`

## 3) Allowed Surface During Auth Phase

Only auth-focused surfaces should be edited next:

1. `shared/cloudAuthCore.ts`
2. `shared/cloudAuthFlow.ts`
3. `shared/cloudOAuthCallback.ts`
4. `shared/authSessionCore.ts`
5. `shared/authSessionFlow.ts`
6. `apps/web/src/cloudAuthClient.ts`
7. Auth wiring in `src/App.tsx` and `apps/web/src/App.tsx`
8. Any required Convex auth helpers (`shared/convexAuth*`, `convex/auth.ts`)

## 4) Deferred Until After Auth Plan

These are intentionally deferred:

1. Additional non-auth controller simplification cuts.
2. More runtime transport seam deletions unrelated to auth.
3. UX feature refactors not required for auth correctness.

