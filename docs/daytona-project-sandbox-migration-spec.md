# Daytona Project-Scoped Sandbox Migration Spec (V1)

Status: implemented (phases A-F complete)  
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`  
Goal: move from thread-scoped Daytona sandboxes to project-scoped sandboxes with clean UX and bounded cost.

## 1) First-Principles Contract

The irreducible model is:

1. User owns Projects (max 5).
2. Thread belongs to exactly one Project (for cloud chat/runtime threads).
3. Project owns one logical sandbox workspace.
4. Runtime run executes in the Project sandbox.
5. Many threads can share one Project sandbox.

V1 constraints:

1. No multi-project tool execution in a single thread.
2. Tool turns require a project-bound thread.
3. If a thread has no project, it is assigned to a per-user default project (`General`) before tool execution.

## 2) Current Ground Truth (Implemented)

1. Daytona lane is selected only when `requires_tools=true` and paid entitlement is present.
2. Sandbox reuse key is `user_id + project_id + provider=daytona`.
3. Cloud thread creation paths are project-scoped (default `General` project is assigned server-side when needed).
4. `daytona_sandboxes` is project-scoped (`project_id` required for `provider='daytona'`).
5. `runtime_runs` stores `thread_id` and `project_id`; Daytona lane requires non-null `project_id`.

## 3) Target Data Model

## 3.1 New table: `cloud_projects`

```sql
create table if not exists public.cloud_projects (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);
```

Notes:

1. `id` is `text` to match existing `threads.project_id` type and avoid risky type conversion now.
2. Use UUID string values for ids.
3. `slug` is user-local unique, for stable URLs/UI.

## 3.2 Threads binding

1. Keep `threads.project_id text`.
2. Add FK from `threads.project_id` to `cloud_projects.id` (nullable for compatibility during cutover).
3. Final V1 operational rule: all cloud chat threads must have non-null `project_id`.

## 3.3 Sandbox binding

Alter `daytona_sandboxes`:

1. Add `project_id text references cloud_projects(id)`.
2. Add unique constraint:
   - `unique (user_id, project_id, provider)` for active mapping.
3. Keep `provider_sandbox_id` unique.

## 3.4 Run binding

Alter `runtime_runs`:

1. Add `project_id text references cloud_projects(id)`.
2. For Daytona lane runs, `project_id` is required.
3. Keep `thread_id` for thread-specific traceability.

## 4) RLS / Security Contract

All new/changed tables remain owner-scoped:

1. `cloud_projects`: owner-only select/insert/update/delete.
2. `threads`: user can only set `project_id` to project owned by self.
3. `daytona_sandboxes`: owner-only; `project_id` must belong to owner.
4. `runtime_runs`: owner-only; for Daytona lane, `project_id` must belong to owner.

Do not allow cross-user project references through direct REST writes.

## 5) RPC/API Contract (Canonical)

## 5.1 Project RPCs

1. `create_cloud_project(p_name text)`  
Returns: `{ id, owner_id, name, slug, status, created_at, updated_at }`
2. `list_cloud_projects()`  
Returns owner projects ordered by `updated_at desc`.
3. `rename_cloud_project(p_project_id text, p_name text)`  
Returns updated row.
4. `archive_cloud_project(p_project_id text)`  
Soft archive only.
5. `delete_cloud_project(p_project_id text, p_force boolean default false)`  
If active threads exist and `p_force=false`, reject.

## 5.2 Quota RPC

`create_cloud_project` enforces max project count:

1. `active` project count per owner <= 5.
2. On exceed, throw `project_limit_exceeded`.

## 5.3 Thread project assignment

Reuse existing RPC path (`set_thread_context`) with stricter validation:

1. `p_update_project_id=true` requires project ownership validation.
2. For cloud chat threads, setting `project_id` null is disallowed after cutover.
3. Moving thread across projects is allowed in V1 only if no active run.

## 5.4 Runtime API contract

`runtime_turn` stays canonical runtime entrypoint.

Rules:

1. It derives `project_id` from the thread row (not trusted from client).
2. If `requires_tools=true` and `project_id` is null:
   - auto-assign `General` project (create if missing), or fail with `project_required` if auto-assign is disabled.
3. Daytona sandbox lookup key becomes:
   - `user_id + project_id + provider=daytona`
4. `runtime_runs.project_id` is written on run creation.

## 6) Runtime Behavior Changes

Replace:

1. `ensureDaytonaSandbox({ userId, threadId })`

With:

1. `ensureProjectSandbox({ userId, projectId })`

Expected behavior:

1. Reuse sandbox across all threads in the same project.
2. New project gets new sandbox on first tool run.
3. Free tier never gets Daytona lane.

## 7) UI/UX Contract

## 7.1 Sidebar model

1. Projects section (max 5).
2. Click project => show only threads for that project.
3. `New chat` inside project creates thread bound to that project.

## 7.2 Default project

1. Each user has one default project `General`.
2. Legacy cloud threads with null `project_id` are backfilled to `General`.

## 7.3 Cross-project behavior

V1:

1. One thread, one project.
2. No live tool operations across multiple projects in one thread.
3. Cross-project context is read-only artifact/reference import only.

## 8) Migration Plan (Phased)

## Phase A: Additive schema (safe)

1. Create `cloud_projects`.
2. Add `project_id` to `daytona_sandboxes`.
3. Add `project_id` to `runtime_runs`.
4. Add FKs/indexes/policies.
5. (Historical) legacy thread-scoped lookup was temporarily preserved during cutover.

## Phase B: Backfill + compatibility

1. Create per-user default `General` project where missing.
2. Backfill `threads.project_id` for cloud chat threads where null.
3. Backfill `daytona_sandboxes.project_id` from linked thread where possible.
4. Backfill `runtime_runs.project_id` from thread.

## Phase C: Runtime cutover

1. Switch `runtime_turn` sandbox lookup to project key.
2. Write `project_id` on all runs.
3. Keep fallback read path for legacy sandbox rows for one release window.

## Phase D: Client cutover

1. Ensure all cloud thread creation sets project_id.
2. Add project-required guard for tool turns.
3. Filter/group thread list by project as canonical.

## Phase E: Cleanup

1. Remove legacy thread-based sandbox lookup.
2. Tighten constraints (non-null where intended).

## Phase F: Final surface-area reduction

1. Drop `daytona_sandboxes.thread_id`.
2. Drop `idx_daytona_sandboxes_thread`.
3. Keep `runtime_runs.thread_id` for run traceability only.

## 9) Acceptance Tests

## 9.1 Data/constraint tests

1. User can create max 5 active projects; 6th fails with `project_limit_exceeded`.
2. User cannot bind thread to another user’s project.
3. `runtime_runs.project_id` always set for Daytona lane runs.

## 9.2 Runtime routing tests

1. Free tier + `requires_tools=true` => denied (no sandbox created).
2. Paid tier + `requires_tools=true` => Daytona lane with sandbox reuse by project.
3. Two threads same project => same sandbox row reused.
4. Two different projects => distinct sandbox rows.

## 9.3 Backfill tests

1. Legacy cloud threads with null project become assigned to `General`.
2. Existing behavior for non-tool free/public turns remains unchanged.

## 9.4 UX tests

1. New thread from active project is project-bound.
2. Project switch updates thread list and run context deterministically.
3. Tool turn without project never happens in final cutover path.

## 10) Rollout and Observability

Track per-day:

1. `runtime_runs` by lane and by project_id nullability.
2. Sandbox create vs reuse ratio.
3. Sandbox start latency and failure rate.
4. `project_limit_exceeded` frequency.

Rollback-safe points:

1. After Phase A (schema additive only).
2. After Phase B (data backfill only).
3. After Phase C can be toggled via feature flag in runtime lane resolver.

## 11) Implementation Checklist (Execution Order)

1. Add migration SQL for `cloud_projects`, sandbox/run `project_id`, RLS, indexes.
2. Add project RPC functions and quota guard.
3. Update `set_thread_context` ownership validation for `project_id`.
4. Update `runtime_turn` to resolve/require project and project-scoped sandboxing.
5. Update desktop+web thread creation to set project_id (never null for cloud chat).
6. Add regression tests for routing, entitlement, reuse key, and max-5 projects.
7. Update docs + matrix checks to enforce project-scoped invariant.

## 12) Definition of Done

Done means:

1. Sandbox identity is project-scoped in runtime and DB writes.
2. Cloud chat threads are project-bound by default.
3. Max-5 project rule is enforced server-side.
4. Existing free/public and paid/no-tools behavior is preserved.
5. Contract checks and runtime tests are green.
6. `daytona_sandboxes` no longer carries legacy thread-scoped identity.
